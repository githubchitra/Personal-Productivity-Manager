// services/smartEmailService.js
const Imap = require('imap');
const { simpleParser } = require('mailparser');
const smartFiltering = require('../utils/smartFiltering');
const EmailNotification = require('../models/EmailNotification');
const PushNotificationService = require('./pushNotificationService');
const { google } = require('googleapis');

class SmartEmailConnector {
    constructor(userId, config) {
        this.userId = userId;
        this.config = config || {};
        this.imap = null;
        this.gmail = null;
        this.type = this.config.type || 'imap'; // 'imap' or 'gmail_oauth'
        this.isConnected = false;
        this.lastSyncError = null;
    }

    /**
     * Set up Gmail OAuth connection
     */
    async initializeGmailOAuth() {
        try {
            const oAuth2Client = new google.auth.OAuth2(
                process.env.GOOGLE_CLIENT_ID,
                process.env.GOOGLE_CLIENT_SECRET,
                process.env.GOOGLE_REDIRECT_URI
            );
            oAuth2Client.setCredentials(this.config.tokens);
            this.gmail = google.gmail({ version: 'v1', auth: oAuth2Client });
            this.isConnected = true;
            return true;
        } catch (error) {
            console.error('❌ Gmail OAuth Initialization Error:', error);
            this.lastSyncError = error.message;
            return false;
        }
    }

    /**
     * Connect to IMAP server with better error handling
     */
    async connectIMAP() {
        return new Promise((resolve, reject) => {
            try {
                const imapConfig = {
                    user: this.config.user || process.env.EMAIL_USER,
                    password: this.config.password || process.env.EMAIL_PASSWORD,
                    host: this.config.host || process.env.EMAIL_HOST || 'imap.gmail.com',
                    port: this.config.port || process.env.EMAIL_PORT || 993,
                    tls: true,
                    tlsOptions: { rejectUnauthorized: false },
                    connTimeout: 10000,
                    authTimeout: 5000
                };

                this.imap = new Imap(imapConfig);

                this.imap.once('ready', () => {
                    this.isConnected = true;
                    console.log(`✅ Smart Connection Ready for ${this.userId}`);
                    resolve(true);
                });

                this.imap.once('error', (err) => {
                    this.isConnected = false;
                    this.lastSyncError = err.message;
                    console.error('❌ Connection Error:', err);
                    reject(err);
                });

                this.imap.once('end', () => {
                    this.isConnected = false;
                    console.log('📧 Connection Closed');
                });

                this.imap.connect();
            } catch (err) {
                this.lastSyncError = err.message;
                reject(err);
            }
        });
    }

    /**
     * Backup Notification System: triggered if primary connection fails
     */
    async triggerBackupNotification(reason) {
        console.warn(`📢 ALERT: Primary email connection failed for ${this.userId}. Triggering Backup System.`);
        console.warn(`Reason: ${reason}`);

        // This is a placeholder for a real backup system (e.g. SMS, Telegram, Browser Push)
        // Here we'll create a special notification record to inform the user.
        try {
            const backupNotice = new EmailNotification({
                userId: this.userId,
                emailId: `BACKUP_SYS_${Date.now()}`,
                from: { name: 'SYSTEM_BACKUP', email: 'notifier@system.com' },
                subject: '🚨 URGENT: Email Connection Failed',
                snippet: `Your primary email connection is failing. Reason: ${reason}. Please update your credentials or check App Passwords.`,
                body: `Detailed Error: ${reason}`,
                date: new Date(),
                category: 'important',
                priority: 'critical'
            });
            await backupNotice.save();
        } catch (err) {
            console.error('Failed to save backup notification:', err);
        }
    }

