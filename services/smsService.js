// services/smsService.js

/**
 * Low-level SMS Driver for MailerSend (Twilio Alternative)
 * Built with native Fetch to keep dependencies lightweight.
 */
class SmsService {
    constructor() {
        this.provider = process.env.SMS_PROVIDER || 'mailersend';
        this.apiKey = process.env.SMS_API_KEY;
        this.sender = process.env.SMS_SENDER_NUMBER;
    }

    /**
     * Formats local phone numbers (like 0803...) into international E.164 standard (like +234803...)
     * Connectify operates in Nigeria, so default country code is +234.
     * @param {string} phone - Raw phone number input
     * @returns {string} Normalized international phone number
     */
    formatPhoneNumber(phone) {
        if (!phone) return '';
        
        // Strip out all non-digit characters except leading '+'
        let cleaned = phone.replace(/[^\d+]/g, '');

        // If it starts with a plus, assume it is already E.164 compliant
        if (cleaned.startsWith('+')) {
            return cleaned;
        }

        // If it starts with a country code without a leading plus (e.g., 234803...)
        if (cleaned.startsWith('234') && cleaned.length >= 13) {
            return `+${cleaned}`;
        }

        // If it starts with a local zero (e.g., 0803...), replace the 0 with +234
        if (cleaned.startsWith('0') && cleaned.length >= 10) {
            return `+234${cleaned.slice(1)}`;
        }

        // If it is just a 10-digit number without leading zero, prepend +234
        if (cleaned.length === 10) {
            return `+234${cleaned}`;
        }

        // Fallback: return as-is
        return cleaned;
    }

    /**
     * Send raw SMS message to a recipient
     * @param {string} to - Recipient phone number
     * @param {string} message - Text message content
     * @returns {Promise<{success: boolean, messageId?: string, error?: string}>}
     */
    async sendRawSms(to, message) {
        const normalizedTo = this.formatPhoneNumber(to);
        
        if (!normalizedTo) {
            console.warn('⚠️ Cannot send SMS: Recipient phone number is empty.');
            return { success: false, error: 'Empty recipient phone number' };
        }

        if (!this.apiKey || !this.sender) {
            console.warn('⚠️ SMS service configuration is missing (SMS_API_KEY or SMS_SENDER_NUMBER). Skipping SMS send.');
            return { success: false, error: 'Config missing' };
        }

        try {
            if (this.provider === 'mailersend') {
                return await this._sendViaMailerSend(normalizedTo, message);
            } else {
                throw new Error(`Unsupported SMS provider: ${this.provider}`);
            }
        } catch (error) {
            console.error(`❌ SMS transmission failed via ${this.provider}:`, error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * MailerSend SMS dispatch implementation
     * @private
     */
    async _sendViaMailerSend(to, message) {
        // MailerSend SMS endpoint
        const url = 'https://api.mailersend.com/v1/sms';

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`
            },
            body: JSON.stringify({
                from: this.sender,
                to: [to],
                text: message
            })
        });

        if (!response.ok) {
            const errBody = await response.text();
            throw new Error(`MailerSend HTTP ${response.status}: ${errBody}`);
        }

        const data = await response.json();
        
        return {
            success: true,
            messageId: data.sms_number_id || `ms_${Date.now()}`
        };
    }
}

module.exports = new SmsService();
