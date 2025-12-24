/**
 * Security Hardening Module for LaserTags Backend
 * 
 * Implements security best practices for production deployment
 */

const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { CORS_ORIGINS, NODE_ENV, STRIPE_WEBHOOK_SECRET } = require('../env.json');

/**
 * Configure Helmet for security headers
 * @param {Express} app - Express application instance
 */
function configureHelmet(app) {
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "https:"],
        scriptSrc: ["'self'"],
        connectSrc: [
          "'self'",
          "https://api.stripe.com",
          "https://js.stripe.com"
        ],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"]
      }
    },
    crossOriginEmbedderPolicy: false, // Allow Stripe integration
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    },
    noSniff: true,
    frameguard: { action: 'deny' },
    xssFilter: true
  }));
}

/**
 * Configure rate limiting
 * @param {Express} app - Express application instance
 */
function configureRateLimit(app) {
  // General API rate limit
  const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: {
      error: 'Too many requests',
      retryAfter: '15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false,
    // Skip rate limiting for webhooks
    skip: (req) => req.path === '/stripeWebhook'
  });
  
  // Strict rate limit for order creation
  const orderLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5, // Limit to 5 orders per hour per IP
    message: {
      error: 'Order creation rate limit exceeded',
      retryAfter: '1 hour'
    },
    standardHeaders: true,
    legacyHeaders: false
  });
  
  // Stripe payment rate limit
  const paymentLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // 10 payment attempts per hour
    message: {
      error: 'Payment rate limit exceeded',
      retryAfter: '1 hour'
    }
  });
  
  // Contact creation rate limit
  const contactLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 20, // 20 contacts per hour per IP
    message: {
      error: 'Contact creation rate limit exceeded',
      retryAfter: '1 hour'
    }
  });
  
  app.use(generalLimiter);
  app.use('/createOrder', orderLimiter);
  app.use('/stripePayment', paymentLimiter);
  app.use('/saveContact', contactLimiter);
}

/**
 * Configure CORS with security
 * @param {Express} app - Express application instance
 */
function configureCORS(app) {
  const cors = require('cors');
  
  const allowedOrigins = CORS_ORIGINS ? CORS_ORIGINS.split(',') : [
    'http://localhost:3000',
    'http://localhost:5173',
    'https://lasertags.com',
    'https://www.lasertags.com'
  ];
  
  const corsOptions = {
    origin: function (origin, callback) {
      // Allow requests with no origin (mobile apps, etc.)
      if (!origin) return callback(null, true);
      
      if (allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        console.warn(`CORS blocked origin: ${origin}`);
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'stripe-signature'
    ],
    credentials: true,
    optionsSuccessStatus: 200
  };
  
  app.use(cors(corsOptions));
}

/**
 * Input sanitization middleware
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 * @param {function} next - Next middleware function
 */
function sanitizeInput(req, res, next) {
  // Skip webhook routes that need raw body
  if (req.path === '/stripeWebhook') {
    return next();
  }
  
  function sanitize(obj) {
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        if (typeof obj[key] === 'string') {
          // Basic XSS prevention
          obj[key] = obj[key]
            .replace(/[<>]/g, '')
            .replace(/javascript:/gi, '')
            .replace(/on\w+=/gi, '')
            .trim();
        } else if (typeof obj[key] === 'object' && obj[key] !== null) {
          sanitize(obj[key]);
        }
      }
    }
  }
  
  if (req.body) sanitize(req.body);
  if (req.query) sanitize(req.query);
  if (req.params) sanitize(req.params);
  
  next();
}

/**
 * Request logging middleware for security monitoring
 * @param {object} logger - Logger instance
 */
function createSecurityLogger(logger) {
  return (req, res, next) => {
    const start = Date.now();
    const clientIP = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('user-agent') || '';
    
    // Log suspicious patterns
    const suspiciousPatterns = [
      /\.\./,  // Path traversal
      /<script/i, // XSS attempts
      /union\s+select/i, // SQL injection
      /or\s+1=1/i, // SQL injection
      /drop\s+table/i, // SQL injection
      /exec\(/i, // Code execution
      /eval\(/i, // Code execution
    ];
    
    const url = req.originalUrl || req.url;
    const body = JSON.stringify(req.body || {});
    
    const isSuspicious = suspiciousPatterns.some(pattern => 
      pattern.test(url) || pattern.test(body) || pattern.test(userAgent)
    );
    
    if (isSuspicious) {
      logger.warn('Suspicious request detected', {
        ip: clientIP,
        method: req.method,
        url: url,
        userAgent: userAgent,
        body: req.body,
        headers: req.headers
      });
    }
    
    res.on('finish', () => {
      const duration = Date.now() - start;
      
      if (req.path !== '/stripeWebhook') { // Don't log webhook details
        logger.info('Request processed', {
          ip: clientIP,
          method: req.method,
          url: url,
          statusCode: res.statusCode,
          duration: `${duration}ms`,
          userAgent: userAgent.substring(0, 100) // Truncate for logs
        });
      }
    });
    
    next();
  };
}

/**
 * Database security middleware
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 * @param {function} next - Next middleware function
 */
function databaseSecurity(req, res, next) {
  // Validate and sanitize database inputs
  const sensitiveFields = ['contactid', 'orderid', 'stripe_payment_intent_id'];
  
  sensitiveFields.forEach(field => {
    if (req.body[field]) {
      // Remove any SQL injection attempts
      const value = req.body[field].toString();
      if (/['";\\--]/g.test(value)) {
        return res.status(400).json({
          error: 'Invalid input detected',
          field: field
        });
      }
    }
  });
  
  next();
}

/**
 * Stripe webhook signature validation
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 * @param {function} next - Next middleware function
 */
function validateStripeWebhook(req, res, next) {
  if (req.path !== '/stripeWebhook') {
    return next();
  }
  
  const signature = req.headers['stripe-signature'];
  
  if (!signature) {
    return res.status(401).json({
      error: 'Missing stripe signature'
    });
  }
  
  if (!STRIPE_WEBHOOK_SECRET) {
    return res.status(500).json({
      error: 'Webhook secret not configured'
    });
  }
  
  // The actual signature verification is done in the webhook handler
  next();
}

/**
 * Configure all security middleware
 * @param {Express} app - Express application instance
 * @param {object} logger - Logger instance
 */
function applySecurity(app, logger) {
  console.log('🔒 Applying security hardening...');
  
  // Trust proxy if behind reverse proxy (production)
  if (NODE_ENV === 'production') {
    app.set('trust proxy', 1);
  }
  
  // Apply security middleware in order
  configureHelmet(app);
  configureCORS(app);
  configureRateLimit(app);
  
  app.use(sanitizeInput);
  app.use(createSecurityLogger(logger));
  app.use(databaseSecurity);
  app.use(validateStripeWebhook);
  
  // Error handling for security violations
  app.use((err, req, res, next) => {
    if (err.message === 'Not allowed by CORS') {
      return res.status(403).json({
        error: 'CORS policy violation'
      });
    }
    
    if (err.type === 'entity.too.large') {
      return res.status(413).json({
        error: 'Request too large'
      });
    }
    
    logger.error('Security middleware error', {
      error: err.message,
      stack: err.stack,
      ip: req.ip,
      url: req.originalUrl
    });
    
    res.status(500).json({
      error: 'Internal server error'
    });
  });
  
  console.log('✅ Security hardening applied successfully');
}

module.exports = {
  applySecurity,
  configureHelmet,
  configureRateLimit,
  configureCORS,
  sanitizeInput,
  createSecurityLogger,
  databaseSecurity,
  validateStripeWebhook
};