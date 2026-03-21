const inappService = require('../services/notification/inappService');

const getNotifications = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const type = req.query.type;
    const read = req.query.read;
    const readFilter = read === 'true' ? true : read === 'false' ? false : undefined;

    const notifications = await inappService.getUserNotifications(
      req.user._id,
      page * limit,
      readFilter === false
    );

    const filtered = notifications.filter((notification) => {
      if (type && notification.type !== type) {
        return false;
      }

      if (readFilter !== undefined && Boolean(notification.read) !== readFilter) {
        return false;
      }

      return true;
    });

    const paged = filtered.slice((page - 1) * limit, (page - 1) * limit + limit);

    res.json({
      success: true,
      data: paged,
      pagination: {
        page,
        limit,
        total: filtered.length,
        pages: Math.ceil(filtered.length / limit)
      }
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

const markAsRead = async (req, res) => {
  try {
    const { notificationId } = req.params;

    const notification = await inappService.markAsRead(notificationId, req.user._id);

    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    res.json({
      success: true,
      notification
    });
  } catch (error) {
    console.error('Mark notification as read error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

const markAllAsRead = async (req, res) => {
  try {
    await inappService.markAllAsRead(req.user._id);

    res.json({
      success: true,
      message: 'All notifications marked as read'
    });
  } catch (error) {
    console.error('Mark all notifications as read error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

const deleteNotification = async (req, res) => {
  try {
    const { notificationId } = req.params;

    const deleted = await inappService.deleteNotification(notificationId, req.user._id);

    if (!deleted) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    res.json({
      success: true,
      message: 'Notification deleted successfully'
    });
  } catch (error) {
    console.error('Delete notification error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification
};
