/**
 * EXAMPLE: How to Integrate Notification Service
 * 
 * This file shows practical examples of how to use the notification
 * microservice in your existing controllers.
 */

const axios = require('axios');

// Base URL for notification service (adjust for production)
const NOTIFY_API_BASE = process.env.NOTIFY_API_URL || 'http://localhost:5000/api/notify';

/**
 * Example 1: Send Welcome Notification on User Registration
 */
async function sendWelcomeNotification(user, authToken) {
    try {
        const response = await axios.post(
            NOTIFY_API_BASE,
            {
                email: user.email,
                phone: user.phone, // Optional
                userId: user._id,
                fcmToken: user.fcmToken, // Optional - for push notifications
                title: 'Welcome to Connectify Nigeria!',
                message: 'Thank you for joining Connectify. Start exploring services today!',
                channels: ['email', 'inapp'], // Choose channels
                data: {
                    type: 'welcome',
                    userId: user._id
                }
            },
            {
                headers: {
                    Authorization: `Bearer ${authToken}`
                }
            }
        );

        console.log('Welcome notification sent:', response.data);
        return response.data;
    } catch (error) {
        console.error('Failed to send welcome notification:', error.message);
        // Don't throw - notification failure shouldn't break registration
        return null;
    }
}

/**
 * Example 2: Send Booking Confirmation
 */
async function sendBookingConfirmationNotification(booking, user, authToken) {
    try {
        const response = await axios.post(
            `${NOTIFY_API_BASE}/booking`,
            {
                email: user.email,
                phone: user.phone,
                userId: user._id,
                fcmToken: user.fcmToken,
                bookingDetails: {
                    id: booking._id,
                    provider: booking.provider.name,
                    customerName: user.name,
                    service: booking.service.name,
                    date: booking.date,
                    time: booking.time,
                    totalAmount: booking.totalAmount
                },
                status: 'confirmed',
                channels: ['email', 'sms', 'inapp']
            },
            {
                headers: {
                    Authorization: `Bearer ${authToken}`
                }
            }
        );

        console.log('Booking confirmation sent:', response.data);
        return response.data;
    } catch (error) {
        console.error('Failed to send booking confirmation:', error.message);
        return null;
    }
}

/**
 * Example 3: Send OTP for Phone Verification
 */
async function sendPhoneVerificationOTP(phone, otp, authToken) {
    try {
        const response = await axios.post(
            `${NOTIFY_API_BASE}/otp`,
            {
                phone,
                otp,
                expiryMinutes: 10
            },
            {
                headers: {
                    Authorization: `Bearer ${authToken}`
                }
            }
        );

        console.log('OTP sent:', response.data);
        return response.data;
    } catch (error) {
        console.error('Failed to send OTP:', error.message);
        throw error; // OTP is critical, so throw error
    }
}

/**
 * Example 4: Send Password Reset Email
 */
async function sendPasswordResetNotification(user, resetToken, authToken) {
    try {
        const response = await axios.post(
            NOTIFY_API_BASE,
            {
                email: user.email,
                channels: ['email'],
                template: 'password_reset',
                templateData: {
                    email: user.email,
                    resetToken,
                    name: user.name
                }
            },
            {
                headers: {
                    Authorization: `Bearer ${authToken}`
                }
            }
        );

        console.log('Password reset email sent:', response.data);
        return response.data;
    } catch (error) {
        console.error('Failed to send password reset email:', error.message);
        throw error; // Critical notification
    }
}

/**
 * Example 5: Send Custom In-App Notification
 */
async function sendCustomInAppNotification(userId, title, message, fcmToken, authToken) {
    try {
        const response = await axios.post(
            NOTIFY_API_BASE,
            {
                userId,
                fcmToken,
                title,
                message,
                channels: ['inapp'],
                data: {
                    type: 'custom',
                    timestamp: new Date().toISOString()
                }
            },
            {
                headers: {
                    Authorization: `Bearer ${authToken}`
                }
            }
        );

        console.log('In-app notification sent:', response.data);
        return response.data;
    } catch (error) {
        console.error('Failed to send in-app notification:', error.message);
        return null;
    }
}

/**
 * Example 6: Get User's Notifications
 */
async function getUserNotifications(userId, authToken, options = {}) {
    try {
        const { limit = 50, unreadOnly = false } = options;

        const response = await axios.get(
            `${NOTIFY_API_BASE}/user/${userId}`,
            {
                params: { limit, unreadOnly },
                headers: {
                    Authorization: `Bearer ${authToken}`
                }
            }
        );

        console.log(`Retrieved ${response.data.count} notifications for user ${userId}`);
        return response.data.notifications;
    } catch (error) {
        console.error('Failed to get user notifications:', error.message);
        return [];
    }
}

/**
 * Example 7: Mark Notification as Read
 */
async function markNotificationAsRead(notificationId, authToken) {
    try {
        const response = await axios.put(
            `${NOTIFY_API_BASE}/${notificationId}/read`,
            {},
            {
                headers: {
                    Authorization: `Bearer ${authToken}`
                }
            }
        );

        console.log('Notification marked as read:', notificationId);
        return response.data;
    } catch (error) {
        console.error('Failed to mark notification as read:', error.message);
        return null;
    }
}

/**
 * Example 8: Practical Integration in Auth Controller
 * 
 * Add this to your authController.js register function:
 */
/*
// In authController.js - register function
exports.register = async (req, res) => {
  try {
    // ... existing registration logic ...
    
    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      // ... other fields
    });

    // Generate token
    const token = generateToken(user._id);

    // ✨ Send welcome notification (non-blocking)
    sendWelcomeNotification(user, token).catch(err => 
      console.error('Welcome notification failed:', err)
    );

    res.status(201).json({
      success: true,
      user,
      token
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
*/

/**
 * Example 9: Integration in Booking Controller
 * 
 * Add this to your bookingController.js createBooking function:
 */
/*
// In bookingController.js - createBooking function
exports.createBooking = async (req, res) => {
  try {
    // ... existing booking creation logic ...
    
    const booking = await Booking.create({
      customer: req.user._id,
      provider: providerId,
      service: serviceId,
      // ... other fields
    });

    await booking.populate('customer provider service');

    // ✨ Send booking confirmation (non-blocking)
    sendBookingConfirmationNotification(
      booking,
      booking.customer,
      req.headers.authorization.split(' ')[1]
    ).catch(err => console.error('Booking notification failed:', err));

    res.status(201).json({
      success: true,
      booking
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
*/

/**
 * Example 10: Bulk Notification (Multiple Users)
 */
async function sendBulkNotifications(users, title, message, authToken) {
    const promises = users.map(user =>
        axios.post(
            NOTIFY_API_BASE,
            {
                email: user.email,
                userId: user._id,
                fcmToken: user.fcmToken,
                title,
                message,
                channels: ['email', 'inapp']
            },
            {
                headers: {
                    Authorization: `Bearer ${authToken}`
                }
            }
        ).catch(err => {
            console.error(`Failed to notify user ${user._id}:`, err.message);
            return null;
        })
    );

    const results = await Promise.all(promises);
    const successful = results.filter(r => r !== null).length;

    console.log(`Sent ${successful}/${users.length} bulk notifications`);
    return { total: users.length, successful };
}

// Export helper functions
module.exports = {
    sendWelcomeNotification,
    sendBookingConfirmationNotification,
    sendPhoneVerificationOTP,
    sendPasswordResetNotification,
    sendCustomInAppNotification,
    getUserNotifications,
    markNotificationAsRead,
    sendBulkNotifications
};
