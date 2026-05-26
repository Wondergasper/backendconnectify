const express = require('express');
const { getAuditLogs } = require('../controllers/auditController');
const { auth, checkRole } = require('../middleware/auth');

const router = express.Router();

router.get('/', auth, checkRole(['admin']), getAuditLogs);

module.exports = router;
