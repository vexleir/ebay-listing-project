const axios = require('axios');

// Paste your massive, brand new OAuth Token here!
const token = "v^1.1#i^1#p^3#f^0#I^3#r^0#t^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";

const locationPayload = {
  location: {
    address: {
      addressLine1: "1 Main St", // You can change this to your actual P.O. Box or return address if you wish!
      city: "San Jose",
      stateOrProvince: "CA",
      postalCode: "95125",
      country: "US"
    }
  },
  name: "FlipSide Warehouse",
  merchantLocationStatus: "ENABLED",
  locationTypes: ["STORE"]
};

console.log("Provisioning 'default' location on your eBay account...");

axios.post('https://api.ebay.com/sell/inventory/v1/location/default', locationPayload, {
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Language': 'en-US',
    'Content-Type': 'application/json'
  }
}).then(() => {
  console.log("✅ SUCCESS! Your eBay account now has a physical API Inventory Location registered as 'default'!");
  console.log("You can now safely press 'Push to eBay' in the Web App!");
}).catch(err => {
  console.error("❌ Failed to create location:", err.response ? err.response.data : err.message);
});
