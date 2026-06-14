const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { getValidAccessToken } = require('./ebayAuth');

const base64jpeg = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

async function run() {
  try {
    const token = await getValidAccessToken();
    const xmlPayload = `<?xml version="1.0" encoding="utf-8"?>
<UploadSiteHostedPicturesRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <PictureName>image_test.jpeg</PictureName>
  <PictureSet>Standard</PictureSet>
  <ExtensionInDays>30</ExtensionInDays>
  <PictureData>${base64jpeg}</PictureData>
</UploadSiteHostedPicturesRequest>`;

    console.log("Sending payload...");
    const TRADING_URL = 'https://api.ebay.com/ws/api.dll';
    const picRes = await axios.post(TRADING_URL, xmlPayload, {
      headers: {
        'X-EBAY-API-COMPATIBILITY-LEVEL': '1331',
        'X-EBAY-API-CALL-NAME': 'UploadSiteHostedPictures',
        'X-EBAY-API-SITEID': '0',
        'X-EBAY-API-IAF-TOKEN': token,
        'Content-Type': 'text/xml'
      }
    });
    console.log(picRes.data);
  } catch (e) {
    if (e.response) console.log(e.response.data);
    else console.log(e);
  }
}
run();
