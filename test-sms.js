// test-sms.js
/**
 * Validation Script for Custom SMS Service (MailerSend Driver) and SMS Template Integration
 */
require('dotenv').config();

// Enforce environment dummy variables if not set to prevent boot checks from crashing
process.env.JWT_SECRET = process.env.JWT_SECRET || 'connectify_development_jwt_secret_key_32_characters_minimum_length_safe_key';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://placeholder.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder';

console.log('🧪 Starting SMS service validation checks...');

try {
    // 1. Verify smsService loading and interface compatibility
    console.log('\n--- 1. Testing SmsService Driver Loading ---');
    const smsService = require('./services/smsService');
    
    if (typeof smsService.sendRawSms !== 'function') {
        throw new Error('SmsService is missing sendRawSms function!');
    }
    console.log('✓ smsService.sendRawSms is available');

    if (typeof smsService.formatPhoneNumber !== 'function') {
        throw new Error('SmsService is missing formatPhoneNumber function!');
    }
    console.log('✓ smsService.formatPhoneNumber is available');

    // 2. Verify Phone Number Normalization rules (Nigerian formatting focus)
    console.log('\n--- 2. Testing Phone Number Formatting Normalization ---');
    const formattingTests = [
        { input: '08031234567', expected: '+2348031234567', desc: 'Local zero notation' },
        { input: '2348031234567', expected: '+2348031234567', desc: 'Country code without plus' },
        { input: '+2348031234567', expected: '+2348031234567', desc: 'Standard E.164 formatting' },
        { input: '8031234567', expected: '+2348031234567', desc: '10-digit number without zero' },
        { input: '+14155552671', expected: '+14155552671', desc: 'US standard international format' }
    ];

    formattingTests.forEach(test => {
        const result = smsService.formatPhoneNumber(test.input);
        if (result !== test.expected) {
            throw new Error(`Formatting failed for "${test.input}" (${test.desc}): expected "${test.expected}" but got "${result}"`);
        }
        console.log(`  ✓ [Formatted] "${test.input}" (${test.desc}) -> "${result}"`);
    });
    console.log('✓ All phone number formatting checks passed successfully!');

    // 3. Verify SmsNotificationService loading and interface compatibility
    console.log('\n--- 3. Testing SmsNotificationService Loading ---');
    const smsNotificationService = require('./services/notification/smsNotificationService');
    if (typeof smsNotificationService.sendSms !== 'function') {
        throw new Error('SmsNotificationService is missing sendSms function!');
    }
    console.log('✓ smsNotificationService.sendSms is available');

    if (typeof smsNotificationService.sendTemplatedSms !== 'function') {
        throw new Error('SmsNotificationService is missing sendTemplatedSms function!');
    }
    console.log('✓ smsNotificationService.sendTemplatedSms is available');

    // 4. Test SMS Template Compilation and Mock Routing
    console.log('\n--- 4. Testing Template Compilation and Routing ---');
    
    // Set up environment credentials mock for testing
    smsService.apiKey = smsService.apiKey || 'mlsn.test_mock_api_key_12345';
    smsService.sender = smsService.sender || '+18449013030';

    let fetchCalled = false;
    let requestPayload = null;

    // Mock global fetch to capture the HTTP dispatch details without making network calls
    global.fetch = async (url, options) => {
        fetchCalled = true;
        requestPayload = JSON.parse(options.body);
        console.log(`  ✈️  [Intercepted Mock Fetch API Dispatch]`);
        console.log(`     URL:  ${url}`);
        console.log(`     From: ${requestPayload.from}`);
        console.log(`     To:   ${requestPayload.to}`);
        console.log(`     Text: ${requestPayload.text}`);
        
        return {
            ok: true,
            status: 200,
            json: async () => ({ sms_number_id: 'mock_sms_id_998877' })
        };
    };

    const mockReminderData = {
        phone: '08123456789',
        time: '15:30',
        serviceName: 'AC Repairs & Installation',
        address: '14b, Admiralty Way, Lekki Phase 1, Lagos'
    };

    console.log('  Triggering sendTemplatedSms for "booking_reminder"...');
    smsNotificationService.sendTemplatedSms('booking_reminder', mockReminderData)
        .then(result => {
            console.log('  ✓ sendTemplatedSms output result:', result);
            
            if (!fetchCalled) {
                throw new Error('Fetch API was not triggered!');
            }
            
            if (result.success !== true) {
                throw new Error('Mock transmission did not report success!');
            }

            if (requestPayload.to[0] !== '+2348123456789') {
                throw new Error(`Recipient formatting error in payload: got "${requestPayload.to[0]}"`);
            }

            console.log('  ✓ SMS template parsed, phone normalized, and routed to mock MailerSend gateway successfully!');
            console.log('\n🌟 ALL SMS SERVICE VALIDATION CHECKS PASSED SUCCESSFULLY! 🌟');
            process.exit(0);
        })
        .catch(err => {
            console.error('  ❌ Template execution failed:', err);
            process.exit(1);
        });

} catch (error) {
    console.error('❌ SMS service validation checks failed with error:', error);
    process.exit(1);
}
