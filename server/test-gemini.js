const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function testKey() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.log("No GEMINI_API_KEY found in .env");
    return;
  }
  console.log("Testing key ending in:", apiKey.slice(-4));
  
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const result = await model.generateContent("Hello, strictly reply with 'OK' and nothing else.");
    console.log("Result:", result.response.text());
  } catch (e) {
    console.log("Error:", e.message);
  }
}

testKey();
