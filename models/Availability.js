const mongoose = require('mongoose');

const availabilitySchema = new mongoose.Schema({
  provider: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  date: {
    type: Date,
    required: true
  },
  slots: [{
    startTime: {
      type: String, // Format: "HH:MM" (e.g., "09:00")
      required: true
    },
    endTime: {
      type: String, // Format: "HH:MM" (e.g., "10:00")
      required: true
    },
    isBooked: {
      type: Boolean,
      default: false
    },
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      default: null
    }
  }],
  isAvailable: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Create indexes for efficient queries
availabilitySchema.index({ provider: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('Availability', availabilitySchema);