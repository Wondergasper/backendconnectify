const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    maxlength: [100, 'Name cannot exceed 100 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    unique: true,
    match: [/^[\+]?[1-9][\d]{0,15}$/, 'Please enter a valid phone number']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters'],
    select: false // Don't include password in queries by default
  },
  role: {
    type: String,
    enum: ['customer', 'provider'],
    default: 'customer',
    required: true
  },
  profile: {
    avatar: String,
    bio: String,
    location: {
      type: {
        type: String,
        default: 'Point'
      },
      coordinates: [Number], // [longitude, latitude]
      address: String
    },
    verification: {
      verified: {
        type: Boolean,
        default: false
      },
      documents: [String], // URLs to verification documents
      verifiedAt: Date
    },
    social: {
      facebook: String,
      twitter: String,
      instagram: String
    },
    portfolio: [{
      url: String,
      publicId: String,
      uploadedAt: {
        type: Date,
        default: Date.now
      }
    }]
  },
  providerDetails: {
    category: String,
    hourlyRate: Number,
    yearsOfExperience: Number,
    servicesOffered: [String], // Array of service names
    portfolio: [String], // URLs to portfolio items (legacy - use profile.portfolio instead)
    certifications: [String], // URLs to certifications
    availability: {
      monday: { start: String, end: String, available: Boolean },
      tuesday: { start: String, end: String, available: Boolean },
      wednesday: { start: String, end: String, available: Boolean },
      thursday: { start: String, end: String, available: Boolean },
      friday: { start: String, end: String, available: Boolean },
      saturday: { start: String, end: String, available: Boolean },
      sunday: { start: String, end: String, available: Boolean }
    }
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
  completedJobsCount: {
    type: Number,
    default: 0
  },
  wallet: {
    balance: {
      type: Number,
      default: 0
    },
    currency: {
      type: String,
      default: 'NGN'
    },
    transactions: [{
      type: String, // 'credit' or 'debit'
      amount: Number,
      description: String,
      date: {
        type: Date,
        default: Date.now
      }
    }]
  },
  isActive: {
    type: Boolean,
    default: true
  },
  refreshToken: {
    type: String
  },
  resetPasswordToken: String,
  resetPasswordExpire: Date
}, {
  timestamps: true
});

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();

  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare password method
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);