const express = require('express');
const webhookRoutes = require('./routes/webhookRoutes');

const router = express.Router();

router.use('/webhook', webhookRoutes);

router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    channel: 'whatsapp',
    database: 'supabase'
  });
});

module.exports = router;
