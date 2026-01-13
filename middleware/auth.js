const jwt = require('jsonwebtoken');
const User = require('../models/User');
const crypto = require('crypto');

// Function to generate refresh token and its hash
const generateRefreshToken = (userId) => {
  // Create a longer-lived token
  const refreshToken = jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: '7d' // 7 days
  });

  // Also create a random string to store in the database for additional security
  const refreshTokenHash = crypto
    .createHash('sha256')
    .update(refreshToken)
    .digest('hex');

  return { refreshToken, refreshTokenHash };
};

const auth = async (req, res, next) => {
  try {
    // First try to get token from cookies
    let token = req.cookies.accessToken;

    if (!token) {
      // Fallback to Authorization header for compatibility during transition
      token = req.header('Authorization')?.replace('Bearer ', '');
    }

    if (!token) {
      return res.status(401).json({ error: 'No access token, authorization denied' });
    }

    try {
      // Try to verify the access token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.userId).select('-password');

      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }

      req.user = user;
      next();
    } catch (verifyError) {
      // If the access token is expired/invalid, try to refresh it automatically
      const refreshToken = req.cookies.refreshToken;

      if (!refreshToken) {
        return res.status(401).json({ error: 'No refresh token available' });
      }

      try {
        // Verify the refresh token
        const refreshPayload = jwt.verify(refreshToken, process.env.JWT_SECRET);

        // Find user and check if the refresh token hash matches
        const user = await User.findById(refreshPayload.userId).select('+refreshToken');

        if (!user || !user.refreshToken) {
          return res.status(403).json({ error: 'User or refresh token not found' });
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
          return res.status(403).json({ error: 'Invalid refresh token hash' });
        }

        // Generate new tokens
        const newAccessToken = jwt.sign(
          { userId: user._id },
          process.env.JWT_SECRET,
          { expiresIn: '15m' }
        );

        const { refreshToken: newRefreshToken, refreshTokenHash: newRefreshTokenHash } = generateRefreshToken(user._id);

        // Update the refresh token in the database
        user.refreshToken = newRefreshTokenHash;
        await user.save();

        // Update both cookies with new tokens
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

        // Set the new user info in the request and continue
        req.user = user;
        next();
      } catch (refreshError) {
        return res.status(403).json({ error: 'Both tokens are invalid' });
      }
    }
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(401).json({ error: 'Authentication error' });
  }
};

const checkRole = (roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    next();
  };
};

module.exports = { auth, checkRole };