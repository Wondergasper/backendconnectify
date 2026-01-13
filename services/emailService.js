// services/emailService.js
// Use require with fallback handling for nodemailer
let nodemailer;
try {
  nodemailer = require('nodemailer');
  // Handle both CommonJS and ES module exports
  if (nodemailer.default) {
    nodemailer = nodemailer.default;
  }
} catch (error) {
  console.error('Failed to load nodemailer:', error.message);
  nodemailer = null;
}

class EmailService {
  constructor() {
    this.transporter = null;
    this._initialized = false;
  }

  // Lazy initialization - only create transporter when first needed
  _ensureTransporter() {
    if (this._initialized) {
      return this.transporter !== null;
    }

    this._initialized = true;

    if (!nodemailer) {
      console.error('Nodemailer is not available. Email functionality disabled.');
      return false;
    }

    if (typeof nodemailer.createTransport !== 'function' && typeof nodemailer.createTransporter !== 'function') {
      console.error('Nodemailer.createTransport is not a function. Nodemailer version may be incompatible.');
      console.error('Available nodemailer exports:', Object.keys(nodemailer));
      return false;
    }

    // Use createTransport (correct method name) with fallback to createTransporter
    const createTransport = nodemailer.createTransport || nodemailer.createTransporter;

    try {
      this.initTransporter(createTransport.bind(nodemailer));
      return true;
    } catch (error) {
      console.error('Failed to initialize email transporter:', error.message);
      return false;
    }
  }

