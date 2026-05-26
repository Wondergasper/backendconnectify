const { verificationRepository } = require('../repositories/supabase/verificationRepository');
const { userRepository } = require('../repositories/supabase/userRepository');
const { logAudit } = require('../utils/auditLogger');

// Submit verification documents
exports.submitVerification = async (req, res) => {
  try {
    const { documentType, documentNumber, documentFront, documentBack, additionalInfo } = req.body;
    const userId = req.user.id;

    // Validate required fields
    if (!documentType || !documentNumber || !documentFront) {
      return res.status(400).json({ error: 'Document type, number, and front image are required' });
    }

    // Check if user already has a verification request
    const existingVerification = await verificationRepository.findByUserId(userId);
    
    // Upsert verification request
    const verification = await verificationRepository.upsertVerification({
      userId,
      documentType,
      documentNumber,
      documentFront,
      documentBack,
      additionalInfo
    });

    if (existingVerification) {
      res.json({
        success: true,
        data: verification,
        message: 'Verification request updated successfully'
      });
    } else {
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
    const userId = req.params.userId || req.user.id;

    // Authorization Check: Prevent unauthorized users from reading others' verification status
    if (req.user.role !== 'admin' && req.user.id.toString() !== userId.toString()) {
      return res.status(403).json({ error: 'Access denied: You cannot view another user\'s verification status.' });
    }

    const verification = await verificationRepository.findByUserId(userId);

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
    const { status, type, page = 1, limit = 10 } = req.query;

    const { data: verifications, pagination } = await verificationRepository.listVerifications({
      page: parseInt(page),
      limit: parseInt(limit),
      status,
      type
    });

    res.json({
      success: true,
      data: verifications,
      pagination
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
    const adminId = req.user.id;

    const verification = await verificationRepository.findById(id);
    
    if (!verification) {
      return res.status(404).json({ error: 'Verification request not found' });
    }

    const updatedVerification = await verificationRepository.approveVerification(id, adminId);

    // Update user's verification status
    const userId = verification.user.id || verification.user;
    const user = await userRepository.findById(userId);
    if (user) {
      const profile = user.profile || {};
      if (!profile.verification) profile.verification = {};
      profile.verification.verified = true;
      profile.verification.verifiedAt = updatedVerification.verificationDate;
      await userRepository.updateProfile(userId, { profile });
    }

    await logAudit({
      req,
      action: 'Approved verification',
      entityType: 'verification',
      entityId: updatedVerification.id,
      target: String(userId)
    });

    res.json({
      success: true,
      data: updatedVerification,
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
    const adminId = req.user.id;

    const verification = await verificationRepository.findById(id);
    
    if (!verification) {
      return res.status(404).json({ error: 'Verification request not found' });
    }

    const updatedVerification = await verificationRepository.rejectVerification(id, adminId, reason);

    // Update user's verification status
    const userId = verification.user.id || verification.user;
    const user = await userRepository.findById(userId);
    if (user) {
      const profile = user.profile || {};
      if (!profile.verification) profile.verification = {};
      profile.verification.verified = false;
      await userRepository.updateProfile(userId, { profile });
    }

    await logAudit({
      req,
      action: 'Rejected verification',
      entityType: 'verification',
      entityId: updatedVerification.id,
      target: String(userId),
      metadata: { reason }
    });

    res.json({
      success: true,
      data: updatedVerification,
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
    const verification = await verificationRepository.findById(req.params.id);

    if (!verification) {
      return res.status(404).json({ error: 'Verification request not found' });
    }

    const userId = verification.user.id || verification.user;

    // Allow access if the user is admin or it's their own verification
    if (
      req.user.role === 'admin' ||
      userId.toString() === req.user.id.toString()
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
