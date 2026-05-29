const { validationResult } = require('express-validator');
const { providerServiceRepository } = require('../repositories/supabase/providerServiceRepository');

/**
 * POST /api/provider-services
 */
exports.create = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array(), error: 'Validation failed' });
    }

    const { serviceName, category, description, startingPrice, priceType, isAvailable } = req.body;
    const profile = req.providerProfile;

    const service = await providerServiceRepository.create({
      providerId: profile.id,
      serviceName,
      category,
      description,
      startingPrice: startingPrice !== undefined ? Number(startingPrice) : undefined,
      priceType,
      isAvailable: isAvailable !== undefined ? isAvailable : true
    });

    res.status(201).json({ success: true, data: { service } });
  } catch (error) {
    console.error('Create provider service error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

/**
 * GET /api/provider-services
 */
exports.list = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const profile = req.providerProfile;

    const result = await providerServiceRepository.listByProviderId(profile.id, {
      page: Number(page),
      limit: Number(limit)
    });

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('List provider services error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

/**
 * PATCH /api/provider-services/:id
 */
exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const profile = req.providerProfile;
    const { serviceName, category, description, startingPrice, priceType, isAvailable } = req.body;

    const existing = await providerServiceRepository.findByIdAndProviderId(id, profile.id);
    if (!existing) {
      return res.status(404).json({ error: 'Service not found or you do not have permission to edit it' });
    }

    const service = await providerServiceRepository.updateByIdAndProviderId(id, profile.id, {
      serviceName, category, description,
      startingPrice: startingPrice !== undefined ? Number(startingPrice) : undefined,
      priceType, isAvailable
    });

    res.json({ success: true, data: { service } });
  } catch (error) {
    console.error('Update provider service error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

/**
 * DELETE /api/provider-services/:id
 */
exports.remove = async (req, res) => {
  try {
    const { id } = req.params;
    const profile = req.providerProfile;

    const existing = await providerServiceRepository.findByIdAndProviderId(id, profile.id);
    if (!existing) {
      return res.status(404).json({ error: 'Service not found or you do not have permission to delete it' });
    }

    await providerServiceRepository.deleteByIdAndProviderId(id, profile.id);
    res.json({ success: true, message: 'Service deleted successfully' });
  } catch (error) {
    console.error('Delete provider service error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};
