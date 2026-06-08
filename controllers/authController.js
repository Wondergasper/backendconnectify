const { validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { generateAccessToken, generateRefreshToken, hashRefreshToken } = require('../utils/tokenUtils');
const { userRepository } = require('../repositories/supabase/userRepository');
const { providerProfileRepository } = require('../repositories/supabase/providerProfileRepository');


const isProdOrRender = process.env.NODE_ENV === 'production' || process.env.RENDER === 'true' || process.env.VERCEL === '1';

const cookieOptions = (maxAge) => ({
  httpOnly: true,
  secure: isProdOrRender,
  sameSite: isProdOrRender ? 'none' : 'lax',
  maxAge
});

const clearCookieOptions = {
  httpOnly: true,
  secure: isProdOrRender,
  sameSite: isProdOrRender ? 'none' : 'lax'
};

const publicUserPayload = (user, providerProfile = null) => ({
  id: user._id || user.id,
  name: user.name,
  email: user.email,
  phone: user.phone,
  role: user.role,
  providerType: providerProfile ? providerProfile.providerType : null,
  profile: user.profile
});

const authResponse = (req, user, accessToken, refreshToken, providerProfile = null) => {
  const responseData = { user: publicUserPayload(user, providerProfile) };

  if (req.header('X-Client-Type') === 'mobile' || req.query.includeTokens === 'true') {
    responseData.accessToken = accessToken;
    responseData.refreshToken = refreshToken;
  }

  return responseData;
};


const hashPassword = async (password) => {
  const salt = await bcrypt.genSalt(12);
  return bcrypt.hash(password, salt);
};

exports.register = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array(), error: 'Validation failed' });
    }

    const { name, email, phone, password, role } = req.body;
    const safeRole = ['customer', 'provider'].includes(role) ? role : 'customer';
    const existingUser = await userRepository.findByEmailOrPhone({ email, phone });

    if (existingUser) {
      if (existingUser.email === String(email).toLowerCase()) {
        return res.status(400).json({ error: 'An account with this email already exists. Please login or use a different email.' });
      }
      if (existingUser.phone === phone) {
        return res.status(400).json({ error: 'An account with this phone number already exists. Please login or use a different phone number.' });
      }
      return res.status(400).json({ error: 'User already exists' });
    }

    const user = await userRepository.createUser({
      name,
      email,
      phone,
      passwordHash: await hashPassword(password),
      role: safeRole
    });

    const accessToken = generateAccessToken(user._id);
    const { refreshToken, refreshTokenHash } = generateRefreshToken(user._id);
    await userRepository.updateRefreshToken(user._id, refreshTokenHash);

    res.cookie('accessToken', accessToken, cookieOptions(15 * 60 * 1000));
    res.cookie('refreshToken', refreshToken, cookieOptions(7 * 24 * 60 * 60 * 1000));

    res.status(201).json({
      success: true,
      data: authResponse(req, user, accessToken, refreshToken)
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Server error during registration' });
  }
};


exports.login = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array(), error: 'Validation failed' });
    }

    const { email, phone, password } = req.body;
    const user = await userRepository.findForLogin({ email, phone });

    if (!user || user.isActive === false || !(await bcrypt.compare(password, user.passwordHash || ''))) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const accessToken = generateAccessToken(user._id);
    const { refreshToken, refreshTokenHash } = generateRefreshToken(user._id);
    await userRepository.updateRefreshToken(user._id, refreshTokenHash);

    // Fetch provider profile to include providerType in response
    let providerProfile = null;
    if (user.role === 'provider') {
      providerProfile = await providerProfileRepository.findByUserId(user._id).catch(() => null);
    }

    res.cookie('accessToken', accessToken, cookieOptions(15 * 60 * 1000));
    res.cookie('refreshToken', refreshToken, cookieOptions(7 * 24 * 60 * 60 * 1000));

    res.json({
      success: true,
      data: authResponse(req, user, accessToken, refreshToken, providerProfile)
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error during login' });
  }
};


