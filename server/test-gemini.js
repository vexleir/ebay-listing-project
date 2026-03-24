const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const axios = require('axios');

async function listModels() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.log("No GEMINI_API_KEY found in .env");
    return;
  }
  
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    const response = await axios.get(url);
    console.log("Available generation models:");
    const models = response.data.models;
    for (const m of models) {
      if (m.supportedGenerationMethods && m.supportedGenerationMethods.includes("generateContent")) {
        console.log("-", m.name);
      }
    }
  } catch (e) {
    if (e.response) {
       console.log("Error:", e.response.status, e.response.data);
    } else {
       console.log("Error:", e.message);
    }
  }
}

listModels();
