// services/emailService.js
const nodemailer = require('nodemailer');

class EmailService {
  constructor() {
    this.transporter = null;
    this.initTransporter();
  }

  initTransporter() {
    // Create transporter based on environment
    if (process.env.NODE_ENV === 'production') {
      // Production: Use real SMTP service (e.g., SendGrid, Mailgun, AWS SES)
      this.transporter = nodemailer.createTransporter({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT) || 587,
        secure: false, // true for 465, false for other ports
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      });
    } else {
      // Development: Use ethereal.email test service
      this.transporter = nodemailer.createTransporter({
        host: "smtp.ethereal.email",
        port: 587,
        secure: false, // true for 465, false for other ports
        auth: {
          user: process.env.SMTP_TEST_USER || 'your_test_email@ethereal.email',
          pass: process.env.SMTP_TEST_PASS || 'your_test_password'
        }
      });
    }
  }

  // Test email configuration
  async testConnection() {
    try {
      const result = await this.transporter.verify();
      console.log('Email server connection verified:', result);
      return true;
    } catch (error) {
      console.error('Email server connection failed:', error);
      return false;
    }
  }

  // Send booking confirmation email
  async sendBookingConfirmation(booking, recipientEmail, recipientName) {
    try {
      const mailOptions = {
        from: process.env.EMAIL_FROM || '"Connectify Nigeria" <noreply@connectify.ng>',
        to: recipientEmail,
        subject: 'Booking Confirmation - Connectify Nigeria',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #1eaedb;">Booking Confirmed!</h2>
            <p>Hello ${recipientName},</p>
            <p>Your service booking has been confirmed. Here are the details:</p>
            <div style="background-color: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin-top: 0;">Booking Details</h3>
              <p><strong>Service Provider:</strong> ${booking.provider.name}</p>
              <p><strong>Service:</strong> ${booking.service.name || booking.service}</p>
              <p><strong>Date:</strong> ${new Date(booking.date).toLocaleDateString()}</p>
              <p><strong>Time:</strong> ${booking.time}</p>
              <p><strong>Address:</strong> ${booking.address || 'N/A'}</p>
              <p><strong>Total Amount:</strong> ₦${booking.totalAmount.toLocaleString()}</p>
            </div>
            <p>Thank you for using Connectify Nigeria. We hope you have a great experience!</p>
            <p>Best regards,<br>The Connectify Team</p>
          </div>
        `
      };

      const result = await this.transporter.sendMail(mailOptions);
      console.log('Booking confirmation email sent:', result.messageId);
      return result;
    } catch (error) {
      console.error('Failed to send booking confirmation email:', error);
      throw error;
    }
  }

  // Send booking status update email
  async sendBookingStatusUpdate(booking, status, recipientEmail, recipientName) {
    try {
      const statusMessages = {
        confirmed: 'Your booking has been confirmed and is ready for service.',
        in_progress: 'Your service provider has started the service.',
        completed: 'Your service has been completed. Please review your experience.',
        cancelled: 'Your booking has been cancelled.',
        rejected: 'Your booking has been rejected.'
      };

      const mailOptions = {
        from: process.env.EMAIL_FROM || '"Connectify Nigeria" <noreply@connectify.ng>',
        to: recipientEmail,
        subject: `Booking Status Update - ${status.charAt(0).toUpperCase() + status.slice(1)}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #1eaedb;">Booking Status Update</h2>
            <p>Hello ${recipientName},</p>
            <p>${statusMessages[status] || 'Your booking status has been updated.'}</p>
            <div style="background-color: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin-top: 0;">Booking Details</h3>
              <p><strong>Status:</strong> ${status}</p>
              <p><strong>Service Provider:</strong> ${booking.provider.name}</p>
              <p><strong>Service:</strong> ${booking.service.name || booking.service}</p>
              <p><strong>Date:</strong> ${new Date(booking.date).toLocaleDateString()}</p>
              <p><strong>Time:</strong> ${booking.time}</p>
            </div>
            <p>Thank you for using Connectify Nigeria.</p>
            <p>Best regards,<br>The Connectify Team</p>
          </div>
        `
      };

      const result = await this.transporter.sendMail(mailOptions);
      console.log(`Booking status update email sent for status ${status}:`, result.messageId);
      return result;
    } catch (error) {
      console.error(`Failed to send booking status update email for status ${status}:`, error);
      throw error;
    }
  }

  // Send welcome email
  async sendWelcomeEmail(user, recipientEmail, recipientName) {
    try {
      const mailOptions = {
        from: process.env.EMAIL_FROM || '"Connectify Nigeria" <noreply@connectify.ng>',
        to: recipientEmail,
        subject: 'Welcome to Connectify Nigeria!',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #1eaedb;">Welcome to Connectify Nigeria!</h2>
            <p>Hello ${recipientName},</p>
            <p>Welcome to Nigeria's premier service marketplace! We're excited to have you join our community.</p>
            <p>With Connectify, you can:</p>
            <ul>
              <li>Find trusted professionals for various services</li>
              <li>Book services with ease and security</li>
              <li>Pay safely through our secure wallet</li>
              <li>Leave reviews and ratings</li>
            </ul>
            <p>Get started today by browsing services or completing your profile.</p>
            <p>Best regards,<br>The Connectify Team</p>
          </div>
        `
      };

      const result = await this.transporter.sendMail(mailOptions);
      console.log('Welcome email sent:', result.messageId);
      return result;
    } catch (error) {
      console.error('Failed to send welcome email:', error);
      throw error;
    }
  }

  // Send password reset email
  async sendPasswordReset(email, resetToken, recipientName) {
    try {
      const resetLink = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${resetToken}`;
      
      const mailOptions = {
        from: process.env.EMAIL_FROM || '"Connectify Nigeria" <noreply@connectify.ng>',
        to: email,
        subject: 'Password Reset Request',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #1eaedb;">Password Reset Request</h2>
            <p>Hello ${recipientName},</p>
            <p>You have requested to reset your password for Connectify Nigeria.</p>
            <p>Click the button below to reset your password:</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetLink}" style="background-color: #1eaedb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">Reset Password</a>
            </div>
            <p>If you didn't request this password reset, please ignore this email.</p>
            <p>The link will expire in 1 hour.</p>
            <p>Best regards,<br>The Connectify Team</p>
          </div>
        `
      };

      const result = await this.transporter.sendMail(mailOptions);
      console.log('Password reset email sent:', result.messageId);
      return result;
    } catch (error) {
      console.error('Failed to send password reset email:', error);
      throw error;
    }
  }

  // Send verification request notification
  async sendVerificationRequestNotification(userId, documents, recipientEmail) {
    try {
      const mailOptions = {
        from: process.env.EMAIL_FROM || '"Connectify Nigeria" <noreply@connectify.ng>',
        to: recipientEmail,
        subject: 'Verification Request Submitted',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #1eaedb;">Verification Request Submitted</h2>
            <p>Hello,</p>
            <p>Your verification request has been successfully submitted to Connectify Nigeria.</p>
            <div style="background-color: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin-top: 0;">Submitted Documents</h3>
              <ul>
                ${documents.map(doc => `<li>${doc}</li>`).join('')}
              </ul>
            </div>
            <p>Our team will review your documents and notify you of the status within 24-48 hours.</p>
            <p>Best regards,<br>The Connectify Team</p>
          </div>
        `
      };

      const result = await this.transporter.sendMail(mailOptions);
      console.log('Verification request notification email sent:', result.messageId);
      return result;
    } catch (error) {
      console.error('Failed to send verification request notification email:', error);
      throw error;
    }
  }
}

module.exports = new EmailService();