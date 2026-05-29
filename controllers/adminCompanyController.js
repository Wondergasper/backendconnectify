const { providerProfileRepository } = require('../repositories/supabase/providerProfileRepository');

/**
 * GET /api/admin/company-providers
 * Admin: list all company providers with optional filters.
 */
exports.listCompanyProviders = async (req, res) => {
  try {
    const { page = 1, limit = 20, verificationStatus } = req.query;

    const result = await providerProfileRepository.listCompanyProviders({
      page: Number(page),
      limit: Number(limit),
      verificationStatus: verificationStatus || undefined
    });

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Admin list company providers error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

/**
 * PATCH /api/admin/company-providers/:id/approve
 * Admin approves a company provider.
 */
exports.approve = async (req, res) => {
  try {
    const { id } = req.params;

    // id here is the provider_profiles.id
    const profile = await providerProfileRepository.findById(id);
    if (!profile) {
      return res.status(404).json({ error: 'Provider profile not found' });
    }

    if (profile.providerType !== 'company') {
      return res.status(400).json({ error: 'Only company providers can be approved via this endpoint' });
    }

    const updated = await providerProfileRepository.approveById(id);
    res.json({ success: true, data: { providerProfile: updated } });
  } catch (error) {
    console.error('Admin approve company provider error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

/**
 * PATCH /api/admin/company-providers/:id/reject
 * Admin rejects a company provider with an optional reason.
 */
exports.reject = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const profile = await providerProfileRepository.findById(id);
    if (!profile) {
      return res.status(404).json({ error: 'Provider profile not found' });
    }

    if (profile.providerType !== 'company') {
      return res.status(400).json({ error: 'Only company providers can be rejected via this endpoint' });
    }

    const updated = await providerProfileRepository.rejectById(id, reason);
    res.json({ success: true, data: { providerProfile: updated } });
  } catch (error) {
    console.error('Admin reject company provider error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};
