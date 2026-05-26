// services/notification/smsNotificationService.js
const smsService = require('../smsService');

/**
 * Connectify Notification Microservice for SMS Channel
 * Integrates with standard services and business flow triggers
 */
class SmsNotificationService {
    /**
     * Send a raw SMS notification
     * @param {Object} params - SMS parameters
     * @param {string} params.to - Recipient phone number
     * @param {string} params.text - Plain text content
     * @returns {Promise<{success: boolean, messageId?: string, channel: string, error?: string}>}
     */
    async sendSms({ to, text }) {
        try {
            if (!to || !text) {
                throw new Error('SMS recipient phone number and text are required');
            }

            const result = await smsService.sendRawSms(to, text);
            
            if (result.success) {
                console.log(`✅ SMS notification sent successfully to ${to}`);
            } else {
                console.warn(`⚠️ SMS notification skipped or failed: ${result.error}`);
            }

            return {
                success: result.success,
                messageId: result.messageId,
                channel: 'sms',
                error: result.error
            };
        } catch (error) {
            console.error('❌ Failed to send SMS notification:', error.message);
            // Return failure object instead of crashing process to maintain uptime
            return {
                success: false,
                channel: 'sms',
                error: error.message
            };
        }
    }

    /**
     * Send a pre-templated transactional SMS
     * @param {string} template - Template identifier (welcome, booking_requested_customer, etc.)
     * @param {Object} data - Dynamic template values
     * @param {string} data.phone - Target phone number
     * @returns {Promise<{success: boolean, messageId?: string, channel: string, error?: string}>}
     */
    async sendTemplatedSms(template, data) {
        try {
            if (!data || !data.phone) {
                throw new Error(`Phone number is required for SMS template: ${template}`);
            }

            let text = '';
            const phone = data.phone;

            switch (template) {
                case 'welcome':
                    text = `Welcome to Connectify Nigeria, ${data.name || 'there'}! Your account has been verified. Log in now and explore trusted services.`;
                    break;

                case 'booking_requested_customer':
                    text = `Hi ${data.customerName}! Your booking request for ${data.serviceName} has been submitted to the provider. We'll alert you once they respond.`;
                    break;

                case 'booking_requested_provider':
                    text = `Hello ${data.providerName}! You have a new booking request from ${data.customerName} for ${data.serviceName} on ${data.date} at ${data.time}. Review details in the app!`;
                    break;

                case 'booking_reminder':
                    text = `⏰ Connectify Reminder: You have an upcoming appointment tomorrow at ${data.time} for ${data.serviceName}. Location: ${data.address || 'N/A'}.`;
                    break;

                case 'booking_status_update':
                    const statusText = {
                        confirmed: 'has been confirmed! See you at the scheduled time.',
                        in_progress: 'is now in progress.',
                        completed: 'has been completed. Thank you! Please write a review for your provider.',
                        cancelled: 'has been cancelled.',
                        rejected: 'has been declined.'
                    }[data.status] || 'status has been updated.';
                    
                    text = `Booking Alert: Your appointment for ${data.serviceName} ${statusText}`;
                    break;

                default:
                    throw new Error(`Unknown SMS template type: ${template}`);
            }

            return await this.sendSms({ to: phone, text });
        } catch (error) {
            console.error(`❌ Failed to send templated SMS (${template}):`, error.message);
            return {
                success: false,
                channel: 'sms',
                error: error.message
            };
        }
    }
}

module.exports = new SmsNotificationService();
