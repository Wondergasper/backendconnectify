const { auditRepository } = require('../repositories/supabase/auditRepository');

async function logAudit({
  req,
  action,
  entityType,
  entityId,
  target,
  metadata = {}
}) {
  try {
    await auditRepository.createLog({
      actorId: req?.user?._id || req?.user?.id,
      actorName: req?.user?.name || 'System',
      actorRole: req?.user?.role || 'system',
      action,
      entityType,
      entityId: entityId ? String(entityId) : undefined,
      target,
      metadata,
      ipAddress: req?.ip,
      userAgent: req?.headers?.['user-agent']
    });
  } catch (error) {
    console.error('Audit log write failed:', error.message);
  }
}

module.exports = { logAudit };
