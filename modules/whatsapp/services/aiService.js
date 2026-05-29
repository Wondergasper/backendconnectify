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
   - **service**: Type of service (e.g., "plumber"). Use null if unclear.
   - **location**: Area in Nigeria (e.g., "Ikeja", "Lekki"). Use null if missing.
   - **date**: Preferred date (e.g., "today", "2024-07-20"). Normalize relative dates based on today: ${new Date().toISOString().split('T')[0]}.
   - **urgency**: Set to "emergency" if they need it "now", "immediately", or "ASAP". Otherwise "normal".
   - **budget**: Any mentioned price range or limit. Use null if not mentioned.

2. **Confirmation Logic**:
   - If BOTH **service** AND **location** are present and clearly understood, set **isConfirmed: true**.
   - If either is missing or vague, set **isConfirmed: false**.

3. **Reply Generation**:
   - If **isConfirmed** is false: Write a warm, brief follow-up asking for the missing info (e.g., "What area in Lagos are you in?"). Use 1 emoji.
   - If **isConfirmed** is true: Write a brief summary of what you understood and ask: "Should I find the best providers for this now?"

## Response Format
You MUST respond ONLY with valid JSON:
{
  "replyText": "...",
  "sessionUpdates": {
    "service": "...",
    "location": "...",
    "date": "...",
    "urgency": "...",
    "budget": "...",
    "isConfirmed": boolean
  }
}
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
    const model = getGenAI().getGenerativeModel({ model: 'gemini-2.0-flash' });
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
