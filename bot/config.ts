const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

// Validate required environment variables
const requiredEnvVars = [
  'BOT_TOKEN',
  'WEBAPP_URL',
  'API_BASE_URL',
  'API_EMAIL',
  'API_PASSWORD',
  'API_FEEDBACK_EMAIL'
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}

module.exports = {
  BOT_TOKEN: process.env.BOT_TOKEN,
  WEBAPP_URL: process.env.WEBAPP_URL,
  API_BASE_URL: process.env.API_BASE_URL,
  API_EMAIL: process.env.API_EMAIL,
  API_PASSWORD: process.env.API_PASSWORD,
  API_FEEDBACK_EMAIL: process.env.API_FEEDBACK_EMAIL
}; 