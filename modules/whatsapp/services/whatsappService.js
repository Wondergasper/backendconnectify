const axios = require('axios');

const MAX_SEND_ATTEMPTS = 2;

/**
 * Sends a text message to a user via Meta WhatsApp Cloud API.
 * Makes one retry for transient failures and never logs request bodies.
 */
exports.sendMessage = async (to, text, attempt = 1) => {
  try {
    const token = process.env.WHATSAPP_TOKEN;
    const phone_id = process.env.WHATSAPP_PHONE_ID;

    if (!token || !phone_id) {
      console.warn("WhatsApp credentials not set. Simulated sending to " + to + ":", text);
      return;
    }

    const response = await axios({
      method: 'POST',
      url: `https://graph.facebook.com/v18.0/${phone_id}/messages`,
      data: {
        messaging_product: 'whatsapp',
        to: to,
        text: { body: text },
      },
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      timeout: 15000,
    });

    console.log(`Message sent to ${to}: ${response.status}`);
    return response.data;
  } catch (error) {
    const status = error.response?.status;
    const apiError = error.response?.data?.error?.message;
    console.error(`Error sending WhatsApp message to ${to} (HTTP ${status || 'n/a'}):`, apiError || error.message);

    // Retry once for transient/server errors (5xx, timeouts, rate limits).
    if (attempt < MAX_SEND_ATTEMPTS - 1 && (status >= 500 || status === 429 || !status)) {
      return exports.sendMessage(to, text, attempt + 1);
    }
  }
};