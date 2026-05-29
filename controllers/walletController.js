// controllers/walletController.js
const crypto = require('crypto');
const { validationResult } = require('express-validator');
const emailService = require('../services/emailService');
const paystackService = require('../services/paystackService');
const { userRepository } = require('../repositories/supabase/userRepository');
const { walletRepository } = require('../repositories/supabase/walletRepository');
const { bookingRepository } = require('../repositories/supabase/bookingRepository');

const generateReference = (prefix = 'TXN') => {
  const timestamp = Date.now();
  const random = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `${prefix}_${timestamp}_${random}`;
};

const getId = (value) => {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (value._id) return String(value._id);
  if (value.id) return String(value.id);
  return String(value);
};

const getRepositoryStatus = (error) => {
  const message = error.message || '';
  if (message.includes('not found') || message.includes('not found')) return 404;
  if (
    message.includes('Insufficient balance') ||
    message.includes('already processed') ||
    message.includes('not eligible') ||
    message.includes('mismatch') ||
    message.includes('not refundable')
  ) {
    return 400;
  }
  return 500;
};

const getValidationErrors = (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array(), error: 'Validation failed' });
    return true;
  }
  return false;
};

exports.getWalletBalance = async (req, res) => {
  try {
    const wallet = await walletRepository.getWalletBalance(req.user._id);
    if (!wallet) return res.status(404).json({ error: 'User not found' });

    res.json({
      success: true,
      ...wallet
    });
  } catch (error) {
    console.error('Get wallet balance error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getTransactionHistory = async (req, res) => {
  try {
    if (getValidationErrors(req, res)) return;

    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;

    const { data, pagination } = await walletRepository.listTransactions({
      userId: req.user._id,
      type: req.query.type,
      page,
      limit
    });

    res.json({
      success: true,
      data,
      pagination
    });
  } catch (error) {
    console.error('Get transaction history error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.initializePayment = async (req, res) => {
  try {
    if (getValidationErrors(req, res)) return;

    if (!paystackService.isConfigured()) {
      return res.status(503).json({ error: 'Payment service is not configured' });
    }

    const amount = parseFloat(req.body.amount);
    if (Number.isNaN(amount) || amount < 100) {
      return res.status(400).json({ error: 'Minimum amount is NGN 100' });
    }
    if (amount > 10_000_000) {
      return res.status(400).json({ error: 'Maximum amount is NGN 10,000,000' });
    }

    const user = await userRepository.findById(req.user._id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const reference = generateReference('DEP');
    const paystackData = await paystackService.initializeTransaction(
      user.email,
      amount,
      reference,
      { userId: String(user._id), purpose: 'wallet_topup' }
    );

    if (!paystackData.status) {
      return res.status(400).json({ error: paystackData.message || 'Failed to initialize payment' });
    }

    await walletRepository.createTransaction({
      userId: user._id,
      type: 'credit',
      amount,
      currency: 'NGN',
      description: 'Wallet top-up via Paystack',
      reference,
      status: 'pending',
      metadata: { paymentMethod: 'paystack' }
    });

    res.json({
      success: true,
      data: {
        authorizationUrl: paystackData.data.authorization_url,
        accessCode: paystackData.data.access_code,
        reference,
        amount
      }
    });
  } catch (error) {
    console.error('Initialize payment error:', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

exports.verifyPayment = async (req, res) => {
  try {
    const { reference } = req.body;
    if (!reference) {
      return res.status(400).json({ error: 'Transaction reference is required' });
    }

    if (!paystackService.isConfigured()) {
      return res.status(503).json({ error: 'Payment service is not configured' });
    }

    const existingTx = await walletRepository.findByReference(reference);
    if (!existingTx) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    if (getId(existingTx.user) !== String(req.user._id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (existingTx.status === 'completed') {
      const wallet = await walletRepository.getWalletBalance(req.user._id);
      return res.json({
        success: true,
        message: 'Payment already verified and credited',
        data: { balance: wallet?.balance || 0 }
      });
    }
    if (existingTx.status !== 'pending') {
      return res.status(400).json({ error: 'Transaction is no longer eligible for verification' });
    }

    const paystackData = await paystackService.verifyTransaction(reference);
    if (!paystackData.status || paystackData.data.status !== 'success') {
      await walletRepository.updateStatusByReference(reference, 'failed');
      return res.status(400).json({
        error: 'Payment verification failed',
        paystackStatus: paystackData.data?.status
      });
    }

    const expectedKobo = Math.round(existingTx.amount * 100);
    const receivedKobo = paystackData.data.amount;
    if (receivedKobo !== expectedKobo) {
      console.error(`[verifyPayment] Amount mismatch for ref ${reference}: expected ${expectedKobo} kobo, got ${receivedKobo} kobo`);
      return res.status(400).json({
        error: 'Payment amount does not match the initialised transaction. Verification rejected.'
      });
    }

    const meta = paystackData.data.metadata || {};
    if (String(meta.userId) !== String(req.user._id)) {
      console.error(`[verifyPayment] Metadata userId mismatch for ref ${reference}: expected ${req.user._id}, got ${meta.userId}`);
      return res.status(400).json({ error: 'Payment metadata does not match the current user.' });
    }
    if (meta.purpose !== 'wallet_topup') {
      console.error(`[verifyPayment] Metadata purpose mismatch for ref ${reference}: got "${meta.purpose}"`);
      return res.status(400).json({ error: 'Payment metadata purpose is invalid.' });
    }

    const paystackEmail = (paystackData.data.customer?.email || '').toLowerCase().trim();
    const userEmail = (req.user.email || '').toLowerCase().trim();
    if (paystackEmail !== userEmail) {
      console.error(`[verifyPayment] Customer email mismatch for ref ${reference}: expected ${userEmail}, got ${paystackEmail}`);
      return res.status(400).json({ error: 'Payment customer email does not match the current user.' });
    }

    const previousWallet = await walletRepository.getWalletBalance(req.user._id);
    const result = await walletRepository.creditPendingTopup({
      userId: req.user._id,
      reference,
      amount: existingTx.amount
    });

    if (!result.alreadyCompleted) {
      emailService.sendFundsAddedConfirmation(
        {
          amount: existingTx.amount,
          reference,
          previousBalance: previousWallet?.balance || 0,
          newBalance: result.balance
        },
        req.user.email,
        req.user.name
      ).catch((err) => console.error('Funds added email error:', err));
    }

    res.json({
      success: true,
      message: result.alreadyCompleted ? 'Payment already verified and credited' : 'Payment verified and wallet credited',
      data: {
        balance: result.balance,
        currency: result.currency || 'NGN',
        amountAdded: existingTx.amount
      }
    });
  } catch (error) {
    console.error('Verify payment error:', error);
    res.status(getRepositoryStatus(error)).json({ error: error.message || 'Server error' });
  }
};

exports.addFunds = async (req, res) => {
  // Completely block this endpoint in production to prevent self-crediting
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({
      error: 'Manual wallet funding is not available in production. Use /api/wallet/initialize-payment.',
      useEndpoint: '/api/wallet/initialize-payment'
    });
  }

  if (paystackService.isConfigured()) {
    return res.status(400).json({
      error: 'Please use /api/wallet/initialize-payment to fund your wallet via Paystack',
      useEndpoint: '/api/wallet/initialize-payment'
    });
  }

  try {
    if (getValidationErrors(req, res)) return;

    const amount = parseFloat(req.body.amount);
    if (Number.isNaN(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Amount must be a positive number' });
    }
    if (amount > 10_000_000) {
      return res.status(400).json({ error: 'Amount exceeds maximum allowed (NGN 10,000,000)' });
    }

    const user = await userRepository.findById(req.user._id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const reference = generateReference('DEP');
    const result = await walletRepository.createManualCredit({
      userId: req.user._id,
      amount,
      currency: user.wallet?.currency || 'NGN',
      reference,
      description: 'Added funds to wallet (test mode)',
      metadata: { paymentMethod: 'manual' }
    });

    emailService.sendFundsAddedConfirmation(
      {
        amount,
        reference,
        previousBalance: user.wallet?.balance || 0,
        newBalance: result.balance
      },
      user.email,
      user.name
    ).catch((err) => console.error('Funds added email error:', err));

    res.json({
      success: true,
      data: { balance: result.balance, currency: result.currency || 'NGN' },
      message: 'Funds added successfully (test mode)'
    });
  } catch (error) {
    console.error('Add funds error:', error);
    res.status(getRepositoryStatus(error)).json({ error: error.message || 'Server error' });
  }
};

exports.withdrawFunds = async (req, res) => {
  try {
    if (getValidationErrors(req, res)) return;

    if (!paystackService.isConfigured()) {
      return res.status(503).json({ error: 'Payment service is not configured' });
    }

    const { amount, accountNumber, bankCode, accountName } = req.body;
    const withdrawAmount = parseFloat(amount);

    if (Number.isNaN(withdrawAmount) || withdrawAmount < 100) {
      return res.status(400).json({ error: 'Minimum withdrawal is NGN 100' });
    }

    const wallet = await walletRepository.getWalletBalance(req.user._id);
    if (!wallet) return res.status(404).json({ error: 'User not found' });
    if (wallet.balance < withdrawAmount) {
      return res.status(400).json({
        error: 'Insufficient balance',
        balance: wallet.balance,
        requested: withdrawAmount
      });
    }

    const recipientData = await paystackService.createTransferRecipient(
      accountName,
      accountNumber,
      bankCode
    );

    if (!recipientData.status) {
      return res.status(400).json({ error: recipientData.message || 'Failed to create transfer recipient' });
    }

    const recipientCode = recipientData.data.recipient_code;
    const reference = generateReference('WTH');
    const debitResult = await walletRepository.createWithdrawalDebit({
      userId: req.user._id,
      amount: withdrawAmount,
      currency: wallet.currency || 'NGN',
      reference,
      description: `Withdrawal to ${accountName} (${accountNumber}) at ${bankCode}`,
      metadata: {
        paymentMethod: 'bank_transfer',
        recipientCode,
        accountNumber,
        bankCode,
        accountName
      }
    });

    try {
      const transferData = await paystackService.initiateTransfer(
        withdrawAmount,
        recipientCode,
        reference,
        `Connectify wallet withdrawal - ${req.user.name}`
      );

      if (transferData.status) {
        await walletRepository.updateStatusByReference(
          reference,
          transferData.data?.status === 'success' ? 'completed' : 'pending'
        );
      }

      res.json({
        success: true,
        message: 'Withdrawal initiated. Funds will be transferred to your bank account.',
        data: {
          reference,
          amount: withdrawAmount,
          accountNumber,
          accountName,
          newBalance: debitResult.balance,
          transferStatus: transferData.data?.status || 'pending'
        }
      });
    } catch (transferError) {
      console.error('Paystack transfer failed, refunding:', transferError);
      await walletRepository.refundWithdrawal({
        userId: req.user._id,
        reference
      });
      throw new Error('Transfer initiation failed. Your balance has been refunded.');
    }
  } catch (error) {
    console.error('Withdraw funds error:', error);
    res.status(getRepositoryStatus(error)).json({ error: error.message || 'Server error' });
  }
};

exports.listBanks = async (req, res) => {
  try {
    if (!paystackService.isConfigured()) {
      return res.status(503).json({ error: 'Payment service is not configured' });
    }

    const data = await paystackService.listBanks();

    res.json({
      success: true,
      data: data.data || []
    });
  } catch (error) {
    console.error('List banks error:', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

exports.resolveAccount = async (req, res) => {
  try {
    const { accountNumber, bankCode } = req.body;
    if (!accountNumber || !bankCode) {
      return res.status(400).json({ error: 'accountNumber and bankCode are required' });
    }

    if (!paystackService.isConfigured()) {
      return res.status(503).json({ error: 'Payment service is not configured' });
    }

    const data = await paystackService.resolveAccount(accountNumber, bankCode);

    if (!data.status) {
      return res.status(400).json({ error: data.message || 'Could not resolve account' });
    }

    res.json({
      success: true,
      data: {
        accountName: data.data.account_name,
        accountNumber: data.data.account_number,
        bankId: data.data.bank_id
      }
    });
  } catch (error) {
    console.error('Resolve account error:', error);
    const status = error.response?.status === 422 ? 422 : 500;
    const message = error.response?.data?.message || error.message || 'Server error';
    res.status(status).json({ error: message });
  }
};

exports.processBookingPayment = async (req, res) => {
  try {
    if (getValidationErrors(req, res)) return;

    const { bookingId } = req.body;
    const booking = await bookingRepository.findById(bookingId);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    if (getId(booking.customer) !== String(req.user._id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (booking.paymentStatus !== 'pending') {
      return res.status(400).json({ error: 'Payment already processed' });
    }

    const wallet = await walletRepository.getWalletBalance(req.user._id);
    if (!wallet || wallet.balance < booking.totalAmount) {
      return res.status(400).json({
        error: 'Insufficient balance',
        balance: wallet?.balance || 0,
        required: booking.totalAmount
      });
    }

    const customerReference = generateReference('PAY');
    const providerReference = generateReference('RECV');
    const result = await walletRepository.processBookingPayment({
      bookingId,
      customerId: req.user._id,
      customerReference,
      providerReference
    });

    const updatedBooking = await bookingRepository.findById(bookingId);
    const provider = booking.provider;
    const service = booking.service;

    emailService.sendPaymentReceipt(
      {
        amount: booking.totalAmount,
        reference: customerReference,
        serviceName: service?.name,
        providerName: provider?.name,
        bookingId: String(booking._id),
        previousBalance: wallet.balance,
        newBalance: result.customerBalance
      },
      req.user.email,
      req.user.name
    ).catch((err) => console.error('Customer payment email error:', err));

    if (provider?.email) {
      emailService.sendPaymentReceived(
        {
          amount: booking.totalAmount,
          reference: providerReference,
          serviceName: service?.name,
          customerName: req.user.name,
          bookingId: String(booking._id),
          previousBalance: provider.wallet?.balance || 0,
          newBalance: result.providerBalance
        },
        provider.email,
        provider.name
      ).catch((err) => console.error('Provider payment email error:', err));
    }

    res.json({
      success: true,
      message: 'Payment processed successfully',
      booking: updatedBooking || { ...booking, paymentStatus: 'paid' }
    });
  } catch (error) {
    console.error('Process booking payment error:', error);
    res.status(getRepositoryStatus(error)).json({ error: error.message || 'Server error' });
  }
};
