const Verification = require('../models/Verification');
const User = require('../models/User');

// Submit verification documents
exports.submitVerification = async (req, res) => {
  try {
    const { documentType, documentNumber, documentFront, documentBack, additionalInfo } = req.body;
    const userId = req.user._id;

    // Validate required fields
    if (!documentType || !documentNumber || !documentFront) {
      return res.status(400).json({ error: 'Document type, number, and front image are required' });
    }

    // Check if user already has a verification request
    const existingVerification = await Verification.findOne({ user: userId });
    
    if (existingVerification) {
      // Update existing verification request
      existingVerification.documentType = documentType;
      existingVerification.documentNumber = documentNumber;
      existingVerification.documentFront = documentFront;
      existingVerification.documentBack = documentBack;
      existingVerification.status = 'PENDING';
      existingVerification.verificationDate = null;
      existingVerification.verifiedBy = null;
      existingVerification.rejectionReason = null;
      existingVerification.additionalInfo = additionalInfo;

      await existingVerification.save();

      res.json({
        success: true,
        data: existingVerification,
        message: 'Verification request updated successfully'
      });
    } else {
      // Create new verification request
      const verification = new Verification({
        user: userId,
        documentType,
        documentNumber,
        documentFront,
        documentBack,
        additionalInfo
      });

      await verification.save();

      res.status(201).json({
        success: true,
        data: verification,
        message: 'Verification request submitted successfully'
      });
    }
  } catch (error) {
    console.error('Submit verification error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Get user verification status
exports.getVerificationStatus = async (req, res) => {
  try {
    const userId = req.params.userId || req.user._id;

    const verification = await Verification.findOne({ user: userId })
      .populate('user', 'name email')
      .populate('verifiedBy', 'name email');

    if (!verification) {
      return res.json({
        success: true,
        data: {
          status: 'NOT_SUBMITTED',
          user: userId
        }
      });
    }

    res.json({
      success: true,
      data: verification
    });
  } catch (error) {
    console.error('Get verification status error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Get all verification requests (admin only)
exports.getAllVerifications = async (req, res) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;

    const query = {};
    if (status) {
      query.status = status.toUpperCase();
    }

    const verifications = await Verification.find(query)
      .populate('user', 'name email profile')
      .populate('verifiedBy', 'name email')
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ createdAt: -1 });

    const total = await Verification.countDocuments(query);

    res.json({
      success: true,
      data: verifications,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get all verifications error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Approve verification (admin only)
exports.approveVerification = async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.user._id;

    const verification = await Verification.findById(id);
    
    if (!verification) {
      return res.status(404).json({ error: 'Verification request not found' });
    }

    verification.status = 'APPROVED';
    verification.verifiedBy = adminId;
    verification.verificationDate = new Date();

    await verification.save();

    // Update user's verification status
    await User.findByIdAndUpdate(verification.user, {
      'profile.isVerified': true
    });

    res.json({
      success: true,
      data: verification,
      message: 'Verification approved successfully'
    });
  } catch (error) {
    console.error('Approve verification error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Reject verification (admin only)
exports.rejectVerification = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const adminId = req.user._id;

    const verification = await Verification.findById(id);
    
    if (!verification) {
      return res.status(404).json({ error: 'Verification request not found' });
    }

    verification.status = 'REJECTED';
    verification.verifiedBy = adminId;
    verification.verificationDate = new Date();
    verification.rejectionReason = reason;

    await verification.save();

    res.json({
      success: true,
      data: verification,
      message: 'Verification rejected successfully'
    });
  } catch (error) {
    console.error('Reject verification error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Get verification request by ID (admin only or user's own)
exports.getVerificationById = async (req, res) => {
  try {
    const verification = await Verification.findById(req.params.id)
      .populate('user', 'name email profile')
      .populate('verifiedBy', 'name email');

    if (!verification) {
      return res.status(404).json({ error: 'Verification request not found' });
    }

    // Allow access if the user is admin or it's their own verification
    if (
      req.user.role === 'admin' ||
      verification.user._id.toString() === req.user._id.toString()
    ) {
      res.json({
        success: true,
        data: verification
      });
    } else {
      return res.status(403).json({ error: 'Access denied' });
    }
  } catch (error) {
    console.error('Get verification by ID error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};