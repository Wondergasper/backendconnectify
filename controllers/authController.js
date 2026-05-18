const User = require('../models/User');
const { validationResult } = require('express-validator');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { generateAccessToken, generateRefreshToken, hashRefreshToken } = require('../utils/tokenUtils');

// Environment validation is done in server.js on startup

// Register user
exports.register = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('Register validation errors:', errors.array());
      return res.status(400).json({ errors: errors.array(), error: 'Validation failed' });
    }

    const { name, email, phone, password, role } = req.body;
    const safeRole = ['customer', 'provider'].includes(role) ? role : 'customer';

    const searchConditions = [];
    if (email) searchConditions.push({ email });
    if (phone) searchConditions.push({ phone });

    let user = null;
    if (searchConditions.length > 0) {
      // Check if user already exists
      user = await User.findOne({
        $or: searchConditions
      });
    }

    if (user) {
      // Provide specific error message
      if (user.email === email) {
        return res.status(400).json({ error: 'An account with this email already exists. Please login or use a different email.' });
      }
      if (user.phone === phone) {
        return res.status(400).json({ error: 'An account with this phone number already exists. Please login or use a different phone number.' });
      }
      return res.status(400).json({ error: 'User already exists' });
    }

    // Create new user
    user = new User({
      name,
      email,
      phone,
      password,
      role: safeRole
    });

    await user.save();

    // Generate tokens
    const accessToken = generateAccessToken(user._id);
    const { refreshToken, refreshTokenHash } = generateRefreshToken(user._id);

    // Store the refresh token hash in the database
    user.refreshToken = refreshTokenHash;
    await user.save();

    // Set HTTP-only cookies with cross-origin support
    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', // 'none' required for cross-origin
      maxAge: 15 * 60 * 1000 // 15 minutes
    });

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    const responseData = {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        profile: user.profile
      }
    };

    // Include tokens in response body for mobile/non-browser clients
    if (req.header('X-Client-Type') === 'mobile' || req.query.includeTokens === 'true') {
      responseData.accessToken = accessToken;
      responseData.refreshToken = refreshToken;
    }

    res.status(201).json({
      success: true,
      data: responseData
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Server error during registration' });
  }
};

// Login user
exports.login = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('Login validation errors:', errors.array());
      return res.status(400).json({ errors: errors.array(), error: 'Validation failed' });
    }

    const { email, phone, password } = req.body;

    // Debug logging (development only)
    if (process.env.NODE_ENV === 'development') {
      console.log('Login attempt with:', { email: email ? '***' : null, phone: phone ? '***' : null });
    }

    const loginConditions = [];
    if (email) loginConditions.push({ email });
    if (phone) loginConditions.push({ phone });

    if (loginConditions.length === 0) {
      return res.status(400).json({ error: 'Email or phone must be provided' });
    }

    // Find user by email or phone
    const user = await User.findOne({
      $or: loginConditions
    }).select('+password'); // Include password in query

    if (process.env.NODE_ENV === 'development') {
      console.log('User lookup result:', {
        userFound: !!user,
        emailMatch: email && user?.email === email,
        phoneMatch: phone && user?.phone === phone
      });
    }

    if (!user || !(await user.comparePassword(password))) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    // Generate tokens
    const accessToken = generateAccessToken(user._id);
    const { refreshToken, refreshTokenHash } = generateRefreshToken(user._id);

    // Store the refresh token hash in the database
    user.refreshToken = refreshTokenHash;
    await user.save();

    // Set HTTP-only cookies with cross-origin support
    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 15 * 60 * 1000 // 15 minutes
    });

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    const responseData = {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        profile: user.profile
      }
    };

    // Include tokens in response body for mobile/non-browser clients
    if (req.header('X-Client-Type') === 'mobile' || req.query.includeTokens === 'true') {
      responseData.accessToken = accessToken;
      responseData.refreshToken = refreshToken;
    }

    res.json({
      success: true,
      data: responseData
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error during login' });
  }
};

