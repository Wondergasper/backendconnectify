// utils/notificationLogger.js
const winston = require('winston');

/**
 * Notification Logger
 * Specialized logger for notification events
 */
const notificationLogger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    defaultMeta: { service: 'notification-service' },
    transports: [
        // Write all logs to console
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        }),
        // Write all logs with level 'error' and below to error.log
        new winston.transports.File({
            filename: 'logs/notification-error.log',
            level: 'error',
            maxsize: 5242880, // 5MB
            maxFiles: 5
        }),
        // Write all logs to combined.log
        new winston.transports.File({
            filename: 'logs/notification-combined.log',
            maxsize: 5242880, // 5MB
            maxFiles: 5
        })
    ]
});

/**
 * Log notification event
 * @param {string} level - Log level (info, warn, error)
 * @param {string} channel - Notification channel (email, sms, inapp)
 * @param {string} event - Event type (sent, failed, queued)
 * @param {Object} metadata - Additional metadata
 */
function logNotification(level, channel, event, metadata = {}) {
    notificationLogger.log(level, `${channel.toUpperCase()}: ${event}`, {
        channel,
        event,
        timestamp: new Date().toISOString(),
        ...metadata
    });
}

module.exports = {
    logger: notificationLogger,
    logNotification
};
