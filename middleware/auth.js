const jwt = require('jsonwebtoken');
const User = require('../models/User');

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

      if (!user || user.isActive === false) {
        return res.status(401).json({ error: 'User not found or account is deactivated' });
      }

      req.user = user;
      next();
    } catch (verifyError) {
      return res.status(401).json({ error: 'Session expired. Please refresh your session.' });
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
