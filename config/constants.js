/**
 * Centralized Configuration and Constants
 */

module.exports = {
    PORT: process.env.PORT || 3000,
    NODE_ENV: process.env.NODE_ENV || 'development',
    MONGODB_URI: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/college-portal',
    SESSION_SECRET: process.env.SESSION_SECRET || 'college-portal-default-secret-ensure-you-change-this',

    GOOGLE: {
        CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
        CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
        REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI || "http://localhost:3000/auth/google/callback",
        GMAIL_REDIRECT_URI: process.env.GMAIL_REDIRECT_URI || 'http://localhost:3000/email/auth/callback'
    },

    ATTENDANCE: {
        THRESHOLD: 75,
        RISK_MARGIN: 10
    },

    SECURITY: {
        BCRYPT_ROUNDS: 10,
        RATE_LIMIT_WINDOW: 15 * 60 * 1000, // 15 minutes
        RATE_LIMIT_MAX: 100 // limit each IP to 100 requests per windowMs
    }
};
