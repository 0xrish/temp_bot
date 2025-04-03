const { Telegraf } = require('telegraf');
const axios = require('axios');
const { BOT_TOKEN, WEBAPP_URL, API_BASE_URL, API_EMAIL, API_PASSWORD, API_FEEDBACK_EMAIL } = require('./config');

if (!BOT_TOKEN) {
  throw new Error('BOT_TOKEN must be provided!');
}

const bot = new Telegraf(BOT_TOKEN);

// API Configuration
let accessToken = '';
let refreshToken = '';

interface UserInfo {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
}

interface ApiResponse {
  data: any;
  status: number;
}

// Function to get access token
async function getAccessToken(): Promise<string> {
  try {
    const response = await axios.post(`${API_BASE_URL}/token/`, {
      email: API_EMAIL,
      password: API_PASSWORD
    });
    accessToken = response.data.access;
    refreshToken = response.data.refresh;
    return accessToken;
  } catch (error) {
    console.error('Error getting access token:', error);
    throw error;
  }
}

// Function to refresh token
async function refreshAccessToken(): Promise<string> {
  try {
    const response = await axios.post(`${API_BASE_URL}/token/refresh/`, {
      refresh: refreshToken
    });
    accessToken = response.data.access;
    return accessToken;
  } catch (error) {
    console.error('Error refreshing token:', error);
    // If refresh fails, try to get new tokens
    return getAccessToken();
  }
}

// Function to send feedback
async function sendFeedback(userInfo: UserInfo, message: string): Promise<ApiResponse> {
  try {
    if (!accessToken) {
      await getAccessToken();
    }

    const formattedMessage = `
📝 New Feedback Received

👤 User Information:
• ID: ${userInfo.id}
• Username: @${userInfo.username || 'N/A'}
• Name: ${userInfo.first_name} ${userInfo.last_name || ''}

💬 Feedback Message:
${message}

📅 Timestamp: ${new Date().toLocaleString()}
    `.trim();

    const feedbackData = {
      subject: `[Feedback] From ${userInfo.first_name}`,
      message: formattedMessage,
      to_email: API_FEEDBACK_EMAIL
    };

    const response = await axios.post(
      `${API_BASE_URL}/mail/send-email`,
      feedbackData,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return response;
  } catch (error: any) {
    if (error.response && error.response.status === 401) {
      // Token expired, try to refresh
      await refreshAccessToken();
      // Retry the request
      return sendFeedback(userInfo, message);
    }
    throw error;
  }
}

// Basic commands
bot.command('start', (ctx: any) => {
  const welcomeMessage = `🌟 Welcome to Createathon, ${ctx.from.first_name}! 🌟

Join our vibrant community of creators where imagination knows no bounds! 🎨✨

🚀 What We Offer:
• Connect with fellow creators
• Grow your personal brand
• Transform creativity into success
• Share your feedback

Here's an inspiring quote to kickstart your creative journey:

Creativity is intelligence having fun. 
— Albert Einstein

Ready to begin your creative journey? Let's make something amazing! ✨`;

  ctx.reply(welcomeMessage, {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "🎨 Join Community", url: "https://t.me/createathon" },
          { text: "💬 Give Feedback", callback_data: "feedback" }
        ],
        [
          { text: "Open App", web_app: { url: "https://miniapp.createathon.co/" } }
        ]
      ]
    }
  });

  // Add message about the App button
  ctx.reply(`To access our app, please click the "App" button located in the bottom left corner of Telegram. This will open our application directly within Telegram! 🚀`);
});

// Handle callback queries
bot.action('feedback', async (ctx: any) => {
  ctx.answerCbQuery();
  ctx.reply('We value your feedback! Please share your thoughts, suggestions, or any issues you\'ve encountered. Your input helps us improve! 🚀\n\nJust type your message and we\'ll receive it.');
});

bot.action('get_inspired', (ctx: any) => {
  ctx.answerCbQuery();
  const quotes = [
    "Every child is an artist. The problem is how to remain an artist once we grow up. - Pablo Picasso",
    "Creativity takes courage. - Henri Matisse",
    "The only way to do great work is to love what you do. - Steve Jobs"
  ];
  const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];
  ctx.reply(`💫 Here's some inspiration for you:\n\n${randomQuote}`);
});

bot.command('help', (ctx: any) => {
  ctx.reply(
    'Available commands:\n' +
    '/start - Start the bot\n' +
    '/help - Show this help message\n' +
    '/feedback - Share your feedback\n' +
    '/community - Join our community'
  );
});

bot.command('feedback', (ctx: any) => {
  ctx.reply('We\'d love to hear from you! Please share your feedback, suggestions, or any issues you\'ve encountered. Your input helps us improve! 🚀\n\nJust type your message and we\'ll receive it.');
});

bot.command('community', (ctx: any) => {
  ctx.reply('Join our community on Telegram! 🚀\n\nClick the button below to join:', {
    reply_markup: {
      inline_keyboard: [[
        { text: "Join Createathon", url: "https://t.me/createathon" }
      ]]
    }
  });
});

// Handle feedback messages
bot.on('message', async (ctx: any) => {
  if (!ctx.message.text.startsWith('/')) {
    try {
      // Send feedback to API
      await sendFeedback(ctx.from, ctx.message.text);
      ctx.reply('Thank you for your feedback! We appreciate your input and will use it to improve our services. 🚀');
    } catch (error) {
      console.error('Error sending feedback:', error);
      ctx.reply('Sorry, there was an error sending your feedback. Please try again later. 😔');
    }
  }
});

// Initialize access token on startup
getAccessToken().catch(console.error);

bot.launch().then(() => {
  console.log('Bot is running...');
});

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));