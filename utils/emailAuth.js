const { google } = require('googleapis');
const nodemailer = require('nodemailer');

// OAuth2 configuration
const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/email/auth/callback'
);

// Generate auth URL
const getAuthUrl = () => {
    const scopes = [
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.modify'
    ];
    
    return oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: scopes,
        prompt: 'consent'
    });
};

// Get tokens from code
const getTokens = async (code) => {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    return tokens;
};

// Create transporter
const createTransporter = async (accessToken, refreshToken) => {
    oauth2Client.setCredentials({
        access_token: accessToken,
        refresh_token: refreshToken
    });
    
    return nodemailer.createTransport({
        service: 'gmail',
        auth: {
            type: 'OAuth2',
            user: process.env.GOOGLE_USER,
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            refreshToken: refreshToken,
            accessToken: accessToken
        }
    });
};

module.exports = {
    getAuthUrl,
    getTokens,
    createTransporter
};