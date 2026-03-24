// controllers/walletController.js
const WalletTransaction = require('../models/WalletTransaction');
const User = require('../models/User');
const Booking = require('../models/Booking');
const mongoose = require('mongoose');
const emailService = require('../services/emailService');
const paystackService = require('../services/paystackService');
const { validationResult } = require('express-validator');
const crypto = require('crypto');

// ─── Helper ─────────────────────────────────────────────────────────────────

const generateReference = (prefix = 'TXN') => {
  const timestamp = Date.now();
  const random = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `${prefix}_${timestamp}_${random}`;
};

// ─── GET /api/wallet/balance ─────────────────────────────────────────────────

exports.getWalletBalance = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    res.json({
      success: true,
      balance: user.wallet.balance,
      currency: user.wallet.currency || 'NGN',
      availableBalance: user.wallet.balance,
    });
  } catch (error) {
    console.error('Get wallet balance error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// ─── GET /api/wallet/transactions ────────────────────────────────────────────

exports.getTransactionHistory = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array(), error: 'Validation failed' });
    }

    const page  = parseInt(req.query.page)  || 1;
    const limit = parseInt(req.query.limit) || 10;
    const type  = req.query.type; // 'credit' | 'debit'

    const query = { user: req.user._id };
    if (type) query.type = type;

    const [transactions, total] = await Promise.all([
      WalletTransaction.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      WalletTransaction.countDocuments(query),
    ]);

    res.json({
      success: true,
      data: transactions,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Get transaction history error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// ─── POST /api/wallet/initialize-payment ─────────────────────────────────────
// Step 1 of "Add Funds": generate Paystack checkout URL

exports.initializePayment = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array(), error: 'Validation failed' });
    }

    if (!paystackService.isConfigured()) {
      return res.status(503).json({ error: 'Payment service is not configured' });
    }

    const amount = parseFloat(req.body.amount);
    if (isNaN(amount) || amount < 100) {
      return res.status(400).json({ error: 'Minimum amount is ₦100' });
    }
    if (amount > 10_000_000) {
      return res.status(400).json({ error: 'Maximum amount is ₦10,000,000' });
    }

    const user = await User.findById(req.user._id);
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

    // Create a pending transaction record immediately so we can match it on verification
    await WalletTransaction.create({
      user: user._id,
      type: 'credit',
      amount,
      currency: 'NGN',
      description: 'Wallet top-up via Paystack',
      reference,
      status: 'pending',
      metadata: { paymentMethod: 'paystack' },
    });

    res.json({
      success: true,
      data: {
        authorizationUrl: paystackData.data.authorization_url,
        accessCode: paystackData.data.access_code,
        reference,
        amount,
      },
    });
  } catch (error) {
    console.error('Initialize payment error:', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

// ─── POST /api/wallet/verify-payment ─────────────────────────────────────────
// Step 2 of "Add Funds": called after Paystack redirects back

exports.verifyPayment = async (req, res) => {
  try {
    const { reference } = req.body;
    if (!reference) {
      return res.status(400).json({ error: 'Transaction reference is required' });
    }

    if (!paystackService.isConfigured()) {
      return res.status(503).json({ error: 'Payment service is not configured' });
    }

    // Prevent double-processing by checking existing record
    const existingTx = await WalletTransaction.findOne({ reference });
    if (!existingTx) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    if (existingTx.status === 'completed') {
      return res.json({
        success: true,
        message: 'Payment already verified and credited',
        data: { balance: (await User.findById(req.user._id)).wallet.balance },
      });
    }
    // Ownership check
    if (String(existingTx.user) !== String(req.user._id)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Verify with Paystack
    const paystackData = await paystackService.verifyTransaction(reference);

    if (!paystackData.status || paystackData.data.status !== 'success') {
      await WalletTransaction.findByIdAndUpdate(existingTx._id, { status: 'failed' });
      return res.status(400).json({
        error: 'Payment verification failed',
        paystackStatus: paystackData.data?.status,
      });
    }

    const verifiedAmountNaira = paystackData.data.amount / 100; // convert kobo → naira

    // Atomic update: credit wallet + mark transaction completed
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const user = await User.findById(req.user._id).session(session);
      if (!user) throw new Error('User not found');

      const previousBalance = user.wallet.balance;
      user.wallet.balance += verifiedAmountNaira;
      await user.save({ session });

      await WalletTransaction.findByIdAndUpdate(
        existingTx._id,
        { status: 'completed', amount: verifiedAmountNaira },
        { session }
      );

      await session.commitTransaction();

      // Send confirmation email (async, non-blocking)
      emailService.sendFundsAddedConfirmation(
        { amount: verifiedAmountNaira, reference, previousBalance, newBalance: user.wallet.balance },
        user.email,
        user.name
      ).catch(err => console.error('Funds added email error:', err));

      res.json({
        success: true,
        message: 'Payment verified and wallet credited',
        data: { balance: user.wallet.balance, currency: 'NGN', amountAdded: verifiedAmountNaira },
      });
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }
  } catch (error) {
    console.error('Verify payment error:', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

// ─── POST /api/wallet/add-funds (legacy / manual) ────────────────────────────
// Kept for backward compat; now delegates to Paystack-backed flow

exports.addFunds = async (req, res) => {
  // If Paystack is configured, force through the proper flow
  if (paystackService.isConfigured()) {
    return res.status(400).json({
      error: 'Please use /api/wallet/initialize-payment to fund your wallet via Paystack',
      useEndpoint: '/api/wallet/initialize-payment',
    });
  }

  // Fallback — only if Paystack is NOT configured (dev/test mode)
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array(), error: 'Validation failed' });
    }

    const amount = parseFloat(req.body.amount);
    if (isNaN(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Amount must be a positive number' });
    }
    if (amount > 10_000_000) {
      return res.status(400).json({ error: 'Amount exceeds maximum allowed (₦10,000,000)' });
    }

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const previousBalance = user.wallet.balance;
    user.wallet.balance += amount;
    await user.save();

    const reference = generateReference('DEP');
    await WalletTransaction.create({
      user: req.user._id,
      type: 'credit',
      amount,
      currency: user.wallet.currency || 'NGN',
      description: 'Added funds to wallet (test mode)',
      reference,
      status: 'completed',
      metadata: { paymentMethod: 'manual' },
    });

    emailService.sendFundsAddedConfirmation(
      { amount, reference, previousBalance, newBalance: user.wallet.balance },
      user.email,
      user.name
    ).catch(err => console.error('Funds added email error:', err));

    res.json({
      success: true,
      data: { balance: user.wallet.balance, currency: user.wallet.currency || 'NGN' },
      message: 'Funds added successfully (test mode)',
    });
  } catch (error) {
    console.error('Add funds error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// ─── POST /api/wallet/withdraw ────────────────────────────────────────────────

exports.withdrawFunds = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array(), error: 'Validation failed' });
    }

    if (!paystackService.isConfigured()) {
      return res.status(503).json({ error: 'Payment service is not configured' });
    }

    const { amount, accountNumber, bankCode, accountName } = req.body;
    const withdrawAmount = parseFloat(amount);

    if (isNaN(withdrawAmount) || withdrawAmount < 100) {
      return res.status(400).json({ error: 'Minimum withdrawal is ₦100' });
    }

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (user.wallet.balance < withdrawAmount) {
      return res.status(400).json({
        error: 'Insufficient balance',
        balance: user.wallet.balance,
        requested: withdrawAmount,
      });
    }

    // Create recipient on Paystack
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

    // Debit wallet immediately (retry/refund on transfer failure)
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      user.wallet.balance -= withdrawAmount;
      await user.save({ session });

      const transaction = await WalletTransaction.create([{
        user: req.user._id,
        type: 'debit',
        amount: withdrawAmount,
        currency: 'NGN',
        description: `Withdrawal to ${accountName} (${accountNumber}) at ${bankCode}`,
        reference,
        status: 'pending',
        metadata: {
          paymentMethod: 'bank_transfer',
          recipientCode,
          accountNumber,
          bankCode,
          accountName,
        },
      }], { session });

      await session.commitTransaction();

      // Initiate transfer via Paystack (after committing so balance is locked)
      try {
        const transferData = await paystackService.initiateTransfer(
          withdrawAmount,
          recipientCode,
          reference,
          `Connectify wallet withdrawal - ${user.name}`
        );

        if (transferData.status) {
          await WalletTransaction.findByIdAndUpdate(transaction[0]._id, {
            status: transferData.data?.status === 'success' ? 'completed' : 'pending',
          });
        }

        res.json({
          success: true,
          message: 'Withdrawal initiated. Funds will be transferred to your bank account.',
          data: {
            reference,
            amount: withdrawAmount,
            accountNumber,
            accountName,
            newBalance: user.wallet.balance,
            transferStatus: transferData.data?.status || 'pending',
          },
        });
      } catch (transferError) {
        // Paystack transfer failed — refund the wallet balance
        console.error('Paystack transfer failed, refunding:', transferError);
        await User.findByIdAndUpdate(req.user._id, { $inc: { 'wallet.balance': withdrawAmount } });
        await WalletTransaction.findByIdAndUpdate(transaction[0]._id, { status: 'failed' });

        throw new Error('Transfer initiation failed. Your balance has been refunded.');
      }
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }
  } catch (error) {
    console.error('Withdraw funds error:', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

// ─── GET /api/wallet/banks ─────────────────────────────────────────────────────

exports.listBanks = async (req, res) => {
  try {
    if (!paystackService.isConfigured()) {
      return res.status(503).json({ error: 'Payment service is not configured' });
    }

    const data = await paystackService.listBanks();

    res.json({
      success: true,
      data: data.data || [],
    });
  } catch (error) {
    console.error('List banks error:', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

// ─── POST /api/wallet/resolve-account ─────────────────────────────────────────

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
        bankId: data.data.bank_id,
      },
    });
  } catch (error) {
    console.error('Resolve account error:', error);
    // Paystack returns 422 with descriptive message when account not found
    const status = error.response?.status === 422 ? 422 : 500;
    const message = error.response?.data?.message || error.message || 'Server error';
    res.status(status).json({ error: message });
  }
};

