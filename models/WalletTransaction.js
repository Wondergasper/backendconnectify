const mongoose = require('mongoose');

const walletTransactionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: ['credit', 'debit'],
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: [0, 'Amount cannot be negative']
  },
  currency: {
    type: String,
    default: 'NGN'
  },
  description: {
    type: String,
    required: true
  },
  reference: {
    type: String,
    unique: true,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'refunded'],
    default: 'pending'
  },
  metadata: {
    // Additional data based on transaction type
    bookingId: mongoose.Schema.Types.ObjectId,
    paymentMethod: String,
    providerId: mongoose.Schema.Types.ObjectId
  }
}, {
  timestamps: true
});

// Index for efficient queries
walletTransactionSchema.index({ user: 1, createdAt: -1 });
walletTransactionSchema.index({ reference: 1, unique: true });

module.exports = mongoose.model('WalletTransaction', walletTransactionSchema);