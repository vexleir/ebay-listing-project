const axios = require('axios');

const clientId = 'MatthewS-ListingA-PRD-b2ae7a3ef-4e166c7d';
const clientSecret = 'PRD-2ae7a3efedcf-50fc-4273-930e-1538'; // <-- PASTE YOUR INCREDIBLY SECRET KEY HERE!
const ruName = 'Matthew_Schultz-MatthewS-Listin-einnp';
const codeText = 'v%5E1.1%23i%5E1%23r%5E1%23f%5E0%23p%5E3%23I%5E3%23t%5EUl41XzQ6NDQ2RjE1QzAxQTBDRTJFNzU1OUVBNjA3OUM1NTE2M0VfMF8xI0VeMjYw&expires_in=299';
const code = decodeURIComponent(codeText);

console.log("Attempting to exchange authorization code for Token...");

const base64data = Buffer.from(clientId + ':' + clientSecret).toString('base64');

axios.post('https://api.ebay.com/identity/v1/oauth2/token', new URLSearchParams({
  grant_type: 'authorization_code',
  code: code,
  redirect_uri: ruName
}).toString(), {
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Authorization': `Basic ${base64data}`
  }
}).then(res => {
  console.log("\n✅ SUCCESS! Here is your brand new, fully-powered token with all required scopes:");
  console.log("----------------------------------------------------------------------------------");
  console.log(res.data.access_token);
  console.log("----------------------------------------------------------------------------------");
  console.log("\nCopy that giant text block perfectly, paste it into our Settings app, and smash Auto-Fetch and Push to eBay!");
}).catch(err => {
  console.error("❌ Failed to generate token.");
  if (err.response) {
    console.error(err.response.data);
  } else {
    console.error(err.message);
  }
});
