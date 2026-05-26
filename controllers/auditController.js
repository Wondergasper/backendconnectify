const { auditRepository } = require('../repositories/supabase/auditRepository');

exports.getAuditLogs = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 25;
    const search = req.query.search;
    const entityType = req.query.entityType;

    const { data: logs, pagination } = await auditRepository.list({
      page,
      limit,
      search,
      entityType
    });

    res.json({
      success: true,
      data: logs,
      pagination
    });
  } catch (error) {
    console.error('Get audit logs error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};
