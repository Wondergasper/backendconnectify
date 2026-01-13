// services/notification/emailNotificationService.js
const emailService = require('../emailService');

/**
 * Enhanced Email Service for the Notification Microservice
 * Wraps the existing email service with a unified interface
 */
class EmailNotificationService {
    /**
     * Send a generic email notification
     * @param {Object} params - Email parameters
     * @param {string} params.to - Recipient email address
     * @param {string} params.subject - Email subject
     * @param {string} params.text - Plain text content
     * @param {string} params.html - HTML content
     */
    async sendEmail({ to, subject, text, html }) {
        try {
            if (!to || !subject) {
                throw new Error('Email recipient and subject are required');
            }

            // Use existing emailService transporter
            const mailOptions = {
                from: process.env.EMAIL_FROM || '"Connectify Nigeria" <noreply@connectify.ng>',
                to,
                subject,
                text: text || '',
                html: html || text || ''
            };

            const result = await emailService.transporter.sendMail(mailOptions);
            console.log('✅ Email notification sent:', result.messageId);

            return {
                success: true,
                messageId: result.messageId,
                channel: 'email'
            };
        } catch (error) {
            console.error('❌ Failed to send email notification:', error);
            throw error;
        }
    }

    /**
     * Send templated email using existing service methods
     */
    async sendTemplatedEmail(template, data) {
        try {
            switch (template) {
                case 'welcome':
                    return await emailService.sendWelcomeEmail(
                        data.user,
                        data.email,
                        data.name
                    );

                case 'booking_confirmation':
                    return await emailService.sendBookingConfirmation(
                        data.booking,
                        data.email,
                        data.name
                    );

                case 'booking_status':
                    return await emailService.sendBookingStatusUpdate(
                        data.booking,
                        data.status,
                        data.email,
                        data.name
                    );

                case 'password_reset':
                    return await emailService.sendPasswordReset(
                        data.email,
                        data.resetToken,
                        data.name
                    );

                case 'verification':
                    return await emailService.sendVerificationRequestNotification(
                        data.userId,
                        data.documents,
                        data.email
                    );

                default:
                    throw new Error(`Unknown email template: ${template}`);
            }
        } catch (error) {
            console.error(`❌ Failed to send templated email (${template}):`, error);
            throw error;
        }
    }
}

module.exports = new EmailNotificationService();
