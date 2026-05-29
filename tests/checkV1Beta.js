const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

async function checkV1Beta() {
  try {
    // Some versions of the SDK allow passing API version or 
    // we can try the model names that include versions
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    
    // Attempting to see if we can get a response with different identifiers
    const models = ['gemini-1.5-flash', 'gemini-pro'];
    
    for (const m of models) {
        console.log(`Checking ${m}...`);
        try {
            const model = genAI.getGenerativeModel({ model: m });
            const result = await model.generateContent('Hi');
            console.log(`✅ Success with ${m}`);
            return;
        } catch (e) {
            console.log(`❌ Fail ${m}: ${e.message}`);
        }
    }

    // Direct fetch attempt to verify API key and URL structure if SDK is acting up
    const axios = require('axios');
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
    
    try {
        const resp = await axios.post(url, {
            contents: [{ parts: [{ text: "Hi" }] }]
        });
        console.log('✅ v1beta Direct Fetch Success:', resp.data?.candidates?.[0]?.content?.parts?.[0]?.text);
    } catch (err) {
        console.error('❌ v1beta Direct Fetch Fail:', err.response?.data || err.message);
    }

  } catch (error) {
    console.error('Test script error:', error);
  }
}

checkV1Beta();
