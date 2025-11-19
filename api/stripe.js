const {STRIPE_TEST_SECRET_API_KEY} = require('../env.json');
const logger = require('../logs/backendLaserLog');
const _logger = logger();

// Validate Stripe key is present
if (!STRIPE_TEST_SECRET_API_KEY) {
  _logger.error('STRIPE_TEST_SECRET_API_KEY is missing from env.json');
  throw new Error('Stripe secret key is not configured');
}

// Validate key format
if (!STRIPE_TEST_SECRET_API_KEY.startsWith('sk_test_') && !STRIPE_TEST_SECRET_API_KEY.startsWith('sk_live_')) {
  _logger.warn('Stripe key format may be invalid. Expected sk_test_ or sk_live_ prefix');
}

const stripe = require('stripe')(STRIPE_TEST_SECRET_API_KEY);

_logger.info('Stripe initialized', {
  keyPrefix: STRIPE_TEST_SECRET_API_KEY.substring(0, 8) + '...',
  keyType: STRIPE_TEST_SECRET_API_KEY.startsWith('sk_test_') ? 'test' : 'live'
});

/**
 * Create a Stripe Payment Intent
 * @param {number} amount - Amount in cents (e.g., 1999 = $19.99)
 * @param {string} currency - Currency code (default: 'usd')
 * @param {object} metadata - Optional metadata (e.g., contactid, orderid)
 * @returns {Promise<object>} Payment Intent object
 */
async function createPaymentIntent(amount, currency = 'usd', metadata = {}) {
  _logger.info('Creating payment intent', { amount, currency, metadata });
  
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount,
      currency: currency,
      metadata: metadata,
      automatic_payment_methods: {
        enabled: true,
      },
    });
    
    _logger.info('Payment intent created successfully', {
      paymentIntentId: paymentIntent.id,
      status: paymentIntent.status,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      clientSecret: paymentIntent.client_secret ? 'present' : 'missing'
    });
    
    return paymentIntent;
  } catch (error) {
    _logger.error('Error creating payment intent', {
      error: error.message,
      type: error.type,
      code: error.code,
      statusCode: error.statusCode,
      amount,
      currency,
      metadata
    });
    throw error;
  }
}

/**
 * Retrieve a Payment Intent by ID
 * @param {string} paymentIntentId - The payment intent ID
 * @returns {Promise<object>} Payment Intent object
 */
async function retrievePaymentIntent(paymentIntentId) {
  _logger.info('Retrieving payment intent', { paymentIntentId });
  
  try {
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    
    _logger.info('Payment intent retrieved successfully', {
      paymentIntentId: paymentIntent.id,
      status: paymentIntent.status,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      lastPaymentError: paymentIntent.last_payment_error ? {
        message: paymentIntent.last_payment_error.message,
        type: paymentIntent.last_payment_error.type,
        code: paymentIntent.last_payment_error.code
      } : null
    });
    
    return paymentIntent;
  } catch (error) {
    _logger.error('Error retrieving payment intent', {
      error: error.message,
      type: error.type,
      code: error.code,
      statusCode: error.statusCode,
      paymentIntentId
    });
    throw error;
  }
}

/**
 * Confirm a Payment Intent
 * @param {string} paymentIntentId - The payment intent ID
 * @param {object} paymentMethod - Payment method details
 * @returns {Promise<object>} Payment Intent object
 */
