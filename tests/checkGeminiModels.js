const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

async function listModels() {
  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    // The SDK might not expose a direct listModels, but we can try common ones
    const models = ['gemini-1.5-flash-latest', 'gemini-1.5-flash', 'gemini-1.5-pro-latest', 'gemini-pro'];
    
    for (const modelName of models) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent('Hi');
        console.log(`✅ Model ${modelName} is available and responding.`);
        break; 
      } catch (err) {
        console.log(`❌ Model ${modelName} failed: ${err.message}`);
      }
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

listModels();
