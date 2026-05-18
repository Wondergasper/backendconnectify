const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Specialized auth middleware for the Admin Dashboard.
 * Checks for 'adminAccessToken' in cookies instead of the standard 'accessToken'.
 */
const adminAuth = async (req, res, next) => {
  try {
    const token = req.cookies.adminAccessToken;

    if (!token) {
      return res.status(401).json({ error: 'Admin session expired or unauthorized' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select('role isActive');

    if (!user || user.role !== 'admin' || user.isActive === false) {
      return res.status(403).json({ error: 'Admin access denied' });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Admin Auth Error:', error);
    res.status(401).json({ error: 'Admin authentication failed' });
  }
};

module.exports = adminAuth;