async function confirmPaymentIntent(paymentIntentId, paymentMethod) {
  _logger.info('Confirming payment intent', {
    paymentIntentId,
    paymentMethodId: paymentMethod?.id || paymentMethod,
    paymentMethodType: typeof paymentMethod
  });
  
  try {
    // First, retrieve the payment intent to check its current status
    const existingIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    
    _logger.info('Payment intent current status', {
      paymentIntentId: existingIntent.id,
      status: existingIntent.status,
      requiresAction: existingIntent.status === 'requires_action',
      requiresPaymentMethod: existingIntent.status === 'requires_payment_method'
    });

    // If already succeeded or processing, return it
    if (existingIntent.status === 'succeeded' || existingIntent.status === 'processing') {
      _logger.info('Payment intent already in final state', {
        paymentIntentId: existingIntent.id,
        status: existingIntent.status
      });
      return existingIntent;
    }

    // Handle payment method - it could be an ID string or an object
    let paymentMethodId = paymentMethod;
    if (typeof paymentMethod === 'object' && paymentMethod !== null) {
      paymentMethodId = paymentMethod.id || paymentMethod;
    }

    // Confirm the payment intent
    const paymentIntent = await stripe.paymentIntents.confirm(
      paymentIntentId,
      {
        payment_method: paymentMethodId,
      }
    );
    
    _logger.info('Payment intent confirmed successfully', {
      paymentIntentId: paymentIntent.id,
      status: paymentIntent.status,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      requiresAction: paymentIntent.status === 'requires_action',
      nextAction: paymentIntent.next_action
    });
    
    return paymentIntent;
  } catch (error) {
    _logger.error('Error confirming payment intent', {
      error: error.message,
      type: error.type,
      code: error.code,
      statusCode: error.statusCode,
      paymentIntentId,
      paymentMethodId: paymentMethod?.id || paymentMethod,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Create a Checkout Session
 * @param {number} amount - Amount in cents (e.g., 1999 = $19.99)
 * @param {string} currency - Currency code (default: 'usd')
 * @param {object} metadata - Optional metadata (e.g., contactid, orderid)
 * @param {string} successUrl - URL to redirect to on success
 * @param {string} cancelUrl - URL to redirect to on cancel
 * @param {array} lineItems - Optional line items array (alternative to amount)
 * @returns {Promise<object>} Checkout Session object
 */
async function createCheckoutSession(amount, currency = 'usd', metadata = {}, successUrl, cancelUrl, lineItems = null) {
  _logger.info('Creating checkout session', { 
    amount, 
    currency, 
    metadata,
    hasLineItems: !!lineItems,
    successUrl,
    cancelUrl
  });
  
  try {
    const sessionParams = {
      payment_method_types: ['card'],
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: metadata,
    };

    // Use line items if provided, otherwise use amount
    if (lineItems && lineItems.length > 0) {
      sessionParams.line_items = lineItems;
    } else {
      sessionParams.line_items = [{
        price_data: {
          currency: currency,
          product_data: {
            name: 'Laser Tag Order',
          },
          unit_amount: amount,
        },
        quantity: 1,
      }];
    }

    const session = await stripe.checkout.sessions.create(sessionParams);
    
    _logger.info('Checkout session created successfully', {
      sessionId: session.id,
      url: session.url,
      amount: amount,
      currency: currency
    });
    
    return session;
  } catch (error) {
    _logger.error('Error creating checkout session', {
      error: error.message,
      type: error.type,
      code: error.code,
      statusCode: error.statusCode,
      amount,
      currency,
      metadata
    });
    throw error;
  }
}

/**
 * Retrieve a Checkout Session by ID
 * @param {string} sessionId - The checkout session ID
 * @returns {Promise<object>} Checkout Session object
 */
async function retrieveCheckoutSession(sessionId) {
  _logger.info('Retrieving checkout session', { sessionId });
  
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    
    _logger.info('Checkout session retrieved successfully', {
      sessionId: session.id,
      status: session.status,
      paymentStatus: session.payment_status,
      amountTotal: session.amount_total
    });
    
    return session;
  } catch (error) {
    _logger.error('Error retrieving checkout session', {
      error: error.message,
      type: error.type,
      code: error.code,
      statusCode: error.statusCode,
      sessionId
    });
    throw error;
  }
}

/**
 * Verify webhook signature
 * @param {string} payload - Raw request body
 * @param {string} signature - Stripe signature header
 * @param {string} webhookSecret - Webhook secret from Stripe
 * @returns {object} Event object
 */
function verifyWebhookSignature(payload, signature, webhookSecret) {
  try {
    const event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
    _logger.info('Webhook signature verified', { eventType: event.type, eventId: event.id });
    return event;
  } catch (error) {
    _logger.error('Webhook signature verification failed', {
      error: error.message,
      signature: signature ? 'present' : 'missing'
    });
    throw error;
  }
}

module.exports = {
  stripe,
  createPaymentIntent,
  retrievePaymentIntent,
  confirmPaymentIntent,
  createCheckoutSession,
  retrieveCheckoutSession,
  verifyWebhookSignature
};
