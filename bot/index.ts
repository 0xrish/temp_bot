const { Telegraf } = require('telegraf');
const axios = require('axios');
const { BOT_TOKEN, WEBAPP_URL, API_BASE_URL, API_EMAIL, API_PASSWORD, API_FEEDBACK_EMAIL } = require('./config');

if (!BOT_TOKEN) {
  throw new Error('BOT_TOKEN must be provided!');
}

// Type definitions
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

// Enhanced message type definitions
interface TelegramMessage {
  message_id: number;
  text?: string;
  caption?: string;
  photo?: any[];
  video?: any;
  document?: any;
  voice?: any;
  audio?: any;
  sticker?: any;
  animation?: any;
  location?: any;
  contact?: any;
}

interface TelegramContext {
  from: UserInfo;
  message?: TelegramMessage;
  update?: {
    update_id: number;
  };
  chat?: {
    id: number;
  };
  telegram: {
    deleteMessage: (chatId: number, messageId: number) => Promise<boolean>;
  };
  reply: (text: string, options?: any) => Promise<any>;
  answerCbQuery: (text?: string) => Promise<boolean>;
  deleteMessage: () => Promise<boolean>;
}

// Initialize the bot
const bot = new Telegraf(BOT_TOKEN);

// API Configuration
let accessToken = '';
let refreshToken = '';
let tokenExpiry = 0;
const TOKEN_REFRESH_BUFFER = 60000; // 1 minute before expiry

// Function to get access token
async function getAccessToken(): Promise<string> {
  try {
    console.log('Getting new access token...');
    const response = await axios.post(`${API_BASE_URL}/token/`, {
      email: API_EMAIL,
      password: API_PASSWORD
    });
    
    accessToken = response.data.access;
    refreshToken = response.data.refresh;
    
    // Set token expiry (typically 1 hour, but can be adjusted)
    tokenExpiry = Date.now() + 3600000; // 1 hour from now
    
    return accessToken;
  } catch (error) {
    console.error('Error getting access token:', error);
    throw new Error('Authentication failed. Please check API credentials.');
  }
}

// Function to refresh token
async function refreshAccessToken(): Promise<string> {
  try {
    console.log('Refreshing access token...');
    const response = await axios.post(`${API_BASE_URL}/token/refresh/`, {
      refresh: refreshToken
    });
    
    accessToken = response.data.access;
    // Reset expiry time
    tokenExpiry = Date.now() + 3600000; // 1 hour from now
    
    return accessToken;
  } catch (error) {
    console.error('Error refreshing token:', error);
    // If refresh fails, try to get new tokens
    return getAccessToken();
  }
}

// Function to ensure we have a valid token
async function ensureValidToken(): Promise<string> {
  // If token is missing or about to expire, refresh it
  if (!accessToken || Date.now() > tokenExpiry - TOKEN_REFRESH_BUFFER) {
    if (refreshToken && Date.now() < tokenExpiry) {
      return refreshAccessToken();
    } else {
      return getAccessToken();
    }
  }
  return accessToken;
}

// Function to send feedback
async function sendFeedback(userInfo: UserInfo, message: string): Promise<ApiResponse> {
  try {
    // Ensure we have a valid token
    const token = await ensureValidToken();

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
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return response;
  } catch (error: any) {
    console.error('Error in sendFeedback:', error.message);
    
    if (error.response && error.response.status === 401) {
      try {
        // Token expired, try to refresh
        await getAccessToken(); // Get new tokens instead of just refreshing
        // Retry the request once
        return sendFeedback(userInfo, message);
      } catch (refreshError) {
        console.error('Failed to refresh token during feedback:', refreshError);
        throw new Error('Authentication failed. Could not send feedback.');
      }
    }
    
    throw error;
  }
}

// Store user feedback state
interface UserFeedbackState {
  awaitingFeedback: boolean;
  messageId?: number;
}

const userFeedbackState = new Map<number, UserFeedbackState>();

