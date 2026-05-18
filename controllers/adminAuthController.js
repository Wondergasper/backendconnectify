const User = require('../models/User');
const jwt = require('jsonwebtoken');
const { generateAccessToken, generateRefreshToken, hashRefreshToken } = require('../utils/tokenUtils');
const { validationResult } = require('express-validator');

// Admin Login
exports.login = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array(), error: 'Validation failed' });
    }

    const { email, password } = req.body;

    // Find user and explicitly check for admin role
    const user = await User.findOne({ email, role: 'admin' }).select('+password');

    if (!user || !(await user.comparePassword(password))) {
      // SECURITY: Generic error message to prevent account discovery
      return res.status(401).json({ error: 'Invalid admin credentials' });
    }

    if (!user.isActive) {
      return res.status(403).json({ error: 'Admin account is deactivated' });
    }

    // Generate tokens
    const accessToken = generateAccessToken(user._id);
    const { refreshToken, refreshTokenHash } = generateRefreshToken(user._id);

    // Store the refresh token hash in the database
    user.refreshToken = refreshTokenHash;
    await user.save();

    // Set Admin-specific cookies
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    };

    res.cookie('adminAccessToken', accessToken, {
      ...cookieOptions,
      maxAge: 15 * 60 * 1000 // 15 mins
    });

    res.cookie('adminRefreshToken', refreshToken, {
      ...cookieOptions,
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    res.json({
      success: true,
      data: {
        admin: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role
        }
      }
    });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ error: 'Server error during admin login' });
  }
};

// Admin Logout
exports.logout = async (req, res) => {
  try {
    if (req.user) {
      await User.findByIdAndUpdate(req.user._id, { $unset: { refreshToken: 1 } });
    }

    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
    };

    res.clearCookie('adminAccessToken', cookieOptions);
    res.clearCookie('adminRefreshToken', cookieOptions);

    res.json({ success: true, message: 'Admin logged out' });
  } catch (error) {
    res.status(500).json({ error: 'Logout failed' });
  }
};

// Verify Admin Session (used by frontend to check if still logged in)
exports.verifySession = async (req, res) => {
  res.json({
    success: true,
    data: {
      admin: {
        id: req.user._id,
        name: req.user.name,
        email: req.user.email,
        role: req.user.role
      }
    }
  });
};