// Get current user profile
exports.getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      success: true,
      data: {
        user
      }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Refresh token
exports.refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.cookies;

    if (!refreshToken) {
      return res.status(401).json({ error: 'No refresh token provided' });
    }

    let payload;
    try {
      payload = jwt.verify(refreshToken, process.env.JWT_SECRET);
    } catch (error) {
      return res.status(403).json({ error: 'Invalid refresh token' });
    }

    const user = await User.findById(payload.userId).select('+refreshToken');

    if (!user || !user.refreshToken) {
      return res.status(403).json({ error: 'Invalid refresh token' });
    }

    // Verify the refresh token hash
    const refreshTokenHash = hashRefreshToken(refreshToken);

    if (user.refreshToken !== refreshTokenHash) {
      // Clear the stored refresh token to prevent reuse of stolen tokens
      user.refreshToken = undefined;
      await user.save();
      return res.status(403).json({ error: 'Invalid refresh token' });
    }

    // Generate new tokens
    const newAccessToken = generateAccessToken(user._id);
    const { refreshToken: newRefreshToken, refreshTokenHash: newRefreshTokenHash } = generateRefreshToken(user._id);

    // Update the refresh token in the database
    user.refreshToken = newRefreshTokenHash;
    await user.save();

    // Set HTTP-only cookies with cross-origin support
    res.cookie('accessToken', newAccessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 15 * 60 * 1000 // 15 minutes
    });

    res.cookie('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    const responseData = {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        profile: user.profile
      }
    };

    // Include tokens in response body for mobile/non-browser clients
    if (req.header('X-Client-Type') === 'mobile' || req.query.includeTokens === 'true') {
      responseData.accessToken = newAccessToken;
      responseData.refreshToken = newRefreshToken;
    }

    res.json({
      success: true,
      data: responseData
    });
  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(500).json({ error: 'Server error during token refresh' });
  }
};

// Logout user
exports.logout = async (req, res) => {
  try {
    // 1. Try to clear the refresh token from the database
    // We try multiple ways to identify the user for maximum reliability
    let userId = req.user?._id;

    if (!userId && req.cookies.refreshToken) {
      try {
        const decoded = jwt.verify(req.cookies.refreshToken, process.env.JWT_SECRET);
        userId = decoded.userId;
      } catch (err) {
        // Refresh token invalid, can't clear from DB by ID but we will still clear cookies
      }
    }

    if (userId) {
      await User.findByIdAndUpdate(userId, { $unset: { refreshToken: 1 } });
    }

    // 2. Always clear cookies with matching settings
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
    };

    res.clearCookie('accessToken', cookieOptions);
    res.clearCookie('refreshToken', cookieOptions);

    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('Logout error:', error);
    // Still try to clear cookies even on error
    res.clearCookie('accessToken');
    res.clearCookie('refreshToken');
    res.status(500).json({ error: 'Server error during logout' });
  }
};

