require('dotenv').config();
const { app, bootstrap } = require('./app');

const PORT = process.env.PORT || 3001;

app.listen(PORT, async () => {
  console.log(`eBay Proxy Server running on http://localhost:${PORT}`);
  const key = process.env.GEMINI_API_KEY;
  if (key) console.log(`GEMINI_API_KEY loaded: ${key.substring(0, 8)}... (length: ${key.length})`);
  else console.log('GEMINI_API_KEY: NOT SET');
  await bootstrap();
});