exports.getProfile = async (req, res) => {
  try {
    const user = await userRepository.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Include providerType for provider users
    let providerProfile = null;
    if (user.role === 'provider') {
      providerProfile = await providerProfileRepository.findByUserId(user._id).catch(() => null);
    }

    res.json({
      success: true,
      data: {
        user: publicUserPayload(user, providerProfile),
        providerProfile: providerProfile || undefined
      }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};


exports.refreshToken = async (req, res) => {
  try {
    // Check cookies first, fallback to body for mobile clients
    const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({ error: 'No refresh token provided' });
    }

    let payload;
    try {
      payload = jwt.verify(refreshToken, process.env.JWT_SECRET);
    } catch {
      return res.status(403).json({ error: 'Invalid refresh token' });
    }

    const user = await userRepository.findById(payload.userId, { includePrivate: true });
    if (!user || !user.refreshTokenHash || user.isActive === false) {
      return res.status(403).json({ error: 'Invalid refresh token' });
    }

    if (user.refreshTokenHash !== hashRefreshToken(refreshToken)) {
      await userRepository.clearRefreshToken(user._id);
      return res.status(403).json({ error: 'Invalid refresh token' });
    }

    const newAccessToken = generateAccessToken(user._id);
    const { refreshToken: newRefreshToken, refreshTokenHash: newRefreshTokenHash } = generateRefreshToken(user._id);
    await userRepository.updateRefreshToken(user._id, newRefreshTokenHash);

    // Set cookies for web clients
    res.cookie('accessToken', newAccessToken, cookieOptions(15 * 60 * 1000));
    res.cookie('refreshToken', newRefreshToken, cookieOptions(7 * 24 * 60 * 60 * 1000));

    // Return tokens in response payload for mobile clients
    res.json({
      success: true,
      data: authResponse(req, user, newAccessToken, newRefreshToken)
    });
  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(500).json({ error: 'Server error during token refresh' });
  }
};

exports.logout = async (req, res) => {
  try {
    let userId = req.user?._id || req.user?.id;

    // Check cookies first, fallback to body for mobile
    const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;

    if (!userId && refreshToken) {
      try {
        const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
        userId = decoded.userId;
      } catch {
        userId = null;
      }
    }

    if (userId) {
      await userRepository.clearRefreshToken(userId);
    }

    // Always attempt to clear cookies (harmless for mobile)
    res.clearCookie('accessToken', clearCookieOptions);
    res.clearCookie('refreshToken', clearCookieOptions);

    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.clearCookie('accessToken', clearCookieOptions);
    res.clearCookie('refreshToken', clearCookieOptions);
    res.status(500).json({ error: 'Server error during logout' });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const { name, phone, bio, location, social, role, providerDetails, profile } = req.body;
    const updateData = {};

    if (name) updateData.name = name;
    if (phone) updateData.phone = phone;
    if (role !== undefined) {
      const adminAssignableRoles = ['customer', 'provider', 'admin'];
      const selfAssignableRoles = ['customer', 'provider'];

      if (req.user?.role === 'admin') {
        if (!adminAssignableRoles.includes(role)) {
          return res.status(400).json({ error: 'Invalid role' });
        }
        updateData.role = role;
      } else {
        if (!selfAssignableRoles.includes(role)) {
          return res.status(403).json({ error: 'You can only switch between customer and provider roles' });
        }
        updateData.role = role;
      }
    }

    const nextProfile = { ...(req.user.profile || {}) };

    if (profile) {
      if (profile.bio !== undefined) nextProfile.bio = profile.bio;
      if (profile.avatar !== undefined) nextProfile.avatar = profile.avatar;
      if (profile.location !== undefined) {
        const currentLocation = nextProfile.location || { type: 'Point' };
        nextProfile.location = typeof profile.location === 'string'
          ? { ...currentLocation, address: profile.location }
          : { ...currentLocation, ...profile.location, type: profile.location?.type || 'Point' };
      }
      if (profile.social && typeof profile.social === 'object') {
        nextProfile.social = { ...(nextProfile.social || {}), ...profile.social };
      }
    }

    if (bio !== undefined && (profile === undefined || profile.bio === undefined)) nextProfile.bio = bio;
    if (location !== undefined && (profile === undefined || profile.location === undefined)) {
      const currentLocation = nextProfile.location || { type: 'Point' };
      nextProfile.location = typeof location === 'string'
        ? { ...currentLocation, address: location }
        : { ...currentLocation, ...location, type: location?.type || 'Point' };
    }
    if (social !== undefined && (profile === undefined || profile.social === undefined)) {
      nextProfile.social = { ...(nextProfile.social || {}), ...(social || {}) };
    }

    if (Object.keys(nextProfile).length > 0) {
      updateData.profile = nextProfile;
    }

    if (providerDetails && typeof providerDetails === 'object') {
      const currentProviderDetails = req.user.providerDetails || {};
      updateData.provider_details = {
        ...currentProviderDetails,
        ...providerDetails,
        availability: providerDetails.availability
          ? { ...(currentProviderDetails.availability || {}), ...providerDetails.availability }
          : currentProviderDetails.availability
      };
    }

    const user = await userRepository.updateProfile(req.user._id, updateData);

    res.json({
      success: true,
      data: { user }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.forgotPassword = async (req, res) => {
  const genericMessage = 'If that email is registered, a password reset link has been sent.';

  try {
    const { email } = req.body;
    const user = await userRepository.findForLogin({ email });

    if (!user) {
      return res.status(200).json({ success: true, data: genericMessage });
    }

    const resetToken = crypto.randomBytes(20).toString('hex');
    const resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    const resetPasswordExpire = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    await userRepository.updatePasswordReset(user._id, {
      resetPasswordToken,
      resetPasswordExpire
    });

    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password/${resetToken}`;

    // Always log the URL in development for convenience
    if (process.env.NODE_ENV === 'development') {
      console.log('\n🔑 [DEVELOPMENT ONLY] Reset Password URL:', resetUrl, '\n');
    }

    try {
      const emailService = require('../services/emailService');
      await emailService.sendPasswordReset(email, resetToken, user.name);

      if (process.env.NODE_ENV === 'development' && process.env.LOG_PASSWORD_RESET_URL === 'true') {
        console.log('Reset Password URL (for testing only):', resetUrl);
      }

      res.status(200).json({ success: true, data: genericMessage });
    } catch (err) {
      console.error('Failed to send password reset email:', err);

      // If we are in development, catch the error and still succeed with devResetUrl
      if (process.env.NODE_ENV === 'development') {
        console.log('⚠️ Email sending failed, but continuing in development mode as reset URL was logged.');
        return res.status(200).json({
          success: true,
          data: genericMessage,
          devResetUrl: resetUrl
        });
      }

      await userRepository.updatePasswordReset(user._id, {
        resetPasswordToken: null,
        resetPasswordExpire: null
      });
      return res.status(500).json({ error: 'Email could not be sent' });
    }
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { password } = req.body;
    if (!password || typeof password !== 'string' || password.trim().length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const resetPasswordToken = crypto
      .createHash('sha256')
      .update(req.params.resetToken)
      .digest('hex');

    const user = await userRepository.findByResetToken(resetPasswordToken);

    if (!user || !user.resetPasswordExpire || new Date(user.resetPasswordExpire).getTime() <= Date.now()) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    await userRepository.updatePassword(user._id, await hashPassword(password.trim()));

    res.status(200).json({
      success: true,
      data: 'Password updated success'
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};
