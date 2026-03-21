const supabaseNotificationService = require('./supabaseNotificationService');

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
  async sendInApp({ userId, title, body, message, type = 'system', data = {} }) {
    if (!userId) {
      throw new Error('User ID is required');
    }

    const notification = await supabaseNotificationService.createNotification({
      userId,
      title,
      message: body || message || '',
      type,
      data
    });

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
