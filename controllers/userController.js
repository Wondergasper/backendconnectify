const { userRepository } = require('../repositories/supabase/userRepository');
const { logAudit } = require('../utils/auditLogger');

const publicUserResponse = (user) => ({
  _id: user._id,
  id: user.id,
  name: user.name,
  email: user.email,
  phone: user.phone,
  role: user.role,
  profile: user.profile,
  providerDetails: user.providerDetails,
  rating: user.rating,
  completedJobsCount: user.completedJobsCount,
  wallet: user.wallet,
  isActive: user.isActive,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt
});

exports.getUsers = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const role = req.query.role;
    const search = req.query.search;

    const { data, pagination } = await userRepository.listUsers({
      page,
      limit,
      role,
      search
    });

    res.json({
      success: true,
      data,
      pagination
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getUserById = async (req, res) => {
  try {
    const isAdmin = req.user?.role === 'admin';
    const isSelf = req.user?._id === req.params.id || req.user?.id === req.params.id;

    if (!isAdmin && !isSelf) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const user = await userRepository.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    await logAudit({
      req,
      action: 'Viewed user',
      entityType: 'user',
      entityId: user._id,
      target: user.email,
      metadata: { requestedId: req.params.id }
    });

    res.json({
      success: true,
      user
    });
  } catch (error) {
    console.error('Get user by ID error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getUserSummary = async (req, res) => {
  try {
    const user = await userRepository.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      success: true,
      data: {
        user,
        stats: {
          bookings: 0,
          completedBookings: 0,
          reviews: 0,
          totalSpent: user.role === 'customer' ? 0 : undefined,
          totalEarned: user.role === 'provider' ? 0 : undefined,
          walletBalance: user.wallet?.balance || 0
        },
        recentBookings: [],
        recentTransactions: [],
        recentReviews: [],
        migrationStatus: 'Booking, wallet, and review summaries will populate after those domains are migrated to Supabase.'
      }
    });
  } catch (error) {
    console.error('Get user summary error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.updateUser = async (req, res) => {
  try {
    const { name, email, phone, role, profile, providerDetails } = req.body;
    const isAdmin = req.user?.role === 'admin';
    const isSelf = req.user?._id === req.params.id || req.user?.id === req.params.id;

    if (!isAdmin && !isSelf) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const existingUser = await userRepository.findById(req.params.id);
    if (!existingUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (email !== undefined) updateData.email = String(email).toLowerCase();
    if (phone !== undefined) updateData.phone = phone;

    if (isAdmin) {
      if (role !== undefined) updateData.role = role;
      if (req.body.isActive !== undefined) updateData.is_active = req.body.isActive;
    }

    if (profile) {
      const nextProfile = { ...(existingUser.profile || {}) };
      if (profile.avatar !== undefined) nextProfile.avatar = profile.avatar;
      if (profile.bio !== undefined) nextProfile.bio = profile.bio;
      if (profile.location !== undefined) {
        const currentLocation = nextProfile.location || { type: 'Point' };
        nextProfile.location = typeof profile.location === 'string'
          ? { ...currentLocation, address: profile.location }
          : { ...currentLocation, ...profile.location, type: profile.location?.type || 'Point' };
      }
      if (profile.social !== undefined) {
        nextProfile.social = { ...(nextProfile.social || {}), ...(profile.social || {}) };
      }
      if (profile.portfolio !== undefined) {
        nextProfile.portfolio = profile.portfolio;
      }
      if (profile.verification && isAdmin) {
        nextProfile.verification = {
          ...(nextProfile.verification || {}),
          ...profile.verification,
          verifiedAt: profile.verification.verified
            ? new Date().toISOString()
            : profile.verification.verified === false
              ? undefined
              : (nextProfile.verification || {}).verifiedAt
        };
      }
      updateData.profile = nextProfile;
    }

    if (providerDetails) {
      updateData.provider_details = {
        ...(existingUser.providerDetails || {}),
        ...providerDetails
      };
    }

    const updatedUser = await userRepository.updateProfile(req.params.id, updateData);

    await logAudit({
      req,
      action: 'Updated user',
      entityType: 'user',
      entityId: updatedUser._id,
      target: updatedUser.email,
      metadata: {
        updatedFields: Object.keys(req.body).filter((key) => req.body[key] !== undefined)
      }
    });

    res.json({
      success: true,
      user: publicUserResponse(updatedUser)
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const user = await userRepository.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    await userRepository.deleteById(req.params.id);

    await logAudit({
      req,
      action: 'Deleted user',
      entityType: 'user',
      entityId: user._id,
      target: user.email,
      metadata: { deletedId: req.params.id }
    });

    res.json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.registerFcmToken = async (req, res) => {
  try {
    const { fcmToken } = req.body;

    if (!fcmToken) {
      return res.status(400).json({
        success: false,
        error: 'FCM token is required'
      });
    }

    await userRepository.registerFcmToken(req.user._id, fcmToken);

    res.json({
      success: true,
      message: 'FCM token registered successfully'
    });
  } catch (error) {
    console.error('Register FCM token error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to register FCM token'
    });
  }
};
