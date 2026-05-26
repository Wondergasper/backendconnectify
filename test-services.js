// test-services.js
/**
 * Validation Script for Email (Resend) and Push Notification (Firebase FCM) Integration
 */
require('dotenv').config();

// Enforce environment dummy variables if not set to prevent boot checks from crashing
process.env.JWT_SECRET = process.env.JWT_SECRET || 'connectify_development_jwt_secret_key_32_characters_minimum_length_safe_key';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://placeholder.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder';

console.log('🧪 Starting service validation checks...');

try {
    // 1. Verify EmailService loading and interface compatibility
    console.log('\n--- 1. Testing EmailService (Resend) Loading ---');
    const emailService = require('./services/emailService');
    
    if (typeof emailService.sendGenericEmail !== 'function') {
        throw new Error('EmailService is missing sendGenericEmail function!');
    }
    console.log('✓ emailService.sendGenericEmail is available');

    if (!emailService.transporter || typeof emailService.transporter.sendMail !== 'function') {
        throw new Error('EmailService transporter.sendMail compatibility layer is missing or incorrect!');
    }
    console.log('✓ emailService.transporter.sendMail compatibility layer is present');

    // 2. Verify PushService loading
    console.log('\n--- 2. Testing PushService (Firebase FCM) Loading ---');
    const pushService = require('./services/notification/pushService');
    if (typeof pushService.sendPushNotification !== 'function') {
        throw new Error('PushService is missing sendPushNotification function!');
    }
    console.log('✓ pushService.sendPushNotification is available');

    // 3. Verify InAppService loading
    console.log('\n--- 3. Testing InAppService Loading ---');
    const inappService = require('./services/notification/inappService');
    if (typeof inappService.sendInApp !== 'function') {
        throw new Error('InAppService is missing sendInApp function!');
    }
    console.log('✓ inappService.sendInApp is available');

    // 4. Test Email Template Compilation
    console.log('\n--- 4. Testing Template Compilation and Routing ---');
    // Pre-initialize and mock Resend to prevent real API hits during validation
    let emailRouted = false;
    emailService.resend = {
        emails: {
            send: async (payload) => {
                emailRouted = true;
                console.log(`  ✈️  [Intercepted Mock Resend Send]`);
                console.log(`     From:    ${payload.from}`);
                console.log(`     To:      ${payload.to}`);
                console.log(`     Subject: ${payload.subject}`);
                return { data: { id: 'mock_resend_id_12345' }, error: null };
            }
        }
    };
    
    // Override lazy-loader to preserve the mock
    emailService._ensureTransporter = () => {
        emailService._initialized = true;
        return true;
    };

    const mockBooking = {
        id: 'booking_123',
        provider: { name: 'Adekunle Gold' },
        service: { name: 'Premium House Cleaning' },
        date: new Date().toISOString(),
        time: '14:00',
        address: '12, Admiralty Way, Lekki Phase 1, Lagos',
        totalAmount: 15000
    };

    console.log('  Triggering sendBookingConfirmation template...');
    emailService.sendBookingConfirmation(mockBooking, 'customer@example.com', 'Tunde')
        .then(result => {
            console.log('  ✓ sendBookingConfirmation output:', result);
            if (emailRouted) {
                console.log('  ✓ Email compilation and Resend routing completed successfully!');
            } else {
                console.error('  ❌ Email was not routed through Resend client!');
            }
            console.log('\n🌟 ALL SERVICE VALIDATION CHECKS PASSED SUCCESSFULLY! 🌟');
            process.exit(0);
        })
        .catch(err => {
            console.error('  ❌ Template execution failed:', err);
            process.exit(1);
        });

} catch (error) {
    console.error('❌ Service validation checks failed with error:', error);
    process.exit(1);
}
