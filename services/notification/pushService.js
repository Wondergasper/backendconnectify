// services/notification/pushService.js
const { fcm } = require('../../config/firebase');

/**
 * Firebase Push Notification Driver
 */
class PushService {
    /**
     * Sends a push notification to a specific device FCM token
     * @param {string} fcmToken - The target device FCM token
     * @param {Object} notificationParams - Notification parameters
     * @param {string} notificationParams.title - The title of the push notification
     * @param {string} notificationParams.body - The message body of the push notification
     * @param {Object} [notificationParams.data] - Optional metadata payload
     */
    async sendPushNotification(fcmToken, { title, body, data = {} }) {
        if (!fcmToken) {
            console.warn('⚠️ No FCM token provided. Skipping push notification.');
            return null;
        }

        if (!fcm) {
            console.warn('⚠️ Firebase Messaging (FCM) is not initialized or credentials missing. Skipping push.');
            return null;
        }

        try {
            // Stringify all custom data fields since FCM strictly requires string values
            const stringData = {};
            if (data) {
                for (const [key, value] of Object.entries(data)) {
                    stringData[key] = typeof value === 'object' ? JSON.stringify(value) : String(value);
                }
            }

            const message = {
                token: fcmToken,
                notification: {
                    title,
                    body
                },
                data: stringData
            };

            const response = await fcm.send(message);
            console.log('✅ FCM push notification sent successfully:', response);
            return {
                success: true,
                messageId: response
            };
        } catch (error) {
            console.error('❌ Failed to send FCM push notification:', error.message);
            // Return failure status instead of throwing to prevent database writes from failing
            return {
                success: false,
                error: error.message
            };
        }
    }
}

module.exports = new PushService();
