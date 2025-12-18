const mongoose = require('mongoose');

const verificationSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  documentType: {
    type: String,
    required: true,
    enum: ['ID', 'PASSPORT', 'LICENSE', 'CERTIFICATE', 'BUSINESS_LICENSE', 'OTHER']
  },
  documentNumber: {
    type: String,
    required: true
  },
  documentFront: {
    type: String, // URL or path to document image
    required: true
  },
  documentBack: {
    type: String // URL or path to document image (optional for some document types)
  },
  status: {
    type: String,
    enum: ['PENDING', 'APPROVED', 'REJECTED'],
    default: 'PENDING'
  },
  verifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User' // Admin who verified
  },
  verificationDate: {
    type: Date
  },
  rejectionReason: {
    type: String
  },
  additionalInfo: {
    type: Object
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Verification', verificationSchema);