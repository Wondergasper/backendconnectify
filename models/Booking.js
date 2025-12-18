const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  provider: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  service: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Service',
    required: true
  },
  date: {
    type: Date,
    required: true
  },
  time: {
    type: String, // Format: "HH:MM AM/PM"
    required: true
  },
  duration: {
    type: Number, // in minutes
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'rejected', 'rescheduled'],
    default: 'pending'
  },
  totalAmount: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    default: 'NGN'
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'refunded'],
    default: 'pending'
  },
  notes: String,
  address: {
    street: String,
    city: String,
    state: String,
    zipCode: String,
    country: String,
    location: {
      type: {
        type: String,
        default: 'Point'
      },
      coordinates: [Number] // [longitude, latitude]
    }
  },
  completedAt: {
    type: Date
  },
  rating: {
    value: {
      type: Number,
      min: 1,
      max: 5
    },
    comment: String,
    date: Date
  },
  serviceImages: [String] // Images of service completion
}, {
  timestamps: true
});

// Index for efficient queries
bookingSchema.index({ customer: 1, createdAt: -1 });
bookingSchema.index({ provider: 1, createdAt: -1 });
bookingSchema.index({ status: 1 });

module.exports = mongoose.model('Booking', bookingSchema);