  initTransporter(createTransport) {
    // Create transporter based on environment
    if (process.env.NODE_ENV === 'production') {
      // Production: Use Zoho Mail SMTP (or other configured SMTP service)
      this.transporter = createTransport({
        host: process.env.SMTP_HOST || 'smtp.zoho.com',
        port: parseInt(process.env.SMTP_PORT) || 465,
        secure: process.env.SMTP_SECURE === 'true' || true, // true for 465 (Zoho default), false for 587
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      });
    } else {
      // Development: Use configured SMTP or ethereal.email test service
      const hasSmtpConfig = process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS;

      if (hasSmtpConfig) {
        // Use configured SMTP in development (allows testing with real Zoho Mail)
        this.transporter = createTransport({
          host: process.env.SMTP_HOST || 'smtp.zoho.com',
          port: parseInt(process.env.SMTP_PORT) || 465,
          secure: process.env.SMTP_SECURE === 'true' || true,
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
          }
        });
      } else {
        // Fallback to ethereal.email test service
        this.transporter = createTransport({
          host: "smtp.ethereal.email",
          port: 587,
          secure: false,
          auth: {
            user: process.env.SMTP_TEST_USER || 'your_test_email@ethereal.email',
            pass: process.env.SMTP_TEST_PASS || 'your_test_password'
          }
        });
      }
    }
  }


  // Test email configuration
  async testConnection() {
    if (!this._ensureTransporter()) {
      console.log('Email transporter not available for connection test');
      return false;
    }
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
    if (!this._ensureTransporter()) {
      console.log('Email transporter not available. Skipping booking confirmation email.');
      return null;
    }
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
    if (!this._ensureTransporter()) {
      console.log('Email transporter not available. Skipping booking status update email.');
      return null;
    }
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
    if (!this._ensureTransporter()) {
      console.log('Email transporter not available. Skipping welcome email.');
      return null;
    }
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
    if (!this._ensureTransporter()) {
      console.log('Email transporter not available. Skipping password reset email.');
      return null;
    }
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
    if (!this._ensureTransporter()) {
      console.log('Email transporter not available. Skipping verification request notification email.');
      return null;
    }
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

  // Send new booking notification to provider
  async sendNewBookingNotification(booking, providerEmail, providerName) {
    if (!this._ensureTransporter()) {
      console.log('Email transporter not available. Skipping new booking notification email.');
      return null;
    }
    try {
      const bookingDate = new Date(booking.date).toLocaleDateString('en-NG', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });

      const mailOptions = {
        from: process.env.EMAIL_FROM || '"Connectify Nigeria" <noreply@connectify.ng>',
        to: providerEmail,
        subject: '🎉 New Booking Request - Connectify Nigeria',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff;">
            <div style="background: linear-gradient(135deg, #1eaedb, #0066cc); padding: 30px; text-align: center;">
              <h1 style="color: white; margin: 0;">New Booking Request!</h1>
            </div>
            
            <div style="padding: 30px;">
              <p style="font-size: 16px;">Hello <strong>${providerName}</strong>,</p>
              <p style="font-size: 16px;">Great news! You have received a new booking request. Please review the details below:</p>
              
              <div style="background-color: #f8f9fa; padding: 20px; border-radius: 10px; margin: 25px 0; border-left: 4px solid #1eaedb;">
                <h3 style="margin-top: 0; color: #1eaedb;">📋 Booking Details</h3>
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 8px 0; color: #666;">Customer:</td>
                    <td style="padding: 8px 0; font-weight: bold;">${booking.customerName || 'N/A'}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #666;">Service:</td>
                    <td style="padding: 8px 0; font-weight: bold;">${booking.serviceName || booking.service?.name || 'N/A'}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #666;">Date:</td>
                    <td style="padding: 8px 0; font-weight: bold;">${bookingDate}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #666;">Time:</td>
                    <td style="padding: 8px 0; font-weight: bold;">${booking.time || 'N/A'}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #666;">Location:</td>
                    <td style="padding: 8px 0; font-weight: bold;">${booking.address || 'To be confirmed'}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #666;">Amount:</td>
                    <td style="padding: 8px 0; font-weight: bold; color: #28a745;">₦${booking.totalAmount?.toLocaleString() || '0'}</td>
                  </tr>
                </table>
                ${booking.notes ? `<p style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #ddd;"><strong>Customer Notes:</strong> ${booking.notes}</p>` : ''}
              </div>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/provider/bookings" 
                   style="background-color: #1eaedb; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
                  View Booking Details
                </a>
              </div>
              
              <p style="color: #666; font-size: 14px;">Please respond to this booking request as soon as possible to ensure a great customer experience.</p>
              
              <p style="margin-top: 30px;">Best regards,<br><strong>The Connectify Team</strong></p>
            </div>
            
            <div style="background-color: #f8f9fa; padding: 20px; text-align: center; font-size: 12px; color: #666;">
              <p>You received this email because you have an active provider account on Connectify Nigeria.</p>
            </div>
          </div>
        `
      };

      const result = await this.transporter.sendMail(mailOptions);
      console.log('New booking notification email sent to provider:', result.messageId);
      return result;
    } catch (error) {
      console.error('Failed to send new booking notification email:', error);
      throw error;
    }
  }

  // Send booking reminder email (1 day before)
  async sendBookingReminder(booking, recipientEmail, recipientName, recipientType = 'customer') {
    if (!this._ensureTransporter()) {
      console.log('Email transporter not available. Skipping booking reminder email.');
      return null;
    }
    try {
      const bookingDate = new Date(booking.date).toLocaleDateString('en-NG', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });

      const isProvider = recipientType === 'provider';
      const otherPartyName = isProvider ? booking.customerName : booking.providerName;
      const actionText = isProvider
        ? 'Please ensure you are prepared to provide the service.'
        : 'Please ensure you are available at the scheduled time.';

      const mailOptions = {
        from: process.env.EMAIL_FROM || '"Connectify Nigeria" <noreply@connectify.ng>',
        to: recipientEmail,
        subject: '⏰ Booking Reminder - Tomorrow! - Connectify Nigeria',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff;">
            <div style="background: linear-gradient(135deg, #ff9800, #f57c00); padding: 30px; text-align: center;">
              <h1 style="color: white; margin: 0;">⏰ Booking Reminder</h1>
              <p style="color: white; margin: 10px 0 0 0; font-size: 18px;">Your booking is tomorrow!</p>
            </div>
            
            <div style="padding: 30px;">
              <p style="font-size: 16px;">Hello <strong>${recipientName}</strong>,</p>
              <p style="font-size: 16px;">This is a friendly reminder that you have a booking scheduled for <strong>tomorrow</strong>.</p>
              
              <div style="background-color: #fff3e0; padding: 20px; border-radius: 10px; margin: 25px 0; border-left: 4px solid #ff9800;">
                <h3 style="margin-top: 0; color: #e65100;">📅 Booking Details</h3>
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 8px 0; color: #666;">${isProvider ? 'Customer' : 'Service Provider'}:</td>
                    <td style="padding: 8px 0; font-weight: bold;">${otherPartyName || 'N/A'}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #666;">Service:</td>
                    <td style="padding: 8px 0; font-weight: bold;">${booking.serviceName || booking.service?.name || 'N/A'}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #666;">Date:</td>
                    <td style="padding: 8px 0; font-weight: bold;">${bookingDate}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #666;">Time:</td>
                    <td style="padding: 8px 0; font-weight: bold;">${booking.time || 'N/A'}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #666;">Location:</td>
                    <td style="padding: 8px 0; font-weight: bold;">${booking.address || 'To be confirmed'}</td>
                  </tr>
                </table>
              </div>
              
              <div style="background-color: #e8f5e9; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <p style="margin: 0; color: #2e7d32;"><strong>💡 Tip:</strong> ${actionText}</p>
              </div>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/bookings/${booking._id || booking.id}" 
                   style="background-color: #ff9800; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
                  View Booking
                </a>
              </div>
              
              <p style="color: #666; font-size: 14px;">If you need to make any changes to this booking, please do so as soon as possible.</p>
              
              <p style="margin-top: 30px;">Best regards,<br><strong>The Connectify Team</strong></p>
            </div>
            
            <div style="background-color: #f8f9fa; padding: 20px; text-align: center; font-size: 12px; color: #666;">
              <p>Need help? Contact our support team at support@connectify.ng</p>
            </div>
          </div>
        `
      };

      const result = await this.transporter.sendMail(mailOptions);
      console.log(`Booking reminder email sent to ${recipientType}:`, result.messageId);
      return result;
    } catch (error) {
      console.error(`Failed to send booking reminder email to ${recipientType}:`, error);
      throw error;
    }
  }

  // Send payment receipt to customer (payer)
  async sendPaymentReceipt(paymentData, recipientEmail, recipientName) {
    if (!this._ensureTransporter()) {
      console.log('Email transporter not available. Skipping payment receipt email.');
      return null;
    }
    try {
      const transactionDate = new Date().toLocaleDateString('en-NG', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      const mailOptions = {
        from: process.env.EMAIL_FROM || '"Connectify Nigeria" <noreply@connectify.ng>',
        to: recipientEmail,
        subject: '💳 Payment Receipt - Connectify Nigeria',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff;">
            <div style="background: linear-gradient(135deg, #28a745, #20c997); padding: 30px; text-align: center;">
              <h1 style="color: white; margin: 0;">Payment Successful! ✓</h1>
              <p style="color: white; margin: 10px 0 0 0; font-size: 16px;">Transaction Receipt</p>
            </div>
            
            <div style="padding: 30px;">
              <p style="font-size: 16px;">Hello <strong>${recipientName}</strong>,</p>
              <p style="font-size: 16px;">Your payment has been processed successfully. Please find your receipt details below:</p>
              
              <div style="background-color: #f8f9fa; padding: 25px; border-radius: 10px; margin: 25px 0; border: 1px solid #e9ecef;">
                <div style="text-align: center; margin-bottom: 20px;">
                  <p style="color: #666; margin: 0;">Amount Paid</p>
                  <h2 style="color: #28a745; margin: 5px 0; font-size: 36px;">₦${paymentData.amount?.toLocaleString() || '0'}</h2>
                </div>
                
                <hr style="border: none; border-top: 1px dashed #ddd; margin: 20px 0;">
                
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 10px 0; color: #666;">Transaction Reference:</td>
                    <td style="padding: 10px 0; font-weight: bold; text-align: right; font-family: monospace;">${paymentData.reference || 'N/A'}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px 0; color: #666;">Service:</td>
                    <td style="padding: 10px 0; font-weight: bold; text-align: right;">${paymentData.serviceName || 'N/A'}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px 0; color: #666;">Service Provider:</td>
                    <td style="padding: 10px 0; font-weight: bold; text-align: right;">${paymentData.providerName || 'N/A'}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px 0; color: #666;">Booking ID:</td>
                    <td style="padding: 10px 0; font-weight: bold; text-align: right; font-family: monospace;">${paymentData.bookingId || 'N/A'}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px 0; color: #666;">Date & Time:</td>
                    <td style="padding: 10px 0; font-weight: bold; text-align: right;">${transactionDate}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px 0; color: #666;">Status:</td>
                    <td style="padding: 10px 0; text-align: right;">
                      <span style="background-color: #d4edda; color: #155724; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: bold;">COMPLETED</span>
                    </td>
                  </tr>
                </table>
                
                <hr style="border: none; border-top: 1px dashed #ddd; margin: 20px 0;">
                
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 10px 0; color: #666;">Previous Balance:</td>
                    <td style="padding: 10px 0; font-weight: bold; text-align: right;">₦${paymentData.previousBalance?.toLocaleString() || '0'}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px 0; color: #666;">Amount Debited:</td>
                    <td style="padding: 10px 0; font-weight: bold; text-align: right; color: #dc3545;">-₦${paymentData.amount?.toLocaleString() || '0'}</td>
                  </tr>
                  <tr style="background-color: #e8f5e9;">
                    <td style="padding: 10px; color: #2e7d32; font-weight: bold;">New Balance:</td>
                    <td style="padding: 10px; font-weight: bold; text-align: right; color: #2e7d32;">₦${paymentData.newBalance?.toLocaleString() || '0'}</td>
                  </tr>
                </table>
              </div>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/wallet/transactions" 
                   style="background-color: #28a745; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
                  View Transaction History
                </a>
              </div>
              
              <p style="color: #666; font-size: 14px;">Keep this receipt for your records. If you have any questions about this transaction, please contact our support team.</p>
              
              <p style="margin-top: 30px;">Best regards,<br><strong>The Connectify Team</strong></p>
            </div>
            
            <div style="background-color: #f8f9fa; padding: 20px; text-align: center; font-size: 12px; color: #666;">
              <p>This is an automated receipt. Please do not reply to this email.</p>
              <p>© ${new Date().getFullYear()} Connectify Nigeria. All rights reserved.</p>
            </div>
          </div>
        `
      };

      const result = await this.transporter.sendMail(mailOptions);
      console.log('Payment receipt email sent to customer:', result.messageId);
      return result;
    } catch (error) {
      console.error('Failed to send payment receipt email:', error);
      throw error;
    }
  }

  // Send payment received notification to provider
  async sendPaymentReceived(paymentData, recipientEmail, recipientName) {
    if (!this._ensureTransporter()) {
      console.log('Email transporter not available. Skipping payment received email.');
      return null;
    }
    try {
      const transactionDate = new Date().toLocaleDateString('en-NG', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      const mailOptions = {
        from: process.env.EMAIL_FROM || '"Connectify Nigeria" <noreply@connectify.ng>',
        to: recipientEmail,
        subject: '💰 Payment Received - Connectify Nigeria',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff;">
            <div style="background: linear-gradient(135deg, #1eaedb, #17a2b8); padding: 30px; text-align: center;">
              <h1 style="color: white; margin: 0;">Payment Received! 🎉</h1>
              <p style="color: white; margin: 10px 0 0 0; font-size: 16px;">You've received a payment</p>
            </div>
            
            <div style="padding: 30px;">
              <p style="font-size: 16px;">Hello <strong>${recipientName}</strong>,</p>
              <p style="font-size: 16px;">Great news! You have received a payment for your service. Here are the details:</p>
              
              <div style="background: linear-gradient(135deg, #28a745, #20c997); padding: 30px; border-radius: 10px; margin: 25px 0; text-align: center;">
                <p style="color: rgba(255,255,255,0.9); margin: 0 0 5px 0; font-size: 14px;">Amount Received</p>
                <h2 style="color: white; margin: 0; font-size: 42px;">₦${paymentData.amount?.toLocaleString() || '0'}</h2>
              </div>
              
              <div style="background-color: #f8f9fa; padding: 20px; border-radius: 10px; margin: 25px 0;">
                <h3 style="margin-top: 0; color: #333;">📋 Payment Details</h3>
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 10px 0; color: #666;">From Customer:</td>
                    <td style="padding: 10px 0; font-weight: bold; text-align: right;">${paymentData.customerName || 'N/A'}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px 0; color: #666;">Service:</td>
                    <td style="padding: 10px 0; font-weight: bold; text-align: right;">${paymentData.serviceName || 'N/A'}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px 0; color: #666;">Booking ID:</td>
                    <td style="padding: 10px 0; font-weight: bold; text-align: right; font-family: monospace;">${paymentData.bookingId || 'N/A'}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px 0; color: #666;">Transaction Reference:</td>
                    <td style="padding: 10px 0; font-weight: bold; text-align: right; font-family: monospace;">${paymentData.reference || 'N/A'}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px 0; color: #666;">Date & Time:</td>
                    <td style="padding: 10px 0; font-weight: bold; text-align: right;">${transactionDate}</td>
                  </tr>
                </table>
              </div>
              
              <div style="background-color: #e8f5e9; padding: 20px; border-radius: 10px; margin: 25px 0;">
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 8px 0; color: #666;">Previous Balance:</td>
                    <td style="padding: 8px 0; font-weight: bold; text-align: right;">₦${paymentData.previousBalance?.toLocaleString() || '0'}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #666;">Amount Credited:</td>
                    <td style="padding: 8px 0; font-weight: bold; text-align: right; color: #28a745;">+₦${paymentData.amount?.toLocaleString() || '0'}</td>
                  </tr>
                  <tr style="font-size: 18px;">
                    <td style="padding: 10px 0; color: #2e7d32; font-weight: bold;">New Balance:</td>
                    <td style="padding: 10px 0; font-weight: bold; text-align: right; color: #2e7d32;">₦${paymentData.newBalance?.toLocaleString() || '0'}</td>
                  </tr>
                </table>
              </div>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/provider/wallet" 
                   style="background-color: #1eaedb; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
                  View Your Wallet
                </a>
              </div>
              
              <p style="color: #666; font-size: 14px;">Keep up the great work! Your earnings are automatically added to your Connectify wallet.</p>
              
              <p style="margin-top: 30px;">Best regards,<br><strong>The Connectify Team</strong></p>
            </div>
            
            <div style="background-color: #f8f9fa; padding: 20px; text-align: center; font-size: 12px; color: #666;">
              <p>This is an automated notification. Please do not reply to this email.</p>
              <p>© ${new Date().getFullYear()} Connectify Nigeria. All rights reserved.</p>
            </div>
          </div>
        `
      };

      const result = await this.transporter.sendMail(mailOptions);
      console.log('Payment received email sent to provider:', result.messageId);
      return result;
    } catch (error) {
      console.error('Failed to send payment received email:', error);
      throw error;
    }
  }

  // Send funds added confirmation email
  async sendFundsAddedConfirmation(paymentData, recipientEmail, recipientName) {
    if (!this._ensureTransporter()) {
      console.log('Email transporter not available. Skipping funds added confirmation email.');
      return null;
    }
    try {
      const transactionDate = new Date().toLocaleDateString('en-NG', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      const mailOptions = {
        from: process.env.EMAIL_FROM || '"Connectify Nigeria" <noreply@connectify.ng>',
        to: recipientEmail,
        subject: '✅ Wallet Top-up Successful - Connectify Nigeria',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff;">
            <div style="background: linear-gradient(135deg, #6f42c1, #6610f2); padding: 30px; text-align: center;">
              <h1 style="color: white; margin: 0;">Wallet Top-up Successful! 💳</h1>
              <p style="color: white; margin: 10px 0 0 0; font-size: 16px;">Funds have been added to your wallet</p>
            </div>
            
            <div style="padding: 30px;">
              <p style="font-size: 16px;">Hello <strong>${recipientName}</strong>,</p>
              <p style="font-size: 16px;">Your wallet has been successfully credited. Here are the details:</p>
              
              <div style="background: linear-gradient(135deg, #28a745, #20c997); padding: 30px; border-radius: 10px; margin: 25px 0; text-align: center;">
                <p style="color: rgba(255,255,255,0.9); margin: 0 0 5px 0; font-size: 14px;">Amount Added</p>
                <h2 style="color: white; margin: 0; font-size: 42px;">₦${paymentData.amount?.toLocaleString() || '0'}</h2>
              </div>
              
              <div style="background-color: #f8f9fa; padding: 20px; border-radius: 10px; margin: 25px 0;">
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 10px 0; color: #666;">Transaction Reference:</td>
                    <td style="padding: 10px 0; font-weight: bold; text-align: right; font-family: monospace;">${paymentData.reference || 'N/A'}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px 0; color: #666;">Date & Time:</td>
                    <td style="padding: 10px 0; font-weight: bold; text-align: right;">${transactionDate}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px 0; color: #666;">Status:</td>
                    <td style="padding: 10px 0; text-align: right;">
                      <span style="background-color: #d4edda; color: #155724; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: bold;">COMPLETED</span>
                    </td>
                  </tr>
                </table>
                
                <hr style="border: none; border-top: 1px dashed #ddd; margin: 20px 0;">
                
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 8px 0; color: #666;">Previous Balance:</td>
                    <td style="padding: 8px 0; font-weight: bold; text-align: right;">₦${paymentData.previousBalance?.toLocaleString() || '0'}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #666;">Amount Added:</td>
                    <td style="padding: 8px 0; font-weight: bold; text-align: right; color: #28a745;">+₦${paymentData.amount?.toLocaleString() || '0'}</td>
                  </tr>
                  <tr style="background-color: #e8f5e9; font-size: 18px;">
                    <td style="padding: 12px 10px; color: #2e7d32; font-weight: bold; border-radius: 8px 0 0 8px;">New Balance:</td>
                    <td style="padding: 12px 10px; font-weight: bold; text-align: right; color: #2e7d32; border-radius: 0 8px 8px 0;">₦${paymentData.newBalance?.toLocaleString() || '0'}</td>
                  </tr>
                </table>
              </div>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/wallet" 
                   style="background-color: #6f42c1; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
                  View Your Wallet
                </a>
              </div>
              
              <p style="color: #666; font-size: 14px;">Your wallet balance is now ready to use. You can book services or make payments using your wallet.</p>
              
              <p style="margin-top: 30px;">Best regards,<br><strong>The Connectify Team</strong></p>
            </div>
            
            <div style="background-color: #f8f9fa; padding: 20px; text-align: center; font-size: 12px; color: #666;">
              <p>This is an automated receipt. Please do not reply to this email.</p>
              <p>© ${new Date().getFullYear()} Connectify Nigeria. All rights reserved.</p>
            </div>
          </div>
        `
      };

      const result = await this.transporter.sendMail(mailOptions);
      console.log('Funds added confirmation email sent:', result.messageId);
      return result;
    } catch (error) {
      console.error('Failed to send funds added confirmation email:', error);
      throw error;
    }
  }
}

module.exports = new EmailService();