const axios = require('axios');
require('dotenv').config();

async function listAllModels() {
    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`;
        const resp = await axios.get(url);
        console.log('--- AVAILABLE MODELS ---');
        console.log(JSON.stringify(resp.data, null, 2));
    } catch (err) {
        console.error('❌ Failed to list models:', err.response?.data || err.message);
    }
}

listAllModels();
