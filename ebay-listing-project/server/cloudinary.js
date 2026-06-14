const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

async function uploadImage(base64Data) {
  const result = await cloudinary.uploader.upload(base64Data, {
    folder: 'ebay-listings',
    resource_type: 'image',
  });
  return result.secure_url;
}

module.exports = { uploadImage };