    /**
     * Unified fetch and process logic
     */
    async sync(unreadOnly = true) {
        try {
            if (this.type === 'gmail_oauth') {
                await this.initializeGmailOAuth();
                return await this.syncGmail(unreadOnly);
            } else {
                await this.connectIMAP();
                return await this.syncIMAP();
            }
        } catch (error) {
            console.error(`❌ Sync Failed for ${this.userId}:`, error.message);
            await this.triggerBackupNotification(error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * IMAP implementation for fetching and smart processing
     */
    async syncIMAP() {
        return new Promise((resolve, reject) => {
            const sinceDate = new Date();
            sinceDate.setDate(sinceDate.getDate() - 2); // Last 48 hours for speed

            this.imap.openBox('INBOX', true, (err, box) => {
                if (err) return reject(err);

                this.imap.search(['UNSEEN', ['SINCE', sinceDate.toISOString().split('T')[0]]], (err, results) => {
                    if (err) return reject(err);
                    if (!results || results.length === 0) {
                        this.imap.end();
                        return resolve({ success: true, count: 0 });
                    }

                    const fetch = this.imap.fetch(results, { bodies: '', markSeen: false });
                    let processed = 0;

                    fetch.on('message', (msg) => {
                        msg.on('body', async (stream) => {
                            try {
                                const parsed = await simpleParser(stream);
                                await this.processSmartly(parsed, parsed.messageId || `IMAP_${Date.now()}_${processed++}`);
                            } catch (e) {
                                console.error('Error in IMAP parse:', e);
                            }
                        });
                    });

                    fetch.on('end', () => {
                        this.imap.end();
                        resolve({ success: true, count: results.length });
                    });
                });
            });
        });
    }

    /**
     * Gmail OAuth implementation for fetching and smart processing
     */
    async syncGmail(unreadOnly = true) {
        try {
            const query = `${unreadOnly ? 'is:unread ' : ''}subject:(job OR jobs OR internship OR internships OR hackathon OR college OR placement OR career)`;
            const response = await this.gmail.users.messages.list({
                userId: 'me',
                q: query,
                maxResults: 20
            });

            const messages = response.data.messages || [];
            for (const msg of messages) {
                const fullMsg = await this.gmail.users.messages.get({
                    userId: 'me',
                    id: msg.id,
                    format: 'full'
                });

                // Extract basics
                const headers = fullMsg.data.payload.headers;
                const subject = headers.find(h => h.name === 'Subject')?.value || '';
                const fromHeader = headers.find(h => h.name === 'From')?.value || '';
                const date = headers.find(h => h.name === 'Date')?.value || new Date();

                // Get body
                let body = fullMsg.data.snippet || '';
                // Simple body extraction (deep nesting ignored for brevity in this implemention)

                const emailObj = {
                    subject,
                    body,
                    from: {
                        name: fromHeader.split('<')[0].trim(),
                        email: fromHeader.match(/<([^>]+)>/)?.[1] || fromHeader
                    },
                    date: new Date(date)
                };

                await this.processSmartly(emailObj, msg.id);
            }
            return { success: true, count: messages.length };
        } catch (error) {
            throw error;
        }
    }

    /**
     * The processing core: uses SmartFiltering and saves to DB
     */
    async processSmartly(email, messageId) {
        try {
            // Check if already processed
            const existing = await EmailNotification.findOne({ userId: this.userId, emailId: messageId });
            if (existing) return;

            // Apply Smart Filtering
            const { category, priority, isVerified, extractedData } = smartFiltering.extractInfo(email);

            // STRICT FILTER: Only allow specific keywords in subject as requested by user
            const subjectLower = email.subject.toLowerCase();
            const allowedKeywords = ['job', 'jobs', 'internship', 'internships', 'hackathon', 'college', 'placement', 'career'];
            const hasRequiredKeyword = allowedKeywords.some(keyword => subjectLower.includes(keyword));

            if (!hasRequiredKeyword) {
                console.log(`⏩ Skipping (No subject match): ${email.subject}`);
                return;
            }

            // Skip 'other' if we want to be strict
            if (category === 'other' && priority === 'low') {
                return; // Silence irrelevant notifications
            }

            const notification = new EmailNotification({
                userId: this.userId,
                emailId: messageId,
                from: email.from,
                subject: email.subject,
                body: email.body,
                snippet: email.body.substring(0, 150),
                date: email.date || new Date(),
                category: category,
                priority: priority,
                tags: [category, isVerified ? 'verified' : 'unknown'],
                metadata: extractedData
            });

            await notification.save();
            console.log(`✨ Smart Saved: [${category.toUpperCase()}] ${email.subject}`);

            // Integrate Real Push Notification logic
            await PushNotificationService.send(this.userId, notification);
        } catch (err) {
            console.error('Processing error:', err);
        }
    }
}

module.exports = SmartEmailConnector;
