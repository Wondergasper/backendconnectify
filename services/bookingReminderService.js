// services/bookingReminderService.js
const { bookingRepository } = require('../repositories/supabase/bookingRepository');
const emailService = require('./emailService');
const smsNotificationService = require('./notification/smsNotificationService');

/**
 * Booking Reminder Service
 * Sends email and SMS reminders for bookings scheduled for the next day
 */
class BookingReminderService {
    constructor() {
        this.isRunning = false;
        this.intervalId = null;
    }

    /**
     * Start the reminder scheduler
     * Uses Bull queue for distributed safety (ensures only one worker runs the task)
     */
    async start() {
        if (this.isRunning) {
            console.log('⚠️  Booking reminder service is already running');
            return;
        }

        console.log('📅 Scheduling booking reminders via Bull queue...');
        this.isRunning = true;

        const { addReminderJob } = require('./queueService');
        try {
            await addReminderJob.scheduleHourlyReminders();
            console.log('✅ Booking reminder task scheduled (runs every hour via distributed queue)');
        } catch (error) {
            console.error('❌ Failed to schedule booking reminders:', error);
            // Fallback to local interval if queue scheduling fails
            this.intervalId = setInterval(() => {
                this.sendReminders();
            }, 60 * 60 * 1000);
        }
    }

    /**
     * Stop the reminder scheduler
     */
    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            this.isRunning = false;
            console.log('🛑 Booking reminder service stopped');
        }
    }

    /**
     * Get bookings scheduled for tomorrow that need reminders
     */
    async getUpcomingBookings() {
        try {
            return bookingRepository.listUpcomingReminders(new Date());
        } catch (error) {
            console.error('Error getting upcoming bookings:', error);
            return [];
        }
    }

    /**
     * Send reminder emails and SMS for upcoming bookings
     */
    async sendReminders() {
        try {
            console.log('🔍 Checking for bookings needing reminders...');

            const bookings = await this.getUpcomingBookings();

            if (bookings.length === 0) {
                console.log('📭 No bookings need reminders at this time');
                return { sent: 0, failed: 0 };
            }

            console.log(`📬 Found ${bookings.length} booking(s) to remind`);

            let sent = 0;
            let failed = 0;

            for (const booking of bookings) {
                try {
                    // Prepare booking data for reminders
                    const bookingData = {
                        _id: booking._id,
                        date: booking.date,
                        time: booking.time,
                        address: booking.address,
                        serviceName: booking.service?.name || 'Service',
                        customerName: booking.customer?.name || 'Customer',
                        providerName: booking.provider?.name || 'Provider',
                        service: booking.service
                    };

                    // 1. Send reminder to customer (Email)
                    if (booking.customer?.email) {
                        await emailService.sendBookingReminder(
                            bookingData,
                            booking.customer.email,
                            booking.customer.name,
                            'customer'
                        );
                        console.log(`✅ Email reminder sent to customer: ${booking.customer.email}`);
                    }

                    // 2. Send reminder to customer (SMS)
                    if (booking.customer?.phone) {
                        await smsNotificationService.sendTemplatedSms('booking_reminder', {
                            phone: booking.customer.phone,
                            time: bookingData.time,
                            serviceName: bookingData.serviceName,
                            address: bookingData.address
                        });
                    }

                    // 3. Send reminder to provider (Email)
                    if (booking.provider?.email) {
                        await emailService.sendBookingReminder(
                            bookingData,
                            booking.provider.email,
                            booking.provider.name,
                            'provider'
                        );
                        console.log(`✅ Email reminder sent to provider: ${booking.provider.email}`);
                    }

                    // 4. Send reminder to provider (SMS)
                    if (booking.provider?.phone) {
                        await smsNotificationService.sendTemplatedSms('booking_reminder', {
                            phone: booking.provider.phone,
                            time: bookingData.time,
                            serviceName: bookingData.serviceName,
                            address: bookingData.address
                        });
                    }

                    // Mark booking as reminded
                    await bookingRepository.markReminderSent(booking._id);
                    sent++;
                } catch (error) {
                    console.error(`❌ Failed to send reminder for booking ${booking._id}:`, error.message);
                    failed++;
                }
            }

            console.log(`📊 Reminder summary: ${sent} sent, ${failed} failed`);
            return { sent, failed };
        } catch (error) {
            console.error('❌ Error in reminder service:', error);
            return { sent: 0, failed: 0 };
        }
    }

    /**
     * Manually trigger reminders (for testing or API endpoint)
     */
    async triggerReminders() {
        return await this.sendReminders();
    }
}

// Export singleton instance
module.exports = new BookingReminderService();
