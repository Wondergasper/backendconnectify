const { serviceRequestRepository } = require('../repositories/supabase/serviceRequestRepository');

/**
 * GET /api/provider/requests
 * List service requests visible to the authenticated provider.
 */
exports.listRequests = async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const profile = req.providerProfile;

    const result = await serviceRequestRepository.listForProvider(profile.id, {
      page: Number(page),
      limit: Number(limit),
      status: status || undefined
    });

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('List service requests error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

/**
 * GET /api/provider/requests/:id
 */
exports.getRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const profile = req.providerProfile;

    const request = await serviceRequestRepository.findById(id);
    if (!request) {
      return res.status(404).json({ error: 'Service request not found' });
    }

    // Allow access if request is open (pending/matched) or assigned to this provider
    const isOpen = ['pending', 'matched'].includes(request.status);
    const isAssigned = request.assignedProviderId === profile.id;

    if (!isOpen && !isAssigned) {
      return res.status(403).json({ error: 'Access denied to this service request' });
    }

    res.json({ success: true, data: { request } });
  } catch (error) {
    console.error('Get service request error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

/**
 * PATCH /api/provider/requests/:id/accept
 * Provider accepts a service request (assigns themselves).
 */
exports.acceptRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const profile = req.providerProfile;

    const request = await serviceRequestRepository.findById(id);
    if (!request) {
      return res.status(404).json({ error: 'Service request not found' });
    }

    if (!['pending', 'matched', 'quoted'].includes(request.status)) {
      return res.status(400).json({ error: `Cannot accept a request with status: ${request.status}` });
    }

    const updated = await serviceRequestRepository.assignProvider(id, profile.id);
    res.json({ success: true, data: { request: updated } });
  } catch (error) {
    console.error('Accept service request error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

/**
 * PATCH /api/provider/requests/:id/reject
 * Provider declines a service request.
 */
exports.rejectRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const profile = req.providerProfile;

    const request = await serviceRequestRepository.findById(id);
    if (!request) {
      return res.status(404).json({ error: 'Service request not found' });
    }

    // Only reject if it's currently assigned to this provider
    if (request.assignedProviderId && request.assignedProviderId !== profile.id) {
      return res.status(403).json({ error: 'This request is assigned to another provider' });
    }

    if (!['pending', 'matched', 'quoted', 'accepted', 'assigned'].includes(request.status)) {
      return res.status(400).json({ error: `Cannot reject a request with status: ${request.status}` });
    }

    const updated = await serviceRequestRepository.updateStatus(id, 'cancelled');
    res.json({ success: true, data: { request: updated } });
  } catch (error) {
    console.error('Reject service request error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};
