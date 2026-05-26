const supabaseNotificationService = require('./supabaseNotificationService');
const pushService = require('./pushService');

const normalizeNotification = (notification) => {
  if (!notification) {
    return notification;
  }

  return {
    ...notification,
    id: notification.id || notification._id,
    userId: notification.user_id || notification.user?.id || notification.user,
    message: notification.message || notification.body || notification.content,
    readAt: notification.read_at || notification.readAt,
    createdAt: notification.created_at || notification.createdAt,
    updatedAt: notification.updated_at || notification.updatedAt
  };
};

class InAppService {
  async sendInApp({ userId, title, body, message, type = 'system', data = {}, fcmToken }) {
    if (!userId) {
      throw new Error('User ID is required');
    }

    const notificationMsg = body || message || '';

    // 1. Persist the notification to the database via Supabase
    const notification = await supabaseNotificationService.createNotification({
      userId,
      title,
      message: notificationMsg,
      type,
      data
    });

    // 2. Resolve FCM token for Firebase push notification
    let targetFcmToken = fcmToken;
    if (!targetFcmToken) {
      try {
        const { userRepository } = require('../../repositories/supabase/userRepository');
        const user = await userRepository.findById(userId);
        if (user && user.fcmToken) {
          targetFcmToken = user.fcmToken;
        }
      } catch (dbError) {
        console.warn('⚠️ Could not fetch FCM token from repository for push:', dbError.message);
      }
    }

    // 3. Dispatch Firebase Push Notification asynchronously if token exists
    if (targetFcmToken) {
      try {
        pushService.sendPushNotification(targetFcmToken, {
          title,
          body: notificationMsg,
          data
        }).catch(err => {
          console.error('❌ Background FCM dispatch error:', err.message);
        });
      } catch (pushError) {
        console.error('⚠️ Failed to initiate push notification dispatch:', pushError.message);
      }
    }

    return {
      success: true,
      notification: normalizeNotification(notification)
    };
  }

  async getUserNotifications(userId, limit = 50, unreadOnly = false) {
    if (!userId) {
      throw new Error('User ID is required');
    }

    const notifications = await supabaseNotificationService.getUserNotifications(
      userId,
      limit,
      unreadOnly
    );

    return notifications.map(normalizeNotification);
  }

  async markAsRead(notificationId, userId) {
    if (!notificationId) {
      throw new Error('Notification ID is required');
    }

    const notification = await supabaseNotificationService.markAsRead(
      notificationId,
      userId
    );

    return normalizeNotification(notification);
  }

  async markAllAsRead(userId) {
    if (!userId) {
      throw new Error('User ID is required');
    }

    return supabaseNotificationService.markAllAsRead(userId);
  }

  async deleteNotification(notificationId, userId) {
    if (!notificationId) {
      throw new Error('Notification ID is required');
    }

    return supabaseNotificationService.deleteNotification(notificationId, userId);
  }
}

module.exports = new InAppService();
