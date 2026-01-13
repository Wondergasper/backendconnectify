// services/notification/inappService.js
const Notification = require('../../models/Notification');
const { fcm } = require('../../config/firebase');

/**
 * In-App Notification Service using MongoDB and FCM
 * Consolidated to use the main application database (MongoDB)
 */
class InAppService {
    /**
     * Send in-app notification
     * @param {Object} params - Notification parameters
     * @param {string} params.userId - User ID to send notification to
     * @param {string} params.title - Notification title
     * @param {string} params.body - Notification body/message
     * @param {string} params.fcmToken - Optional FCM token for push notification
     * @param {Object} params.data - Optional additional data
     */
    async sendInApp({ userId, title, body, fcmToken, data = {} }) {
        try {
            // Validate parameters
            if (!userId || !title || !body) {
                throw new Error('userId, title, and body are required');
            }

            // Determine type from data or default to 'system'
            const type = data.type || 'system';

            // Store notification in MongoDB
            let notification = null;
            try {
                notification = await Notification.create({
                    user: userId,
                    title,
                    message: body, // Map body to message
                    type,
                    data,
                    read: false
                });
                console.log('✅ In-app notification stored in MongoDB:', notification._id);
            } catch (error) {
                console.error('❌ Failed to store notification in MongoDB:', error.message);
                // Continue to push notification even if storage fails?
                // Probably better to ensure storage for history
            }

            // Send push notification via FCM if available
            let fcmResult = null;
            if (fcmToken && fcm) {
                try {
                    fcmResult = await fcm.send({
                        token: fcmToken,
                        notification: { title, body },
                        data: {
                            ...data,
                            notificationId: notification ? notification._id.toString() : '',
                            timestamp: new Date().toISOString()
                        }
                    });
                    console.log('✅ FCM push notification sent:', fcmResult);
                } catch (error) {
                    console.error('❌ Failed to send FCM notification:', error.message);
                }
            } else if (!fcm) {
                console.warn('⚠️  FCM not configured. Push notification skipped.');
            } else if (!fcmToken) {
                console.log('ℹ️  No FCM token provided. Push notification skipped.');
            }

            return {
                success: true,
                notificationId: notification ? notification._id : null,
                fcmMessageId: fcmResult,
                channel: 'inapp'
            };
        } catch (error) {
            console.error('❌ Failed to send in-app notification:', error);
            throw error;
        }
    }

    /**
     * Get user notifications from MongoDB
     * @param {string} userId - User ID
     * @param {number} limit - Maximum number of notifications to retrieve
     * @param {boolean} unreadOnly - If true, only return unread notifications
     */
    async getUserNotifications(userId, limit = 50, unreadOnly = false) {
        try {
            const query = { user: userId };
            if (unreadOnly) {
                query.read = false;
            }

            const notifications = await Notification.find(query)
                .sort({ createdAt: -1 })
                .limit(limit);

            console.log(`✅ Retrieved ${notifications.length} notifications for user ${userId}`);
            return notifications;
        } catch (error) {
            console.error('❌ Failed to retrieve notifications:', error);
            throw error;
        }
    }

    /**
     * Mark notification as read
     * @param {string} notificationId - Notification document ID
     */
    async markAsRead(notificationId) {
        try {
            const notification = await Notification.findByIdAndUpdate(
                notificationId,
                { read: true },
                { new: true }
            );

            if (!notification) {
                console.warn(`⚠️ Notification ${notificationId} not found`);
                return false;
            }

            console.log(`✅ Notification ${notificationId} marked as read`);
            return true;
        } catch (error) {
            console.error('❌ Failed to mark notification as read:', error);
            throw error;
        }
    }

    /**
     * Mark all user notifications as read
     * @param {string} userId - User ID
     */
    async markAllAsRead(userId) {
        try {
            const result = await Notification.updateMany(
                { user: userId, read: false },
                { read: true }
            );

            console.log(`✅ Marked ${result.modifiedCount} notifications as read for user ${userId}`);
            return true;
        } catch (error) {
            console.error('❌ Failed to mark all notifications as read:', error);
            throw error;
        }
    }

    /**
     * Delete notification
     * @param {string} notificationId - Notification document ID
     */
    async deleteNotification(notificationId) {
        try {
            const result = await Notification.findByIdAndDelete(notificationId);

            if (!result) {
                console.warn(`⚠️ Notification ${notificationId} not found for deletion`);
                return false;
            }

            console.log(`✅ Notification ${notificationId} deleted`);
            return true;
        } catch (error) {
            console.error('❌ Failed to delete notification:', error);
            throw error;
        }
    }
}

module.exports = new InAppService();
