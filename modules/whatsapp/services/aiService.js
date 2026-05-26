const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initialize Gemini with a lazy singleton so crashes at startup are avoided
// if the key isn't set yet.
let genAI = null;
function getGenAI() {
  if (!genAI) {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY environment variable is not set.');
    }
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  return genAI;
}

/**
 * Prompt template for intent extraction.
 * Keeping it separate makes it easy to iterate on without touching logic.
 */
function buildPrompt(message, session) {
  return `
You are Connectify, a friendly AI assistant on WhatsApp helping Nigerians find and book trusted local service providers (plumbers, electricians, tailors, cleaners, etc.).

## Context
User's current conversation state:
${JSON.stringify(session, null, 2)}

## User's latest message
"${message}"

## Your Task
1. Extract the following from the conversation so far AND this message:
   - **service**: The type of service they need (e.g., "plumber", "electrician"). Use null if unclear.
   - **location**: The area/neighbourhood in Nigeria (e.g., "Ikeja", "Lekki Phase 1"). Use null if not mentioned.
   - **date**: When they need the service (e.g., "tomorrow", "2024-07-20"). Use null if not mentioned.
2. If any of [service, location] is still missing, write a friendly follow-up question in replyText.
3. If both service AND location are present, set **isConfirmed: true** and write a brief confirmation summary in replyText asking the user to confirm.
4. Never set isConfirmed: true if service or location is null.

## Response Format
You MUST respond ONLY with valid JSON (no markdown, no code fences):
{
  "replyText": "The exact WhatsApp message to send to the user.",
  "sessionUpdates": {
    "service": "string or null",
    "location": "string or null",
    "date": "string or null",
    "isConfirmed": false
  }
}

Be warm, concise, and use simple English. You may use one or two emojis naturally.
  `.trim();
}

/**
 * Analyzes the user's message using Gemini to extract intent and decide the next conversation step.
 * @param {string} message - The raw message from the user
 * @param {object} session - The current session state
 * @returns {{ replyText: string, sessionUpdates: object }}
 */
exports.analyzeIntent = async (message, session) => {
  try {
    const model = getGenAI().getGenerativeModel({ model: 'gemini-1.5-flash' });
    const prompt = buildPrompt(message, session);

    const result = await model.generateContent(prompt);
    const response = await result.response;
    let text = response.text().trim();

    // Strip any accidental markdown code fences Gemini might include
    if (text.startsWith('```')) {
      text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    }

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (parseErr) {
      console.error('[AIService] Failed to parse Gemini JSON response:', text);
      throw new Error('Invalid JSON from Gemini');
    }

    // Validate expected shape
    if (!parsed.replyText || typeof parsed.sessionUpdates !== 'object') {
      throw new Error('Unexpected Gemini response structure');
    }

    return parsed;
  } catch (error) {
    console.error('[AIService] Error:', error.message || error);
    return {
      replyText:
        "Sorry, I'm having a little trouble understanding right now 😅. Could you please repeat that?",
      sessionUpdates: {},
    };
  }
};
