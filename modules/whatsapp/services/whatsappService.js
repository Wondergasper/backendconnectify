const axios = require('axios');

/**
 * Sends a text message to a user via Meta WhatsApp Cloud API
 */
exports.sendMessage = async (to, text) => {
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
    });

    console.log(`Message sent to ${to}: ${response.status}`);
    return response.data;
  } catch (error) {
    console.error('Error sending WhatsApp message:', error.response ? error.response.data : error.message);
  }
};
