const { validationResult } = require('express-validator');
const { teamMemberRepository } = require('../repositories/supabase/teamMemberRepository');

/**
 * POST /api/company/team
 */
exports.addMember = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array(), error: 'Validation failed' });
    }

    const { fullName, role, phone, email, status } = req.body;
    const profile = req.providerProfile;

    const member = await teamMemberRepository.create({
      providerId: profile.id,
      fullName,
      role,
      phone,
      email: email || null,
      status: status || 'active'
    });

    res.status(201).json({ success: true, data: { member } });
  } catch (error) {
    console.error('Add team member error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

/**
 * GET /api/company/team
 */
exports.listMembers = async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const profile = req.providerProfile;

    const result = await teamMemberRepository.listByProviderId(profile.id, {
      page: Number(page),
      limit: Number(limit)
    });

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('List team members error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

/**
 * PATCH /api/company/team/:id
 */
exports.updateMember = async (req, res) => {
  try {
    const { id } = req.params;
    const { fullName, role, phone, email, status } = req.body;
    const profile = req.providerProfile;

    const existing = await teamMemberRepository.findByIdAndProviderId(id, profile.id);
    if (!existing) {
      return res.status(404).json({ error: 'Team member not found or access denied' });
    }

    const member = await teamMemberRepository.updateByIdAndProviderId(id, profile.id, {
      fullName, role, phone, email, status
    });

    res.json({ success: true, data: { member } });
  } catch (error) {
    console.error('Update team member error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

/**
 * DELETE /api/company/team/:id
 */
exports.removeMember = async (req, res) => {
  try {
    const { id } = req.params;
    const profile = req.providerProfile;

    const existing = await teamMemberRepository.findByIdAndProviderId(id, profile.id);
    if (!existing) {
      return res.status(404).json({ error: 'Team member not found or access denied' });
    }

    await teamMemberRepository.deleteByIdAndProviderId(id, profile.id);
    res.json({ success: true, message: 'Team member removed successfully' });
  } catch (error) {
    console.error('Remove team member error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};
