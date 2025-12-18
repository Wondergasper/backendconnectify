const mongoose = require('mongoose');

const serviceSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Service name is required'],
    trim: true
  },
  provider: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  category: {
    type: String,
    required: [true, 'Category is required'],
    trim: true
  },
  description: {
    type: String,
    required: [true, 'Description is required'],
    maxlength: [1000, 'Description cannot exceed 1000 characters']
  },
  price: {
    type: Number,
    required: [true, 'Price is required'],
    min: [0, 'Price cannot be negative']
  },
  priceType: {
    type: String,
    enum: ['fixed', 'hourly', 'negotiable'],
    default: 'hourly'
  },
  duration: {
    type: Number, // in minutes
    required: [true, 'Duration is required']
  },
  images: [String], // URLs to service images
  location: {
    type: {
      type: String,
      default: 'Point'
    },
    coordinates: [Number], // [longitude, latitude]
    address: String
  },
  rating: {
    average: {
      type: Number,
      default: 0,
      min: 0,
      max: 5
    },
    count: {
      type: Number,
      default: 0
    }
  },
  servicesOffered: [String], // Specific services included
  gallery: [String], // Additional gallery images
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Index for geospatial queries
serviceSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('Service', serviceSchema);