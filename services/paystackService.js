// services/paystackService.js
const axios = require('axios');

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const PAYSTACK_BASE_URL = 'https://api.paystack.co';

const paystackRequest = async (method, endpoint, data = null) => {
  if (!PAYSTACK_SECRET_KEY) {
    throw new Error('Paystack secret key is not configured');
  }

  const config = {
    method,
    url: `${PAYSTACK_BASE_URL}${endpoint}`,
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
  };

  if (data) config.data = data;

  const response = await axios(config);
  return response.data;
};

/**
 * Initialize a Paystack transaction (for adding funds)
 * @param {string} email - Customer email
 * @param {number} amountNaira - Amount in Naira (we convert to kobo)
 * @param {string} reference - Unique transaction reference
 * @param {object} metadata - Additional metadata
 */
exports.initializeTransaction = async (email, amountNaira, reference, metadata = {}) => {
  const amountKobo = Math.round(amountNaira * 100); // Paystack uses kobo

  const response = await paystackRequest('POST', '/transaction/initialize', {
    email,
    amount: amountKobo,
    reference,
    currency: 'NGN',
    callback_url: process.env.PAYSTACK_CALLBACK_URL || `${process.env.FRONTEND_URL}/wallet/verify`,
    metadata: {
      cancel_action: `${process.env.FRONTEND_URL}/wallet/add-funds`,
      ...metadata,
    },
  });

  return response;
};

/**
 * Verify a Paystack transaction
 * @param {string} reference - Transaction reference to verify
 */
exports.verifyTransaction = async (reference) => {
  const response = await paystackRequest('GET', `/transaction/verify/${reference}`);
  return response;
};

/**
 * List Nigerian banks supported by Paystack
 */
exports.listBanks = async () => {
  const response = await paystackRequest('GET', '/bank?currency=NGN&type=nuban&perPage=100');
  return response;
};

/**
 * Resolve (verify) a Nigerian bank account number
 * @param {string} accountNumber
 * @param {string} bankCode - Paystack bank code
 */
exports.resolveAccount = async (accountNumber, bankCode) => {
  const response = await paystackRequest(
    'GET',
    `/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`
  );
  return response;
};

/**
 * Create a transfer recipient (for withdrawals)
 * @param {string} accountName
 * @param {string} accountNumber
 * @param {string} bankCode
 */
exports.createTransferRecipient = async (accountName, accountNumber, bankCode) => {
  const response = await paystackRequest('POST', '/transferrecipient', {
    type: 'nuban',
    name: accountName,
    account_number: accountNumber,
    bank_code: bankCode,
    currency: 'NGN',
  });
  return response;
};

/**
 * Initiate a transfer (withdrawal)
 * @param {number} amountNaira - Amount in Naira
 * @param {string} recipientCode - Paystack recipient code
 * @param {string} reference - Unique reference
 * @param {string} reason - Transfer reason/note
 */
exports.initiateTransfer = async (amountNaira, recipientCode, reference, reason = 'Wallet Withdrawal') => {
  const amountKobo = Math.round(amountNaira * 100);

  const response = await paystackRequest('POST', '/transfer', {
    source: 'balance',
    amount: amountKobo,
    recipient: recipientCode,
    reason,
    reference,
    currency: 'NGN',
  });

  return response;
};

/**
 * Verify a transfer status
 * @param {string} reference
 */
exports.verifyTransfer = async (reference) => {
  const response = await paystackRequest('GET', `/transfer/verify/${reference}`);
  return response;
};

/**
 * Delete a transfer recipient
 * @param {string} recipientId
 */
exports.deleteTransferRecipient = async (recipientId) => {
  const response = await paystackRequest('DELETE', `/transferrecipient/${recipientId}`);
  return response;
};

/**
 * Check if Paystack is configured
 */
exports.isConfigured = () => !!process.env.PAYSTACK_SECRET_KEY;
