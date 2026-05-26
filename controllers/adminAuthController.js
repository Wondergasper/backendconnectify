const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const { generateAccessToken, generateRefreshToken, hashRefreshToken } = require('../utils/tokenUtils');
const { userRepository } = require('../repositories/supabase/userRepository');

const adminCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
};

exports.login = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array(), error: 'Validation failed' });
    }

    const { email, password } = req.body;
    const user = await userRepository.findForLogin({ email });

    if (!user || user.role !== 'admin' || !(await bcrypt.compare(password, user.passwordHash || ''))) {
      return res.status(401).json({ error: 'Invalid admin credentials' });
    }

    if (!user.isActive) {
      return res.status(403).json({ error: 'Admin account is deactivated' });
    }

    const accessToken = generateAccessToken(user._id);
    const { refreshToken, refreshTokenHash } = generateRefreshToken(user._id);
    await userRepository.updateRefreshToken(user._id, refreshTokenHash);

    res.cookie('adminAccessToken', accessToken, {
      ...adminCookieOptions,
      maxAge: 15 * 60 * 1000
    });

    res.cookie('adminRefreshToken', refreshToken, {
      ...adminCookieOptions,
      maxAge: 7 * 24 * 60 * 60 * 1000
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

exports.logout = async (req, res) => {
  try {
    if (req.user) {
      await userRepository.clearRefreshToken(req.user._id);
    }

    res.clearCookie('adminAccessToken', adminCookieOptions);
    res.clearCookie('adminRefreshToken', adminCookieOptions);

    res.json({ success: true, message: 'Admin logged out' });
  } catch (error) {
    console.error('Admin logout error:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
};

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

exports.refreshToken = async (req, res) => {
  try {
    const incomingRefreshToken = req.cookies.adminRefreshToken;

    if (!incomingRefreshToken) {
      return res.status(401).json({ error: 'Admin refresh token not found. Please log in again.' });
    }

    let decoded;
    try {
      decoded = jwt.verify(incomingRefreshToken, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ error: 'Admin refresh token is invalid or expired. Please log in again.' });
    }

    const user = await userRepository.findById(decoded.userId, { includePrivate: true });

    if (!user || user.refreshTokenHash !== hashRefreshToken(incomingRefreshToken)) {
      if (user) {
        await userRepository.clearRefreshToken(user._id);
      }
      return res.status(401).json({ error: 'Admin session is invalid. Please log in again.' });
    }

    if (user.role !== 'admin' || user.isActive === false) {
      return res.status(403).json({ error: 'Admin access denied.' });
    }

    const newAccessToken = generateAccessToken(user._id);
    const { refreshToken: newRefreshToken, refreshTokenHash: newRefreshTokenHash } = generateRefreshToken(user._id);
    await userRepository.updateRefreshToken(user._id, newRefreshTokenHash);

    res.cookie('adminAccessToken', newAccessToken, {
      ...adminCookieOptions,
      maxAge: 15 * 60 * 1000
    });

    res.cookie('adminRefreshToken', newRefreshToken, {
      ...adminCookieOptions,
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.json({ success: true, message: 'Admin token refreshed' });
  } catch (error) {
    console.error('Admin refresh token error:', error);
    res.status(500).json({ error: 'Server error during token refresh' });
  }
};
