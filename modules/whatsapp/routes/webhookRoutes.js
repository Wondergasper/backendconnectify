const crypto = require('crypto');
const express = require('express');
const conversationManager = require('../services/conversationManager');

const router = express.Router();

router.get('/', (req, res) => {
  const verifyToken = process.env.VERIFY_TOKEN;
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === verifyToken) {
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

router.post('/', async (req, res) => {
  if (!isValidSignature(req)) {
    return res.sendStatus(403);
  }

  res.sendStatus(200);

  const body = req.body;
  if (body.object !== 'whatsapp_business_account') {
    return;
  }

  try {
    const value = body.entry?.[0]?.changes?.[0]?.value;
    const message = value?.messages?.[0];
    if (!message) {
      return;
    }

    const incomingText = extractMessageText(message);
    if (!incomingText) {
      return;
    }

    await conversationManager.handleIncomingMessage(message.from, incomingText);
  } catch (error) {
    console.error('[WhatsAppWebhook] Error:', error.message || error);
  }
});

function extractMessageText(message) {
  if (message.type === 'text') {
    return message.text?.body;
  }

  if (message.type === 'interactive') {
    return (
      message.interactive?.button_reply?.title ||
      message.interactive?.button_reply?.id ||
      message.interactive?.list_reply?.title ||
      message.interactive?.list_reply?.id
    );
  }

  return null;
}

function isValidSignature(req) {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) {
    // Fail closed in production: never trust unauthenticated webhooks.
    if (process.env.NODE_ENV === 'production') {
      console.error('[WhatsAppWebhook] WHATSAPP_APP_SECRET is not configured; rejecting webhook in production.');
      return false;
    }
    return true;
  }

  const signature = req.headers['x-hub-signature-256'];
  if (!signature) {
    console.error('[WhatsAppWebhook] Signature missing! Rejecting.');
    return false;
  }

  const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body));
  const expected = `sha256=${crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;
  const receivedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  const isValid = receivedBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(receivedBuffer, expectedBuffer);
  if (!isValid) {
    console.error(`[WhatsAppWebhook] Signature mismatch! Expected: ${expected}, Received: ${signature}`);
  }
  return isValid;
}

module.exports = router;