// ─── POST /api/wallet/process-payment ────────────────────────────────────────
// (booking payment from wallet balance — unchanged logic but cleaned up)

exports.processBookingPayment = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array(), error: 'Validation failed' });
    }

    const { bookingId } = req.body;
    const booking = await Booking.findById(bookingId).populate('service');
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    if (String(booking.customer) !== String(req.user._id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (booking.paymentStatus !== 'pending') {
      return res.status(400).json({ error: 'Payment already processed' });
    }

    const user = await User.findById(req.user._id);
    if (user.wallet.balance < booking.totalAmount) {
      return res.status(400).json({
        error: 'Insufficient balance',
        balance: user.wallet.balance,
        required: booking.totalAmount,
      });
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const previousCustomerBalance = user.wallet.balance;
      user.wallet.balance -= booking.totalAmount;
      await user.save({ session });

      const customerReference = generateReference('PAY');
      await WalletTransaction.create([{
        user: req.user._id,
        type: 'debit',
        amount: booking.totalAmount,
        currency: booking.currency || 'NGN',
        description: `Payment for ${booking.service.name} (Booking #${booking._id})`,
        reference: customerReference,
        status: 'completed',
        metadata: { bookingId: booking._id, providerId: booking.provider },
      }], { session });

      const provider = await User.findById(booking.provider).session(session);
      const previousProviderBalance = provider.wallet.balance;
      provider.wallet.balance += booking.totalAmount;
      await provider.save({ session });

      const providerReference = generateReference('RECV');
      await WalletTransaction.create([{
        user: booking.provider,
        type: 'credit',
        amount: booking.totalAmount,
        currency: booking.currency || 'NGN',
        description: `Payment received for ${booking.service.name} (Booking #${booking._id})`,
        reference: providerReference,
        status: 'completed',
        metadata: { bookingId: booking._id, providerId: booking.provider },
      }], { session });

      booking.paymentStatus = 'paid';
      await booking.save({ session });

      await session.commitTransaction();

      // Async emails
      emailService.sendPaymentReceipt(
        { amount: booking.totalAmount, reference: customerReference, serviceName: booking.service.name,
          providerName: provider.name, bookingId: String(booking._id),
          previousBalance: previousCustomerBalance, newBalance: user.wallet.balance },
        user.email, user.name
      ).catch(err => console.error('Customer payment email error:', err));

      emailService.sendPaymentReceived(
        { amount: booking.totalAmount, reference: providerReference, serviceName: booking.service.name,
          customerName: user.name, bookingId: String(booking._id),
          previousBalance: previousProviderBalance, newBalance: provider.wallet.balance },
        provider.email, provider.name
      ).catch(err => console.error('Provider payment email error:', err));

      res.json({ success: true, message: 'Payment processed successfully', booking });
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }
  } catch (error) {
    console.error('Process booking payment error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};