// Update user profile
exports.updateProfile = async (req, res) => {
  try {
    const { name, phone, bio, location, social, role, providerDetails, profile } = req.body;

    const updateData = {};

    // Handle top-level fields
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

    // Handle profile object (preferred structure from onboarding)
    if (profile) {
      if (profile.bio !== undefined) updateData['profile.bio'] = profile.bio;
      if (profile.avatar !== undefined) updateData['profile.avatar'] = profile.avatar;
      if (profile.location !== undefined) {
        // Ensure location is properly structured
        if (typeof profile.location === 'string') {
          // Convert string to proper location object
          updateData['profile.location.address'] = profile.location;
        } else if (typeof profile.location === 'object' && profile.location !== null) {
          // Handle object structure
          if (profile.location.address !== undefined) {
            updateData['profile.location.address'] = profile.location.address;
          }
          if (profile.location.coordinates !== undefined) {
            updateData['profile.location.coordinates'] = profile.location.coordinates;
          }
        }
      }
      if (profile.social !== undefined) {
        if (typeof profile.social === 'object' && profile.social !== null) {
          Object.keys(profile.social).forEach(key => {
            updateData[`profile.social.${key}`] = profile.social[key];
          });
        }
      }
    }

    // Handle legacy flat structure for backward compatibility
    if (bio !== undefined && (profile === undefined || profile.bio === undefined)) updateData['profile.bio'] = bio;
    if (location !== undefined && (profile === undefined || profile.location === undefined)) {
      if (typeof location === 'string') {
        updateData['profile.location.address'] = location;
      } else if (typeof location === 'object' && location !== null) {
        if (location.address !== undefined) {
          updateData['profile.location.address'] = location.address;
        }
        if (location.coordinates !== undefined) {
          updateData['profile.location.coordinates'] = location.coordinates;
        }
      }
    }
    if (social !== undefined && (profile === undefined || profile.social === undefined)) {
      if (typeof social === 'object' && social !== null) {
        Object.keys(social).forEach(key => {
          updateData[`profile.social.${key}`] = social[key];
        });
      }
    }

    // Handle provider details - Use dot notation for nested fields to avoid overwriting the whole object
    if (providerDetails && typeof providerDetails === 'object') {
      Object.keys(providerDetails).forEach(key => {
        if (key === 'availability' && typeof providerDetails.availability === 'object' && providerDetails.availability !== null) {
          // Handle nested availability separately
          Object.keys(providerDetails.availability).forEach(day => {
            updateData[`providerDetails.availability.${day}`] = providerDetails.availability[day];
          });
        } else {
          updateData[`providerDetails.${key}`] = providerDetails[key];
        }
      });
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updateData },
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      success: true,
      data: {
        user
      }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Forgot Password
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    // SECURITY: Always return 200 with a generic message — never reveal whether
    // an account exists (prevents user-enumeration attacks).
    if (!user) {
      return res.status(200).json({
        success: true,
        data: 'If that email is registered, a password reset link has been sent.'
      });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(20).toString('hex');

    // Hash token and set to resetPasswordToken field
    user.resetPasswordToken = crypto
      .createHash('sha256')
      .update(resetToken)
      .digest('hex');

    // Set expire
    user.resetPasswordExpire = Date.now() + 10 * 60 * 1000; // 10 minutes

    await user.save({ validateBeforeSave: false });

    // Create reset url
    // In production, this should be the frontend URL
    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password/${resetToken}`;

    const message = `You are receiving this email because you (or someone else) has requested the reset of a password. Please make a PUT request to: \n\n ${resetUrl}`;

    try {
      // Send password reset email
      const emailService = require('../services/emailService');
      await emailService.sendPasswordReset(email, resetToken, user.name);

      // Development-only: Log reset URL for testing (remove in production)
      // SECURITY: Never log tokens in production environments
      if (process.env.NODE_ENV === 'development' && process.env.LOG_PASSWORD_RESET_URL === 'true') {
        console.log('Reset Password URL (for testing only):', resetUrl);
      }

      res.status(200).json({ success: true, data: 'Email sent' });
    } catch (err) {
      console.error(err);
      user.resetPasswordToken = undefined;
      user.resetPasswordExpire = undefined;

      await user.save({ validateBeforeSave: false });

      return res.status(500).json({ error: 'Email could not be sent' });
    }
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Reset Password
exports.resetPassword = async (req, res) => {
  try {
    // Validate new password before touching the database
    const { password } = req.body;
    if (!password || typeof password !== 'string' || password.trim().length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Get hashed token
    const resetPasswordToken = crypto
      .createHash('sha256')
      .update(req.params.resetToken)
      .digest('hex');

    const user = await User.findOne({
      resetPasswordToken,
      resetPasswordExpire: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    // Set new password
    user.password = password.trim();
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    
    // CRITICAL: Invalidate all existing sessions so compromised accounts cannot sustain access
    user.refreshToken = undefined; 

    await user.save();

    // Log the user in directly? Or ask them to login again?
    // Let's ask them to login again for security

    res.status(200).json({
      success: true,
      data: 'Password updated success'
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};
