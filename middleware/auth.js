const jwt = require('jsonwebtoken');
const { userRepository } = require('../repositories/supabase/userRepository');

const auth = async (req, res, next) => {
  try {
    // Priority 1: standard user session cookie
    let token = req.cookies.accessToken;

    // Priority 2: Bearer token in Authorization header
    if (!token) {
      token = req.header('Authorization')?.replace('Bearer ', '');
    }

    // Priority 3: admin session cookie — allows admins who logged in via
    // /admin/auth/login to reach any auth-protected route without a separate
    // normal-user session. adminAuth middleware still provides the stricter
    // admin-only guard on dedicated admin routes.
    if (!token) {
      token = req.cookies.adminAccessToken;
    }

    if (!token) {
      return res.status(401).json({ error: 'No access token, authorization denied' });
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await userRepository.findById(decoded.userId);

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
