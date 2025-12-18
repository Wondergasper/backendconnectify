const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { validationResult } = require('express-validator');
const crypto = require('crypto');

// Check if JWT secret is properly set
if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'fallback_secret_key') {
  console.warn('WARNING: Using fallback JWT secret in auth controller. Please set JWT_SECRET in .env for production use.');
}

// Generate JWT access token
const generateAccessToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET || 'fallback_secret_key', {
    expiresIn: '15m' // 15 minutes
  });
};

// Generate refresh token
const generateRefreshToken = (userId) => {
  // Create a longer-lived token
  const refreshToken = jwt.sign({ userId }, process.env.JWT_SECRET || 'fallback_secret_key', {
    expiresIn: '7d' // 7 days
  });

  // Also create a random string to store in the database for additional security
  const refreshTokenHash = crypto
    .createHash('sha256')
    .update(refreshToken)
    .digest('hex');

  return { refreshToken, refreshTokenHash };
};

// Register user
exports.register = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('Register validation errors:', errors.array());
      return res.status(400).json({ errors: errors.array(), error: 'Validation failed' });
    }

    const { name, email, phone, password, role } = req.body;

    // Check if user already exists
    let user = await User.findOne({
      $or: [{ email }, { phone }]
    });

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
      role: role || 'customer'
    });

    await user.save();

    // Generate tokens
    const accessToken = generateAccessToken(user._id);
    const { refreshToken, refreshTokenHash } = generateRefreshToken(user._id);

    // Store the refresh token hash in the database
    user.refreshToken = refreshTokenHash;
    await user.save();

    // Set HTTP-only cookies
    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // Set to true in production with HTTPS
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000 // 15 minutes
    });

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // Set to true in production with HTTPS
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    res.status(201).json({
      success: true,
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
          profile: user.profile
        }
      }
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

    // Debug logging
    console.log('Login attempt with:', { email, phone, hasPassword: !!password });

    // Find user by email or phone
    const user = await User.findOne({
      $or: [{ email }, { phone }]
    }).select('+password'); // Include password in query

    console.log('User lookup result:', {
      userFound: !!user,
      userId: user?._id,
      emailMatch: email && user?.email === email,
      phoneMatch: phone && user?.phone === phone,
      passwordCheck: user ? await user.comparePassword(password) : false
    });

    if (!user || !(await user.comparePassword(password))) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    // Generate tokens
    const accessToken = generateAccessToken(user._id);
    const { refreshToken, refreshTokenHash } = generateRefreshToken(user._id);

    // Store the refresh token hash in the database
    user.refreshToken = refreshTokenHash;
    await user.save();

    // Set HTTP-only cookies
    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // Set to true in production with HTTPS
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000 // 15 minutes
    });

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // Set to true in production with HTTPS
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    res.json({
      success: true,
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
          profile: user.profile
        }
      }
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
      payload = jwt.verify(refreshToken, process.env.JWT_SECRET || 'fallback_secret_key');
    } catch (error) {
      return res.status(403).json({ error: 'Invalid refresh token' });
    }

    const user = await User.findById(payload.userId).select('+refreshToken');

    if (!user || !user.refreshToken) {
      return res.status(403).json({ error: 'Invalid refresh token' });
    }

    // Verify the refresh token hash
    const refreshTokenHash = crypto
      .createHash('sha256')
      .update(refreshToken)
      .digest('hex');

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

    // Set HTTP-only cookies
    res.cookie('accessToken', newAccessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // Set to true in production with HTTPS
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000 // 15 minutes
    });

    res.cookie('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // Set to true in production with HTTPS
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    res.json({
      success: true,
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
          profile: user.profile
        }
      }
    });
  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(500).json({ error: 'Server error during token refresh' });
  }
};

// Logout user
exports.logout = async (req, res) => {
  try {
    // Clear the refresh token from the database
    if (req.user) {
      await User.findByIdAndUpdate(req.user._id, { refreshToken: undefined });
    }

    // Clear cookies
    res.clearCookie('accessToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax'
    });

    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax'
    });

    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('Logout error:', error);
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
    if (role && ['customer', 'provider'].includes(role)) {
      updateData.role = role;
    }

    // Handle profile object (preferred structure from onboarding)
    if (profile) {
      if (profile.bio) updateData['profile.bio'] = profile.bio;
      if (profile.avatar) updateData['profile.avatar'] = profile.avatar;
      if (profile.location) {
        // Ensure location is properly structured
        if (typeof profile.location === 'string') {
          // Convert string to proper location object
          updateData['profile.location.address'] = profile.location;
        } else if (typeof profile.location === 'object') {
          // Handle object structure
          if (profile.location.address) {
            updateData['profile.location.address'] = profile.location.address;
          }
          if (profile.location.coordinates) {
            updateData['profile.location.coordinates'] = profile.location.coordinates;
          }
        }
      }
      if (profile.social) updateData['profile.social'] = profile.social;
    }

    // Handle legacy flat structure for backward compatibility
    if (bio && !profile?.bio) updateData['profile.bio'] = bio;
    if (location && !profile?.location) {
      if (typeof location === 'string') {
        updateData['profile.location.address'] = location;
      } else if (typeof location === 'object') {
        if (location.address) {
          updateData['profile.location.address'] = location.address;
        }
        if (location.coordinates) {
          updateData['profile.location.coordinates'] = location.coordinates;
        }
      }
    }
    if (social && !profile?.social) updateData['profile.social'] = social;

    // Handle provider details
    if (providerDetails) {
      Object.keys(providerDetails).forEach(key => {
        updateData[`providerDetails.${key}`] = providerDetails[key];
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

    if (!user) {
      return res.status(404).json({ error: 'There is no user with that email' });
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
      // TODO: Implement actual email sending here using nodemailer
      // For now, we'll just log the token to the console for development
      console.log('Reset Password Token:', resetToken);
      console.log('Reset Password URL:', resetUrl);

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
      return res.status(400).json({ error: 'Invalid token' });
    }

    // Set new password
    user.password = req.body.password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;

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