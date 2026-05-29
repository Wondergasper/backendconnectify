/**
 * WhatsApp Chatbot Simulation Script
 * This script mocks the WhatsApp webhook flow to test the AI, 
 * session management, and ranking logic without Meta API.
 */

const conversationManager = require('../modules/whatsapp/services/conversationManager');
const sessionService = require('../modules/whatsapp/services/sessionService');
const whatsappService = require('../modules/whatsapp/services/whatsappService');

// Mock whatsappService to print to console instead of sending to API
whatsappService.sendMessage = async (phone, text) => {
  console.log(`\n🤖 [BOT to ${phone}]:`);
  console.log('-----------------------------------');
  console.log(text);
  console.log('-----------------------------------');
  return { success: true };
};

const USER_PHONE = '+2348012345678';

async function simulate(message) {
  console.log(`\n👤 [USER]: ${message}`);
  await conversationManager.handleIncomingMessage(USER_PHONE, message);
}

async function runTest() {
  try {
    console.log('--- STARTING WHATSAPP SIMULATION ---');
    
    // Clear any old session
    await sessionService.clearSession(USER_PHONE);

    // 1. Initial Greeting
    await simulate('Hi');

    // 2. Name Collection (Onboarding)
    await simulate('Chukwudi Obi');

    // 3. Service Search (Complex sentence)
    await simulate('I need a trusted plumber in Ikeja immediately, budget is 5k');

    // 4. Confirmation (Phase 3 logic)
    await simulate('Yes');

    // 5. Provider Selection
    await simulate('1');

    console.log('\n--- SIMULATION COMPLETE ---');
    process.exit(0);
  } catch (error) {
    console.error('Simulation Failed:', error);
    process.exit(1);
  }
}

// Ensure .env is loaded
require('dotenv').config();

if (!process.env.GEMINI_API_KEY) {
  console.error('Error: GEMINI_API_KEY is missing in .env');
  process.exit(1);
}

runTest();
