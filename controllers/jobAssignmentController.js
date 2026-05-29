const { serviceRequestRepository } = require('../repositories/supabase/serviceRequestRepository');
const { teamMemberRepository } = require('../repositories/supabase/teamMemberRepository');

/**
 * PATCH /api/company/jobs/:id/assign
 * Assign a team member to a job/service request (company-only).
 */
exports.assignJob = async (req, res) => {
  try {
    const { id } = req.params;
    const { teamMemberId } = req.body;
    const profile = req.providerProfile;

    if (!teamMemberId) {
      return res.status(400).json({ error: 'teamMemberId is required' });
    }

    // Verify the job is assigned to this company
    const request = await serviceRequestRepository.findById(id);
    if (!request) {
      return res.status(404).json({ error: 'Service request not found' });
    }

    if (request.assignedProviderId !== profile.id) {
      return res.status(403).json({ error: 'This job is not assigned to your company' });
    }

    // Verify the team member belongs to this company
    const member = await teamMemberRepository.findByIdAndProviderId(teamMemberId, profile.id);
    if (!member) {
      return res.status(404).json({ error: 'Team member not found or does not belong to your company' });
    }

    if (member.status !== 'active') {
      return res.status(400).json({ error: 'Cannot assign an inactive team member' });
    }

    const updated = await serviceRequestRepository.assignTeamMember(id, teamMemberId);
    res.json({ success: true, data: { request: updated } });
  } catch (error) {
    console.error('Assign job error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

/**
 * PATCH /api/company/jobs/:id/status
 * Update the status of a job assigned to this company.
 */
exports.updateJobStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const profile = req.providerProfile;

    const VALID_STATUSES = ['in_progress', 'completed', 'cancelled'];
    if (!status || !VALID_STATUSES.includes(status)) {
      return res.status(400).json({
        error: `Invalid status. Allowed values: ${VALID_STATUSES.join(', ')}`
      });
    }

    const request = await serviceRequestRepository.findById(id);
    if (!request) {
      return res.status(404).json({ error: 'Service request not found' });
    }

    if (request.assignedProviderId !== profile.id) {
      return res.status(403).json({ error: 'This job is not assigned to your company' });
    }

    const updated = await serviceRequestRepository.updateStatus(id, status);
    res.json({ success: true, data: { request: updated } });
  } catch (error) {
    console.error('Update job status error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};
