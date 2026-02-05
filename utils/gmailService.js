const { google } = require('googleapis');
const EmailNotification = require('../models/EmailNotification');

class GmailService {
    constructor(userId, tokens) {
        this.userId = userId;
        this.tokens = tokens;
        this.oAuth2Client = null;
        this.gmail = null;
    }

    initialize() {
        this.oAuth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            process.env.GOOGLE_REDIRECT_URI
        );

        this.oAuth2Client.setCredentials(this.tokens);
        this.gmail = google.gmail({ version: 'v1', auth: this.oAuth2Client });
    }

    async getUnreadEmails() {
        try {
            this.initialize();

            // Get list of unread messages
            const response = await this.gmail.users.messages.list({
                userId: 'me',
                q: 'is:unread',
                maxResults: 50
            });

            const messages = response.data.messages || [];
            console.log(`📧 Found ${messages.length} unread emails`);

            // Process each message
            for (const message of messages) {
                await this.processMessage(message.id);
            }

            return {
                success: true,
                count: messages.length,
                message: `Processed ${messages.length} emails`
            };
        } catch (error) {
            console.error('Gmail API error:', error);
            throw error;
        }
    }

    async processMessage(messageId) {
        try {
            // Get full message details
            const message = await this.gmail.users.messages.get({
                userId: 'me',
                id: messageId,
                format: 'metadata',
                metadataHeaders: ['Subject', 'From', 'Date']
            });

            const headers = message.data.payload.headers;
            const subject = headers.find(h => h.name === 'Subject')?.value || 'No Subject';
            const from = headers.find(h => h.name === 'From')?.value || 'Unknown';
            const date = headers.find(h => h.name === 'Date')?.value || new Date();

            // Extract email from "From" header
            const fromEmail = this.extractEmail(from);
            const fromName = this.extractName(from);

            // Categorize email
            const category = this.categorizeEmail(subject, fromEmail);
            const priority = this.determinePriority(subject, category);

            // Check if email already exists
            const existing = await EmailNotification.findOne({
                userId: this.userId,
                'emailId': messageId
            });

            if (!existing) {
                // Save to database
                const emailNotification = new EmailNotification({
                    userId: this.userId,
                    emailId: messageId,
                    subject: subject,
                    from: {
                        name: fromName,
                        email: fromEmail
                    },
                    date: new Date(date),
                    category: category,
                    priority: priority,
                    snippet: message.data.snippet || '',
                    isRead: false,
                    isArchived: false
                });

                await emailNotification.save();
                console.log(`✅ Saved: ${subject}`);
            }

            // Mark as read in Gmail
            await this.gmail.users.messages.modify({
                userId: 'me',
                id: messageId,
                requestBody: {
                    removeLabelIds: ['UNREAD']
                }
            });

        } catch (error) {
            console.error(`Error processing message ${messageId}:`, error);
        }
    }

    extractEmail(fromHeader) {
        const emailMatch = fromHeader.match(/<([^>]+)>/);
        if (emailMatch) return emailMatch[1];

        // If no brackets, try to extract email
        const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
        const match = fromHeader.match(emailRegex);
        return match ? match[0] : fromHeader;
    }

    extractName(fromHeader) {
        const nameMatch = fromHeader.match(/"([^"]+)"|<([^>]+)>/);
        if (nameMatch && nameMatch[1]) return nameMatch[1];

        // Extract name before email
        const emailIndex = fromHeader.indexOf('<');
        if (emailIndex > 0) {
            return fromHeader.substring(0, emailIndex).trim();
        }

        return fromHeader.split('@')[0]; // Fallback to username
    }

    categorizeEmail(subject, fromEmail) {
        const subjectLower = subject.toLowerCase();
        const fromLower = fromEmail.toLowerCase();

        // EXCLUDE unwanted senders first
        const excludeKeywords = [
            'instagram', 'facebook', 'twitter', 'youtube', 'netflix',
            'amazon', 'flipkart', 'myntra', 'whatsapp', 'telegram',
            'spam', 'promotion', 'newsletter', 'notification',
            'alert', 'update', 'security', 'verification'
        ];

        // If from unwanted sender, categorize as 'other'
        if (excludeKeywords.some(keyword =>
            fromLower.includes(keyword) || subjectLower.includes(keyword)
        )) {
            return 'other';
        }

        // Job/Internship keywords (existing logic)
        const jobKeywords = ['hiring', 'career', 'job', 'position', 'opening', 'vacancy', 'recruitment', 'apply now', 'application'];
        const internshipKeywords = ['internship', 'intern', 'summer training', 'training program', 'trainee'];
        const hackathonKeywords = ['hackathon', 'coding competition', 'codefest', 'techfest', 'programming contest'];
        const collegeKeywords = ['college', 'university', 'campus', 'academic', 'dean', 'department', 'iit', 'nit', 'result', 'exam', 'semester'];

        // Check categories (existing logic continues...)
        if (jobKeywords.some(keyword => subjectLower.includes(keyword))) {
            return 'job';
        }
        if (internshipKeywords.some(keyword => subjectLower.includes(keyword))) {
            return 'internship';
        }
        if (hackathonKeywords.some(keyword => subjectLower.includes(keyword))) {
            return 'hackathon';
        }
        if (collegeKeywords.some(keyword => subjectLower.includes(keyword)) ||
            fromLower.includes('.edu') ||
            fromLower.includes('ac.in')) {
            return 'college';
        }

        return 'other';
    }

    determinePriority(subject, category) {
        const subjectLower = subject.toLowerCase();

        // High priority keywords
        const highPriority = ['urgent', 'important', 'deadline', 'final', 'last date', 'immediate', 'action required'];

        // Medium priority keywords
        const mediumPriority = ['opportunity', 'invitation', 'announcement', 'update', 'notification'];

        if (highPriority.some(keyword => subjectLower.includes(keyword))) {
            return 'high';
        }
        if (mediumPriority.some(keyword => subjectLower.includes(keyword))) {
            return 'medium';
        }
        if (category === 'job' || category === 'internship') {
            return 'medium';
        }

        return 'low';
    }

    async refreshAccessToken() {
        try {
            const { tokens } = await this.oAuth2Client.refreshAccessToken();
            this.tokens = tokens;
            this.oAuth2Client.setCredentials(tokens);
            return tokens;
        } catch (error) {
            console.error('Error refreshing token:', error);
            throw error;
        }
    }
}

module.exports = GmailService;