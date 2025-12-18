// services/queueService.js
const Queue = require('bull');
const emailService = require('./emailService');

// Redis connection for Bull queues
const redisConfig = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || undefined
};

// Create queues
const emailQueue = new Queue('Email Processing', redisConfig);
const notificationQueue = new Queue('Notification Processing', redisConfig);
const imageProcessingQueue = new Queue('Image Processing', redisConfig);

// Process email queue
emailQueue.process('sendBookingConfirmation', async (job) => {
  const { booking, recipientEmail, recipientName } = job.data;
  
  try {
    await emailService.sendBookingConfirmation(booking, recipientEmail, recipientName);
    return { success: true, messageId: 'booking_confirmation_sent' };
  } catch (error) {
    console.error('Failed to send booking confirmation email:', error);
    throw error;
  }
});

emailQueue.process('sendBookingStatusUpdate', async (job) => {
  const { booking, status, recipientEmail, recipientName } = job.data;
  
  try {
    await emailService.sendBookingStatusUpdate(booking, status, recipientEmail, recipientName);
    return { success: true, messageId: `booking_${status}_update_sent` };
  } catch (error) {
    console.error(`Failed to send booking ${status} update email:`, error);
    throw error;
  }
});

emailQueue.process('sendWelcomeEmail', async (job) => {
  const { user, recipientEmail, recipientName } = job.data;
  
  try {
    await emailService.sendWelcomeEmail(user, recipientEmail, recipientName);
    return { success: true, messageId: 'welcome_email_sent' };
  } catch (error) {
    console.error('Failed to send welcome email:', error);
    throw error;
  }
});

emailQueue.process('sendPasswordReset', async (job) => {
  const { email, resetToken, recipientName } = job.data;
  
  try {
    await emailService.sendPasswordReset(email, resetToken, recipientName);
    return { success: true, messageId: 'password_reset_sent' };
  } catch (error) {
    console.error('Failed to send password reset email:', error);
    throw error;
  }
});

// Process notification queue
notificationQueue.process('sendPushNotification', async (job) => {
  const { userId, title, body, data } = job.data;
  
  try {
    // Implementation would depend on chosen push notification service (Firebase, APNS, etc.)
    console.log(`Sending push notification to user ${userId}:`, { title, body, data });
    return { success: true, notificationId: `notif_${Date.now()}` };
  } catch (error) {
    console.error('Failed to send push notification:', error);
    throw error;
  }
});

// Process image processing queue
imageProcessingQueue.process('resizeAndOptimizeImage', async (job) => {
  const { imageUrl, options } = job.data;
  
  try {
    // Implementation would involve downloading the image, resizing, optimizing and uploading
    console.log(`Processing image: ${imageUrl} with options:`, options);
    return { success: true, processedImageId: `img_${Date.now()}` };
  } catch (error) {
    console.error('Failed to process image:', error);
    throw error;
  }
});

// Add email jobs to queue
const addEmailJob = {
  sendBookingConfirmation: (booking, recipientEmail, recipientName, options = {}) => {
    return emailQueue.add('sendBookingConfirmation', { booking, recipientEmail, recipientName }, {
      attempts: 3,
      backoff: 'exponential',
      delay: 1000,
      ...options
    });
  },

  sendBookingStatusUpdate: (booking, status, recipientEmail, recipientName, options = {}) => {
    return emailQueue.add('sendBookingStatusUpdate', { booking, status, recipientEmail, recipientName }, {
      attempts: 3,
      backoff: 'exponential',
      delay: 1000,
      ...options
    });
  },

  sendWelcomeEmail: (user, recipientEmail, recipientName, options = {}) => {
    return emailQueue.add('sendWelcomeEmail', { user, recipientEmail, recipientName }, {
      attempts: 3,
      backoff: 'exponential',
      delay: 1000,
      ...options
    });
  },

  sendPasswordReset: (email, resetToken, recipientName, options = {}) => {
    return emailQueue.add('sendPasswordReset', { email, resetToken, recipientName }, {
      attempts: 3,
      backoff: 'exponential',
      delay: 1000,
      ...options
    });
  }
};

// Add notification jobs to queue
const addNotificationJob = {
  sendPushNotification: (userId, title, body, data = {}, options = {}) => {
    return notificationQueue.add('sendPushNotification', { userId, title, body, data }, {
      attempts: 3,
      backoff: 'exponential',
      delay: 1000,
      ...options
    });
  }
};

// Add image processing jobs to queue
const addImageJob = {
  resizeAndOptimizeImage: (imageUrl, options = {}, jobOptions = {}) => {
    return imageProcessingQueue.add('resizeAndOptimizeImage', { imageUrl, options }, {
      attempts: 3,
      backoff: 'exponential',
      delay: 5000,
      ...jobOptions
    });
  }
};

// Get queue metrics
const getQueueMetrics = async () => {
  const emailQueueMetrics = await emailQueue.getJobCounts();
  const notificationQueueMetrics = await notificationQueue.getJobCounts();
  const imageProcessingQueueMetrics = await imageProcessingQueue.getJobCounts();

  return {
    emailQueue: emailQueueMetrics,
    notificationQueue: notificationQueueMetrics,
    imageProcessingQueue: imageProcessingQueueMetrics,
    timestamp: new Date().toISOString()
  };
};

// Pause/resume queues
const pauseQueues = () => {
  emailQueue.pause();
  notificationQueue.pause();
  imageProcessingQueue.pause();
};

const resumeQueues = () => {
  emailQueue.resume();
  notificationQueue.resume();
  imageProcessingQueue.resume();
};

// Graceful shutdown
const gracefulShutdown = async () => {
  console.log('Shutting down queues gracefully...');
  await Promise.all([
    emailQueue.close(),
    notificationQueue.close(),
    imageProcessingQueue.close()
  ]);
  console.log('All queues closed');
};

module.exports = {
  emailQueue,
  notificationQueue,
  imageProcessingQueue,
  addEmailJob,
  addNotificationJob,
  addImageJob,
  getQueueMetrics,
  pauseQueues,
  resumeQueues,
  gracefulShutdown
};