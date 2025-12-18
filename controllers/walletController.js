const WalletTransaction = require('../models/WalletTransaction');
const User = require('../models/User');
const Booking = require('../models/Booking');
const mongoose = require('mongoose');

// Get user wallet balance
exports.getWalletBalance = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      success: true,
      balance: user.wallet.balance,
      currency: user.wallet.currency
    });
  } catch (error) {
    console.error('Get wallet balance error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Get wallet transaction history
exports.getTransactionHistory = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const type = req.query.type; // 'credit' or 'debit'

    const query = { user: req.user._id };
    if (type) query.type = type;

    const transactions = await WalletTransaction.find(query)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await WalletTransaction.countDocuments(query);

    res.json({
      success: true,
      data: transactions,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get transaction history error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Process payment for booking
exports.processBookingPayment = async (req, res) => {
  try {
    const { bookingId } = req.body;

    const booking = await Booking.findById(bookingId).populate('service');
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    // Check if booking belongs to user
    if (booking.customer.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Check if payment already processed
    if (booking.paymentStatus !== 'pending') {
      return res.status(400).json({ error: 'Payment already processed' });
    }

    // Check if user has enough balance
    const user = await User.findById(req.user._id);
    if (user.wallet.balance < booking.totalAmount) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    // Process the payment
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Update user's wallet balance (debit)
      user.wallet.balance -= booking.totalAmount;
      user.wallet.transactions.push({
        type: 'debit',
        amount: booking.totalAmount,
        description: `Payment for ${booking.service.name} service`
      });
      await user.save();

      // Create wallet transaction record
      const transaction = new WalletTransaction({
        user: req.user._id,
        type: 'debit',
        amount: booking.totalAmount,
        currency: booking.currency,
        description: `Payment for ${booking.service.name} service (Booking ID: ${booking._id})`,
        reference: `TXN_${Date.now()}_${booking._id}`,
        status: 'completed',
        metadata: {
          bookingId: booking._id,
          providerId: booking.provider
        }
      });
      await transaction.save();

      // Transfer funds to provider (this is simplified - in a real app, you might want to hold funds temporarily)
      const provider = await User.findById(booking.provider);
      provider.wallet.balance += booking.totalAmount;
      provider.wallet.transactions.push({
        type: 'credit',
        amount: booking.totalAmount,
        description: `Payment received for ${booking.service.name} service`
      });
      await provider.save();

      // Create provider transaction record
      const providerTransaction = new WalletTransaction({
        user: booking.provider,
        type: 'credit',
        amount: booking.totalAmount,
        currency: booking.currency,
        description: `Payment received for ${booking.service.name} service (Booking ID: ${booking._id})`,
        reference: `TXN_${Date.now()}_${booking.provider}`,
        status: 'completed',
        metadata: {
          bookingId: booking._id,
          providerId: booking.provider
        }
      });
      await providerTransaction.save();

      // Update booking payment status
      booking.paymentStatus = 'paid';
      await booking.save();

      await session.commitTransaction();

      res.json({
        success: true,
        message: 'Payment processed successfully',
        booking
      });
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  } catch (error) {
    console.error('Process booking payment error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Add funds to wallet (simplified - in real app, integrate with payment provider)
exports.addFunds = async (req, res) => {
  try {
    const { amount } = req.body;

    if (amount <= 0) {
      return res.status(400).json({ error: 'Amount must be greater than 0' });
    }

    const user = await User.findById(req.user._id);

    // In a real app, you would process actual payment here
    // For now, just adding funds (simulated)
    user.wallet.balance += amount;
    user.wallet.transactions.push({
      type: 'credit',
      amount,
      description: 'Added funds to wallet'
    });
    await user.save();

    // Create transaction record
    const transaction = new WalletTransaction({
      user: req.user._id,
      type: 'credit',
      amount,
      currency: user.wallet.currency,
      description: 'Added funds to wallet',
      reference: `DEP_${Date.now()}_${req.user._id}`,
      status: 'completed'
    });
    await transaction.save();

    res.json({
      success: true,
      data: {
        balance: user.wallet.balance,
        currency: user.wallet.currency
      },
      message: 'Funds added successfully'
    });
  } catch (error) {
    console.error('Add funds error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};