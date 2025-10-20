// See your keys here: https://dashboard.stripe.com/apikeys
const {STRIPE_TEST_API_KEY} = require('../env.json');
const stripe = require('stripe')(STRIPE_TEST_API_KEY);

async function updateStripeAccount(accountId) {
  try {
    const account = await stripe.v2.core.accounts.get("");
    return account;
  } catch (error) {
    console.error('Error updating Stripe account:', error);
    throw error;
  }
}

module.exports = { stripe, updateStripeAccount };