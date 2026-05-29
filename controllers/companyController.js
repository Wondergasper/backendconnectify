const { providerProfileRepository } = require('../repositories/supabase/providerProfileRepository');
const { providerServiceRepository } = require('../repositories/supabase/providerServiceRepository');
const { teamMemberRepository } = require('../repositories/supabase/teamMemberRepository');
const { serviceRequestRepository } = require('../repositories/supabase/serviceRequestRepository');
const { jobQuoteRepository } = require('../repositories/supabase/jobQuoteRepository');

/**
 * GET /api/company/dashboard
 * Aggregated stats for a company provider.
 * req.providerProfile is attached by requireCompanyProvider middleware.
 */
exports.getDashboard = async (req, res) => {
  try {
    const profile = req.providerProfile;

    // Run all stat queries in parallel
    const [servicesResult, teamResult, requestsResult, quotesResult] = await Promise.all([
      providerServiceRepository.listByProviderId(profile.id, { limit: 1 }),
      teamMemberRepository.listByProviderId(profile.id, { limit: 1 }),
      serviceRequestRepository.listForProvider(profile.id, { status: 'pending', limit: 1 }),
      jobQuoteRepository.listForProvider(profile.id, { status: 'pending', limit: 1 })
    ]);

    // Active jobs: requests assigned to this provider that are in progress
    const activeJobsResult = await serviceRequestRepository.listForProvider(profile.id, {
      status: 'in_progress', limit: 1
    });

    res.json({
      success: true,
      data: {
        company: {
          id: profile.id,
          displayName: profile.displayName,
          businessName: profile.businessName,
          verificationStatus: profile.verificationStatus,
          rating: profile.rating,
          isActive: profile.isActive
        },
        stats: {
          totalServices: servicesResult.pagination.total,
          totalTeamMembers: teamResult.pagination.total,
          pendingRequests: requestsResult.pagination.total,
          activeJobs: activeJobsResult.pagination.total,
          pendingQuotes: quotesResult.pagination.total
        }
      }
    });
  } catch (error) {
    console.error('Company dashboard error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

/**
 * PATCH /api/company/profile
 * Update company-specific profile fields.
 */
exports.updateProfile = async (req, res) => {
  try {
    const {
      displayName, businessName, contactPersonName, description,
      phone, email, address, location, operatingLocations
    } = req.body;

    const profile = await providerProfileRepository.updateByUserId(req.user._id, {
      displayName, businessName, contactPersonName, description,
      phone, email, address, location, operatingLocations
    });

    res.json({ success: true, data: { providerProfile: profile } });
  } catch (error) {
    console.error('Update company profile error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

/**
 * GET /api/company/verification-status
 * Returns the current verification status.
 */
exports.getVerificationStatus = async (req, res) => {
  try {
    const profile = req.providerProfile;
    res.json({
      success: true,
      data: {
        verificationStatus: profile.verificationStatus,
        rejectionReason: profile.rejectionReason || null
      }
    });
  } catch (error) {
    console.error('Get verification status error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};
