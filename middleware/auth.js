const jwt = require('jsonwebtoken');
const { userRepository } = require('../repositories/supabase/userRepository');
const { AuthError, ForbiddenError } = require('../utils/errors');

const auth = async (req, res, next) => {
  try {
    // Priority 1: standard user session cookie
    let token = req.cookies.accessToken;

    // Priority 2: Bearer token in Authorization header
    if (!token) {
      token = req.header('Authorization')?.replace('Bearer ', '');
    }

    // Priority 3: admin session cookie
    if (!token) {
      token = req.cookies.adminAccessToken;
    }

    if (!token) {
      throw new AuthError('No access token, authorization denied');
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await userRepository.findById(decoded.userId);

      if (!user || user.isActive === false) {
        throw new AuthError('User not found or account is deactivated');
      }

      req.user = user;
      next();
    } catch (verifyError) {
      if (verifyError instanceof AuthError) throw verifyError;
      throw new AuthError('Session expired. Please refresh your session.');
    }
  } catch (error) {
    next(error);
  }
};

const checkRole = (roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return next(new ForbiddenError('Access denied: insufficient permissions'));
    }
    next();
  };
};

/**
 * Requires the authenticated user to be a provider (role === 'provider').
 */
const requireProvider = (req, res, next) => {
  if (req.user.role !== 'provider') {
    return next(new ForbiddenError('Access denied: provider role required'));
  }
  next();
};

/**
 * Requires the authenticated user to be a company provider.
 * Fetches the provider profile and attaches it to req.providerProfile.
 */
const requireCompanyProvider = async (req, res, next) => {
  try {
    if (req.user.role !== 'provider') {
      throw new ForbiddenError('Access denied: provider role required');
    }

    const { providerProfileRepository } = require('../repositories/supabase/providerProfileRepository');
    const profile = await providerProfileRepository.findByUserId(req.user._id);

    if (!profile) {
      throw new ForbiddenError('Provider profile not found. Please complete onboarding.');
    }

    if (profile.providerType !== 'company') {
      throw new ForbiddenError('Access denied: company provider account required');
    }

    req.providerProfile = profile;
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Requires the authenticated user to be any provider (individual or company).
 * Fetches and attaches the provider profile to req.providerProfile.
 */
const requireAnyProvider = async (req, res, next) => {
  try {
    if (req.user.role !== 'provider') {
      throw new ForbiddenError('Access denied: provider role required');
    }

    const { providerProfileRepository } = require('../repositories/supabase/providerProfileRepository');
    const profile = await providerProfileRepository.findByUserId(req.user._id);

    if (!profile) {
      throw new ForbiddenError('Provider profile not found. Please complete onboarding.');
    }

    req.providerProfile = profile;
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = { auth, checkRole, requireProvider, requireCompanyProvider, requireAnyProvider };

module.exports = { auth, checkRole, requireProvider, requireCompanyProvider, requireAnyProvider };

