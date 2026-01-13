// controllers/notificationController.js
const emailNotificationService = require('../services/notification/emailNotificationService');
const inappService = require('../services/notification/inappService');

/**
 * Unified Notification Controller
 * Handles multi-channel notification sending (email, in-app)
 */
class NotificationController {
    /**
     * Send notification across multiple channels
     * POST /api/notify
     */
    async sendNotification(req, res) {
        try {
            const {
                email,
                phone,
                userId,
                fcmToken,
                title,
                message,
                subject,
                html,
                channels = ['email'], // Default to email only
                template,
                templateData,
                data
            } = req.body;

            // Validate input
            if (!channels || channels.length === 0) {
                return res.status(400).json({
                    success: false,
                    error: 'At least one notification channel is required'
                });
            }

            if (!title && !subject) {
                return res.status(400).json({
                    success: false,
                    error: 'Title or subject is required'
                });
            }

            if (!message) {
                return res.status(400).json({
                    success: false,
                    error: 'Message is required'
                });
            }

            const results = {
                email: null,
                inapp: null
            };

            const errors = [];

            // Send Email
            if (channels.includes('email') && email) {
                try {
                    if (template && templateData) {
                        // Use templated email
                        results.email = await emailNotificationService.sendTemplatedEmail(
                            template,
                            { ...templateData, email }
                        );
                    } else {
                        // Use generic email
                        results.email = await emailNotificationService.sendEmail({
                            to: email,
                            subject: subject || title,
                            text: message,
                            html: html || message
                        });
                    }
                } catch (error) {
                    console.error('Email notification error:', error);
                    errors.push({ channel: 'email', error: error.message });
                }
            }

            // SMS channel has been removed - using Zoho Mail for email instead
            if (channels.includes('sms') && phone) {
                console.warn('⚠️ SMS channel is not available. Consider using email notifications.');
                errors.push({ channel: 'sms', error: 'SMS service not available' });
            }

            // Send In-App
            if (channels.includes('inapp') && userId) {
                try {
                    results.inapp = await inappService.sendInApp({
                        userId,
                        title,
                        body: message, // Map 'message' from request to 'body' expected by service
                        fcmToken,
                        data: data || {}
                    });
                } catch (error) {
                    console.error('In-app notification error:', error);
                    errors.push({ channel: 'inapp', error: error.message });
                }
            }

            // Determine overall success
            const successfulChannels = Object.entries(results)
                .filter(([_, result]) => result !== null && result.success !== false)
                .map(([channel]) => channel);

            const response = {
                success: successfulChannels.length > 0,
                results,
                successfulChannels,
                errors: errors.length > 0 ? errors : undefined
            };

            // Return appropriate status code
            if (successfulChannels.length === 0) {
                return res.status(500).json({
                    ...response,
                    message: 'All notification channels failed'
                });
            } else if (errors.length > 0) {
                return res.status(207).json({
                    ...response,
                    message: 'Notification partially sent'
                });
            } else {
                return res.status(200).json({
                    ...response,
                    message: 'Notification sent successfully'
                });
            }
        } catch (error) {
            console.error('Notification controller error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to send notification',
                details: error.message
            });
        }
    }

    /**
     * Get user notifications (in-app)
     * GET /api/notify/user/:userId
     */
    async getUserNotifications(req, res) {
        try {
            const { userId } = req.params;
            const { limit = 50, unreadOnly = false } = req.query;

            const notifications = await inappService.getUserNotifications(
                userId,
                parseInt(limit),
                unreadOnly === 'true'
            );

            res.status(200).json({
                success: true,
                count: notifications.length,
                notifications
            });
        } catch (error) {
            console.error('Get notifications error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to retrieve notifications',
                details: error.message
            });
        }
    }

    /**
     * Mark notification as read
     * PUT /api/notify/:notificationId/read
     */
    async markAsRead(req, res) {
        try {
            const { notificationId } = req.params;

            await inappService.markAsRead(notificationId);

            res.status(200).json({
                success: true,
                message: 'Notification marked as read'
            });
        } catch (error) {
            console.error('Mark as read error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to mark notification as read',
                details: error.message
            });
        }
    }

    /**
     * Mark all user notifications as read
     * PUT /api/notify/user/:userId/read-all
     */
    async markAllAsRead(req, res) {
        try {
            const { userId } = req.params;

            await inappService.markAllAsRead(userId);

            res.status(200).json({
                success: true,
                message: 'All notifications marked as read'
            });
        } catch (error) {
            console.error('Mark all as read error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to mark all notifications as read',
                details: error.message
            });
        }
    }

    /**
     * Delete notification
     * DELETE /api/notify/:notificationId
     */
    async deleteNotification(req, res) {
        try {
            const { notificationId } = req.params;

            await inappService.deleteNotification(notificationId);

            res.status(200).json({
                success: true,
                message: 'Notification deleted'
            });
        } catch (error) {
            console.error('Delete notification error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to delete notification',
                details: error.message
            });
        }
    }

    /**
     * Send OTP via Email (SMS service has been removed)
     * POST /api/notify/otp
     */
    async sendOTP(req, res) {
        try {
            const { email, otp, expiryMinutes = 10 } = req.body;

            if (!email || !otp) {
                return res.status(400).json({
                    success: false,
                    error: 'Email and OTP are required'
                });
            }

            // Send OTP via email instead of SMS
            const result = await emailNotificationService.sendEmail({
                to: email,
                subject: 'Your Connectify Verification Code',
                text: `Your verification code is: ${otp}. Valid for ${expiryMinutes} minutes.`,
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <h2 style="color: #1eaedb;">Verification Code</h2>
                        <p>Your verification code is:</p>
                        <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
                            <h1 style="margin: 0; letter-spacing: 5px; color: #333;">${otp}</h1>
                        </div>
                        <p>This code is valid for ${expiryMinutes} minutes.</p>
                        <p>If you didn't request this code, please ignore this email.</p>
                        <p>Best regards,<br>The Connectify Team</p>
                    </div>
                `
            });

            res.status(result.success ? 200 : 500).json({
                success: result.success,
                messageId: result.messageId,
                channel: 'email'
            });
        } catch (error) {
            console.error('Send OTP error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to send OTP',
                details: error.message
            });
        }
    }

    /**
     * Send booking notification
     * POST /api/notify/booking
     */
    async sendBookingNotification(req, res) {
        try {
            const {
                email,
                phone,
                userId,
                fcmToken,
                bookingDetails,
                status,
                channels = ['email']
            } = req.body;

            const results = {};
            const errors = [];

            // Email notification
            if (channels.includes('email') && email) {
                try {
                    results.email = await emailNotificationService.sendTemplatedEmail('booking_status', {
                        booking: bookingDetails,
                        status,
                        email,
                        name: bookingDetails.customerName
                    });
                } catch (error) {
                    errors.push({ channel: 'email', error: error.message });
                }
            }

            // SMS notification has been removed - using email for all notifications
            if (channels.includes('sms') && phone) {
                console.warn('⚠️ SMS channel is not available. Consider using email notifications.');
                errors.push({ channel: 'sms', error: 'SMS service not available' });
            }

            // In-app notification
            if (channels.includes('inapp') && userId) {
                try {
                    const statusMessages = {
                        confirmed: 'Your booking has been confirmed',
                        cancelled: 'Your booking has been cancelled',
                        completed: 'Your service has been completed'
                    };

                    results.inapp = await inappService.sendInApp({
                        userId,
                        title: 'Booking Update',
                        body: statusMessages[status] || `Booking status: ${status}`,
                        fcmToken,
                        data: { type: 'booking', status, bookingId: bookingDetails.id }
                    });
                } catch (error) {
                    errors.push({ channel: 'inapp', error: error.message });
                }
            }

            const successfulChannels = Object.keys(results).filter(
                channel => results[channel]?.success !== false
            );

            res.status(successfulChannels.length > 0 ? 200 : 500).json({
                success: successfulChannels.length > 0,
                results,
                successfulChannels,
                errors: errors.length > 0 ? errors : undefined
            });
        } catch (error) {
            console.error('Send booking notification error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to send booking notification',
                details: error.message
            });
        }
    }
}

module.exports = new NotificationController();