// Helper function to safely clear user feedback state
async function clearFeedbackState(ctx: TelegramContext, userId: number): Promise<void> {
  try {
    const state = userFeedbackState.get(userId);
    if (state && state.messageId && ctx.chat) {
      try {
        await ctx.telegram.deleteMessage(ctx.chat.id, state.messageId);
      } catch (err: any) {
        console.log(`Could not delete feedback message: ${err.message}`);
        // Continue even if deletion fails
      }
    }
    userFeedbackState.delete(userId);
  } catch (error: any) {
    console.error('Error clearing feedback state:', error);
    // Continue execution even if this fails
  }
}

// Global error handler
bot.catch((err: Error, ctx: TelegramContext) => {
  console.error(`Error occurred in bot update ${ctx.update?.update_id}:`, err);
  
  // Try to respond to user
  try {
    ctx.reply('Sorry, something went wrong. Please try again later.')
      .catch((replyErr: Error) => {
        console.error('Failed to send error message to user:', replyErr);
      });
  } catch (replyErr) {
    console.error('Failed to handle error gracefully:', replyErr);
  }
});

// Basic commands
bot.command('start', async (ctx: TelegramContext) => {
  try {
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

MUST WATCH THE VIDEO🚀
https://www.loom.com/share/6390d6e0c8804055a57c47df86859310?sid=e3452483-44a5-4320-8469-207a0f830125

Ready to begin your creative journey? Let's make something amazing! ✨`;

    await ctx.reply(welcomeMessage, {
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
  } catch (error: any) {
    console.error('Error in /start command:', error);
    ctx.reply('Sorry, I encountered an error while processing your request. Please try again.').catch(console.error);
  }
});

// Handle callback queries
bot.action('feedback', async (ctx: TelegramContext) => {
  try {
    await ctx.answerCbQuery();
    
    // Clear any existing feedback state for this user
    await clearFeedbackState(ctx, ctx.from.id);
    
    const msg = await ctx.reply('We\'d love to hear from you! Please share your feedback, suggestions, or any issues you\'ve encountered. Your input helps us improve! 🚀\n\nJust type your message and we\'ll receive it.', {
      reply_markup: {
        inline_keyboard: [[
          { text: "❌ Cancel", callback_data: "cancel_feedback" }
        ]]
      }
    });
    
    // Set new feedback state
    userFeedbackState.set(ctx.from.id, {
      awaitingFeedback: true,
      messageId: msg.message_id
    });
  } catch (error: any) {
    console.error('Error handling feedback action:', error);
    ctx.answerCbQuery('Sorry, something went wrong. Please try again.').catch(console.error);
  }
});

// Cancel feedback handler
bot.action('cancel_feedback', async (ctx: TelegramContext) => {
  try {
    await ctx.answerCbQuery('Feedback canceled');
    await clearFeedbackState(ctx, ctx.from.id);
  } catch (error: any) {
    console.error('Error canceling feedback:', error);
    ctx.answerCbQuery('Could not cancel feedback').catch(console.error);
  }
});

// Inspirational quotes
bot.action('get_inspired', async (ctx: TelegramContext) => {
  try {
    await ctx.answerCbQuery();
    const quotes = [
      "Every child is an artist. The problem is how to remain an artist once we grow up. - Pablo Picasso",
      "Creativity takes courage. - Henri Matisse",
      "The only way to do great work is to love what you do. - Steve Jobs"
    ];
    const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];
    await ctx.reply(`💫 Here's some inspiration for you:\n\n${randomQuote}`);
  } catch (error: any) {
    console.error('Error providing inspiration:', error);
    ctx.answerCbQuery('Sorry, something went wrong. Please try again.').catch(console.error);
  }
});

// Help command
bot.command('help', async (ctx: TelegramContext) => {
  try {
    await ctx.reply(
      'Available commands:\n' +
      '/start - Start the bot\n' +
      '/help - Show this help message\n' +
      '/feedback - Share your feedback\n' +
      '/community - Join our community'
    );
  } catch (error: any) {
    console.error('Error in /help command:', error);
    ctx.reply('Sorry, I encountered an error while processing your request. Please try again.').catch(console.error);
  }
});

// Feedback command
bot.command('feedback', async (ctx: TelegramContext) => {
  try {
    // Clear any existing feedback state
    await clearFeedbackState(ctx, ctx.from.id);
    
    const msg = await ctx.reply('We\'d love to hear from you! Please share your feedback, suggestions, or any issues you\'ve encountered. Your input helps us improve! 🚀\n\nJust type your message and we\'ll receive it.', {
      reply_markup: {
        inline_keyboard: [[
          { text: "❌ Cancel", callback_data: "cancel_feedback" }
        ]]
      }
    });
    
    // Set new feedback state
    userFeedbackState.set(ctx.from.id, {
      awaitingFeedback: true,
      messageId: msg.message_id
    });
  } catch (error: any) {
    console.error('Error in /feedback command:', error);
    ctx.reply('Sorry, I encountered an error while processing your request. Please try again.').catch(console.error);
  }
});

// Community command
bot.command('community', async (ctx: TelegramContext) => {
  try {
    await ctx.reply('Join our community on Telegram! 🚀\n\nClick the button below to join:', {
      reply_markup: {
        inline_keyboard: [[
          { text: "Join Createathon", url: "https://t.me/createathon" }
        ]]
      }
    });
  } catch (error: any) {
    console.error('Error in /community command:', error);
    ctx.reply('Sorry, I encountered an error while processing your request. Please try again.').catch(console.error);
  }
});

// Handle all types of messages
bot.on('message', async (ctx: TelegramContext) => {
  try {
    // Check if user is in feedback mode
    const userId = ctx.from.id;
    const feedbackState = userFeedbackState.get(userId);
    
    if (feedbackState && feedbackState.awaitingFeedback) {
      // Handle various message types for feedback
      let feedbackText = '';
      
      if (ctx.message?.text) {
        // Handle text messages
        feedbackText = ctx.message.text;
        
        // Skip command messages
        if (feedbackText.startsWith('/')) {
          return;
        }
      } else if (ctx.message?.caption) {
        // Handle media with caption
        feedbackText = `[Media message with caption]: ${ctx.message.caption}`;
      } else if (ctx.message?.photo) {
        // Handle photos without caption
        feedbackText = '[Photo message without caption]';
      } else if (ctx.message?.video) {
        // Handle videos without caption
        feedbackText = '[Video message without caption]';
      } else if (ctx.message?.document) {
        // Handle documents without caption
        feedbackText = '[Document message without caption]';
      } else if (ctx.message?.voice) {
        // Handle voice without caption
        feedbackText = '[Voice message without caption]';
      } else {
        // Handle other message types
        feedbackText = '[Other message type received]';
      }
      
      // Send feedback
      try {
        await sendFeedback(ctx.from, feedbackText);
        await ctx.reply('Thank you for your feedback! We appreciate your input and will use it to improve our services. 🚀');
      } catch (apiError) {
        console.error('Error sending feedback to API:', apiError);
        await ctx.reply('Sorry, there was an error sending your feedback. Please try again later. 😔');
      }
      
      // Clean up feedback state
      await clearFeedbackState(ctx, userId);
    }
    // Ignore messages that aren't feedback and aren't commands
  } catch (error: any) {
    console.error('Error handling message:', error);
    // Only reply with error if it's severe, to avoid spam
    if (error.message !== 'Cannot read properties of undefined') {
      ctx.reply('Sorry, something went wrong while processing your message.').catch(console.error);
    }
  }
});

// Initialize access token on startup
getAccessToken()
  .then(() => {
    console.log('Successfully obtained initial access token');
  })
  .catch((error: Error) => {
    console.error('Failed to get initial access token:', error);
    console.log('Bot will attempt to get token again when needed');
  });

// Bot launch with error handling
bot.launch()
  .then(() => {
    console.log('Bot is running...');
  })
  .catch((error: Error) => {
    console.error('Failed to start bot:', error);
    process.exit(1);
  });

// Enable graceful stop
process.once('SIGINT', () => {
  console.log('SIGINT received. Shutting down bot...');
  bot.stop('SIGINT');
});

process.once('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down bot...');
  bot.stop('SIGTERM');
});

// Handle uncaught exceptions
process.on('uncaughtException', (error: Error) => {
  console.error('Uncaught exception:', error);
  // Keep the process running despite uncaught exceptions
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  console.error('Unhandled promise rejection:', reason);
  // Keep the process running despite unhandled rejections
});