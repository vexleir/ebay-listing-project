const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const PORT = 3001;

// POST /api/ebay/draft
// Creates a draft listing on eBay using the user's OAuth token
app.post('/api/ebay/draft', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  const listingData = req.body;

  if (!token) {
    return res.status(401).json({ error: 'Missing eBay API token' });
  }

  try {
    console.log('--- Received request to push to eBay ---');
    console.log('Title:', listingData.title);
    console.log('Price:', listingData.priceRecommendation);
    console.log('Specifics:', listingData.itemSpecifics);
    
    // IMPORTANT TODO: Integrating with eBay's API directly.
    // eBay's Inventory API requires the following to create a listing:
    // 1. A predefined Fulfillment Policy, Payment Policy, and Return Policy ID on your eBay account.
    // 2. A mapped eBay Category ID (e.g., 261068).
    // 
    // Usually, you would call:
    // 1. PUT https://api.ebay.com/sell/inventory/v1/inventory_item/{sku}
    // 2. POST https://api.ebay.com/sell/inventory/v1/offer
    // 
    // Since Business Policies are unique to the user, we've set up this proxy 
    // to handle the request safely. You will need to substitute this mock response 
    // with the actual fetch calls to api.ebay.com using your policy IDs.

    // Simulated API call delay
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Simulated successful response
    const mockDraftId = 'EBY-' + Math.floor(Math.random() * 10000000);
    
    console.log(`Successfully mocked push for ${listingData.title}. Draft ID: ${mockDraftId}`);
    
    res.json({ success: true, draftId: mockDraftId });
    
  } catch (error) {
    console.error('eBay API Error:', error);
    res.status(500).json({ error: 'Failed to push draft to eBay' });
  }
});

app.listen(PORT, () => {
  console.log(`eBay Proxy Server running locally on http://localhost:${PORT}`);
  console.log(`Make sure to supply your eBay OAuth token from the frontend UI.`);
});
