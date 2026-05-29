const { validationResult } = require('express-validator');
const { providerProfileRepository } = require('../repositories/supabase/providerProfileRepository');

/**
 * POST /api/providers/onboard
 * Creates or updates the provider profile. Sets providerType.
 */
exports.onboard = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array(), error: 'Validation failed' });
    }

    const userId = req.user._id;
    const {
      providerType, displayName, businessName, contactPersonName,
      description, phone, email, address, location, operatingLocations
    } = req.body;

    // Validate company-specific required fields
    if (providerType === 'company') {
      if (!businessName || !businessName.trim()) {
        return res.status(400).json({ error: 'businessName is required for company providers' });
      }
      if (!contactPersonName || !contactPersonName.trim()) {
        return res.status(400).json({ error: 'contactPersonName is required for company providers' });
      }
    }

    // Check if profile already exists
    const existing = await providerProfileRepository.findByUserId(userId);
    if (existing) {
      return res.status(400).json({ error: 'Provider profile already exists. Use PATCH /api/providers/me to update.' });
    }

    const profile = await providerProfileRepository.create({
      userId,
      providerType: providerType || 'individual',
      displayName: displayName || req.user.name,
      businessName: providerType === 'company' ? businessName : null,
      contactPersonName: providerType === 'company' ? contactPersonName : null,
      description,
      phone: phone || req.user.phone,
      email: email || req.user.email,
      address,
      location,
      operatingLocations
    });

    res.status(201).json({ success: true, data: { providerProfile: profile } });
  } catch (error) {
    console.error('Provider onboard error:', error);
    res.status(500).json({ error: 'Server error during onboarding' });
  }
};

/**
 * GET /api/providers/me
 * Returns the authenticated provider's profile.
 */
exports.getMyProfile = async (req, res) => {
  try {
    const profile = await providerProfileRepository.findByUserId(req.user._id);

    if (!profile) {
      return res.status(404).json({ error: 'Provider profile not found. Please complete onboarding.' });
    }

    res.json({ success: true, data: { providerProfile: profile } });
  } catch (error) {
    console.error('Get provider profile error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

/**
 * PATCH /api/providers/me
 * Updates the authenticated provider's profile.
 */
exports.updateMyProfile = async (req, res) => {
  try {
    const {
      displayName, businessName, contactPersonName, description,
      phone, email, address, location, operatingLocations
    } = req.body;

    const existing = await providerProfileRepository.findByUserId(req.user._id);
    if (!existing) {
      return res.status(404).json({ error: 'Provider profile not found. Please complete onboarding first.' });
    }

    // Guard company-only fields for individual providers
    if (existing.providerType === 'individual' && (businessName || contactPersonName)) {
      return res.status(400).json({ error: 'businessName and contactPersonName are only applicable to company providers' });
    }

    const profile = await providerProfileRepository.updateByUserId(req.user._id, {
      displayName, businessName, contactPersonName, description,
      phone, email, address, location, operatingLocations
    });

    res.json({ success: true, data: { providerProfile: profile } });
  } catch (error) {
    console.error('Update provider profile error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};
