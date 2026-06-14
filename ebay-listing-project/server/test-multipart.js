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
  <PictureName>image_test</PictureName>
  <PictureSet>Standard</PictureSet>
  <ExtensionInDays>30</ExtensionInDays>
</UploadSiteHostedPicturesRequest>`;

    const boundary = '----eBayEpsBoundary' + Date.now();
    
    const part1 = Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="XML Payload"\r\n` +
      `Content-Type: text/xml\r\n\r\n` +
      xmlPayload + `\r\n` +
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="dummy"; filename="image.jpg"\r\n` +
      `Content-Type: application/octet-stream\r\n\r\n`
    );
    
    const imageBytes = Buffer.from(base64jpeg, 'base64');
    
    const part3 = Buffer.from(`\r\n--${boundary}--\r\n`);
    
    const finalPayload = Buffer.concat([part1, imageBytes, part3]);

    console.log("Sending MULTIPART payload...");
    const TRADING_URL = 'https://api.ebay.com/ws/api.dll';
    const picRes = await axios.post(TRADING_URL, finalPayload, {
      headers: {
        'X-EBAY-API-COMPATIBILITY-LEVEL': '1331',
        'X-EBAY-API-CALL-NAME': 'UploadSiteHostedPictures',
        'X-EBAY-API-SITEID': '0',
        'X-EBAY-API-IAF-TOKEN': token,
        'Content-Type': `multipart/form-data; boundary=${boundary}`
      }
    });
    console.log(picRes.data);
  } catch (e) {
    if (e.response) console.log(e.response.data);
    else console.log(e);
  }
}
run();
