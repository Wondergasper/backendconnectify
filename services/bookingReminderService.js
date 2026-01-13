// services/bookingReminderService.js
const Booking = require('../models/Booking');
const emailService = require('./emailService');

/**
 * Booking Reminder Service
 * Sends email reminders for bookings scheduled for the next day
 */
class BookingReminderService {
    constructor() {
        this.isRunning = false;
        this.intervalId = null;
    }

    /**
     * Start the reminder scheduler
     * Runs every hour to check for upcoming bookings
     */
    start() {
        if (this.isRunning) {
            console.log('⚠️  Booking reminder service is already running');
            return;
        }

        console.log('📅 Starting booking reminder service...');
        this.isRunning = true;

        // Run immediately on start
        this.sendReminders();

        // Then run every hour (3600000 ms)
        this.intervalId = setInterval(() => {
            this.sendReminders();
        }, 60 * 60 * 1000); // 1 hour

        console.log('✅ Booking reminder service started (runs every hour)');
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
            // Get tomorrow's date range
            const now = new Date();
            const tomorrow = new Date(now);
            tomorrow.setDate(tomorrow.getDate() + 1);

            // Set to start and end of tomorrow
            const tomorrowStart = new Date(tomorrow);
            tomorrowStart.setHours(0, 0, 0, 0);

            const tomorrowEnd = new Date(tomorrow);
            tomorrowEnd.setHours(23, 59, 59, 999);

            // Find confirmed bookings for tomorrow that haven't been reminded yet
            const bookings = await Booking.find({
                date: {
                    $gte: tomorrowStart,
                    $lte: tomorrowEnd
                },
                status: 'confirmed',
                reminderSent: { $ne: true } // Only get bookings that haven't been reminded
            })
                .populate('service', 'name price')
                .populate('customer', 'name email')
                .populate('provider', 'name email');

            return bookings;
        } catch (error) {
            console.error('Error getting upcoming bookings:', error);
            return [];
        }
    }

    /**
     * Send reminder emails for upcoming bookings
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
                    // Prepare booking data for email
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

                    // Send reminder to customer
                    if (booking.customer?.email) {
                        await emailService.sendBookingReminder(
                            bookingData,
                            booking.customer.email,
                            booking.customer.name,
                            'customer'
                        );
                        console.log(`✅ Reminder sent to customer: ${booking.customer.email}`);
                    }

                    // Send reminder to provider
                    if (booking.provider?.email) {
                        await emailService.sendBookingReminder(
                            bookingData,
                            booking.provider.email,
                            booking.provider.name,
                            'provider'
                        );
                        console.log(`✅ Reminder sent to provider: ${booking.provider.email}`);
                    }

                    // Mark booking as reminded
                    booking.reminderSent = true;
                    await booking.save();

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
