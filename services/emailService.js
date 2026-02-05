// services/emailService.js
const Imap = require('imap');
const { simpleParser } = require('mailparser');
const dotenv = require('dotenv');
const EmailNotification = require('../models/EmailNotification');
const EmailParser = require('../utils/emailParser');

dotenv.config();

class EmailService {
    constructor(userId, emailConfig) {
        this.userId = userId;
        this.config = emailConfig || {
            user: process.env.EMAIL_USER,
            password: process.env.EMAIL_PASSWORD,
            host: process.env.EMAIL_HOST || 'imap.gmail.com',
            port: process.env.EMAIL_PORT || 993,
            tls: true,
            tlsOptions: { rejectUnauthorized: false }
        };
        this.imap = null;
        this.isConnected = false;
    }
    
    async connect() {
        return new Promise((resolve, reject) => {
            this.imap = new Imap(this.config);
            
            this.imap.once('ready', () => {
                this.isConnected = true;
                console.log(`✅ Email connected for user: ${this.userId}`);
                resolve();
            });
            
            this.imap.once('error', (err) => {
                console.error('❌ IMAP error:', err);
                reject(err);
            });
            
            this.imap.once('end', () => {
                this.isConnected = false;
                console.log('📧 IMAP connection ended');
            });
            
            this.imap.connect();
        });
    }
    
    async disconnect() {
        if (this.imap && this.isConnected) {
            this.imap.end();
            this.isConnected = false;
        }
    }
    
    async fetchRecentEmails(days = 7) {
        return new Promise((resolve, reject) => {
            if (!this.isConnected) {
                reject(new Error('Not connected to email server'));
                return;
            }
            
            const sinceDate = new Date();
            sinceDate.setDate(sinceDate.getDate() - days);
            
            this.imap.openBox('INBOX', true, (err, box) => {
                if (err) {
                    reject(err);
                    return;
                }
                
                // Search for emails from last X days
                this.imap.search([
                    'UNSEEN',
                    ['SINCE', sinceDate.toISOString().split('T')[0]]
                ], (err, results) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    
                    if (!results || results.length === 0) {
                        resolve([]);
                        return;
                    }
                    
                    console.log(`📨 Found ${results.length} new emails`);
                    
                    const emails = [];
                    const fetch = this.imap.fetch(results, {
                        bodies: '',
                        struct: true,
                        markSeen: false // Don't mark as read automatically
                    });
                    
                    fetch.on('message', (msg) => {
                        msg.on('body', async (stream) => {
                            try {
                                const parsed = await simpleParser(stream);
                                emails.push(parsed);
                            } catch (parseErr) {
                                console.error('Error parsing email:', parseErr);
                            }
                        });
                    });
                    
                    fetch.once('error', (fetchErr) => {
                        reject(fetchErr);
                    });
                    
                    fetch.once('end', () => {
                        console.log('✅ Finished fetching emails');
                        resolve(emails);
                    });
                });
            });
        });
    }
    
    async processAndSaveEmails(emails) {
        const savedEmails = [];
        const keywords = process.env.KEYWORDS?.split(',') || [
            'job', 'internship', 'hackathon', 'opportunity', 'placement',
            'campus', 'recruitment', 'interview', 'workshop', 'seminar'
        ];
        
        for (const email of emails) {
            try {
                // Check if email contains important keywords
                const content = (email.subject + ' ' + email.text).toLowerCase();
                const hasImportantKeyword = keywords.some(keyword => 
                    content.includes(keyword.toLowerCase())
                );
                
                if (!hasImportantKeyword) {
                    continue; // Skip non-important emails
                }
                
                // Parse and extract information
                const parsedSubject = EmailParser.parseSubject(email.subject);
                const parsedBody = EmailParser.parseHtmlBody(email.html || email.text);
                const metadata = EmailParser.extractMetadata({
                    subject: email.subject,
                    body: parsedBody,
                    from: email.from
                });
                
                // Create email notification
                const emailNotification = new EmailNotification({
                    userId: this.userId,
                    emailId: email.messageId || Date.now().toString(),
                    from: {
                        name: email.from?.text || '',
                        email: email.from?.value?.[0]?.address || ''
                    },
                    subject: parsedSubject,
                    snippet: parsedBody.substring(0, 200),
                    body: parsedBody,
                    date: email.date || new Date(),
                    category: this.determineCategory(content),
                    priority: this.determinePriority(content),
                    hasAttachment: email.attachments.length > 0,
                    attachments: email.attachments.map(att => ({
                        filename: att.filename,
                        contentType: att.contentType,
                        size: att.size
                    })),
                    company: metadata.get('company') || '',
                    position: metadata.get('position') || '',
                    deadline: metadata.get('deadline') ? new Date(metadata.get('deadline')) : null,
                    location: metadata.get('location') || '',
                    stipend: metadata.get('stipend') || '',
                    hackathonName: metadata.get('hackathon_name') || '',
                    prize: metadata.get('prize') || '',
                    metadata: metadata
                });
                
                // Auto-tag
                emailNotification.autoTag();
                
                // Save to database (avoid duplicates)
                const existing = await EmailNotification.findOne({
                    userId: this.userId,
                    emailId: emailNotification.emailId
                });
                
                if (!existing) {
                    await emailNotification.save();
                    savedEmails.push(emailNotification);
                    console.log(`💾 Saved email: ${parsedSubject}`);
                }
                
            } catch (error) {
                console.error('Error processing email:', error);
            }
        }
        
        return savedEmails;
    }
    
    determineCategory(content) {
        content = content.toLowerCase();
        
        if (content.includes('job') || content.includes('career') || content.includes('hiring')) {
            return 'job';
        } else if (content.includes('internship') || content.includes('intern')) {
            return 'internship';
        } else if (content.includes('hackathon') || content.includes('coding competition')) {
            return 'hackathon';
        } else if (content.includes('college') || content.includes('university') || 
                   content.includes('campus') || content.includes('exam')) {
            return 'college';
        } else if (content.includes('important') || content.includes('urgent')) {
            return 'important';
        }
        
        return 'other';
    }
    
    determinePriority(content) {
        content = content.toLowerCase();
        
        if (content.includes('urgent') || content.includes('immediate') || 
            content.includes('today') || content.includes('deadline today')) {
            return 'critical';
        } else if (content.includes('important') || content.includes('deadline') || 
                   content.includes('last date')) {
            return 'high';
        } else if (content.includes('opportunity') || content.includes('apply') || 
                   content.includes('recruitment')) {
            return 'medium';
        }
        
        return 'low';
    }
    
    async syncEmails() {
        try {
            await this.connect();
            const emails = await this.fetchRecentEmails(7); // Last 7 days
            const saved = await this.processAndSaveEmails(emails);
            await this.disconnect();
            
            return {
                success: true,
                totalFetched: emails.length,
                saved: saved.length,
                emails: saved
            };
        } catch (error) {
            console.error('❌ Error syncing emails:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

// Email Scheduler Service
class EmailScheduler {
    constructor() {
        this.intervals = new Map();
    }
    
    async startSyncForUser(userId, emailConfig, intervalMinutes = 30) {
        try {
            const emailService = new EmailService(userId, emailConfig);
            
            // Initial sync
            console.log(`🔄 Starting email sync for user: ${userId}`);
            await emailService.syncEmails();
            
            // Schedule periodic sync
            const interval = setInterval(async () => {
                console.log(`🔄 Periodic sync for user: ${userId}`);
                await emailService.syncEmails();
            }, intervalMinutes * 60 * 1000);
            
            this.intervals.set(userId, interval);
            
            return { success: true };
        } catch (error) {
            console.error(`❌ Failed to start email sync for user ${userId}:`, error);
            return { success: false, error: error.message };
        }
    }
    
    stopSyncForUser(userId) {
        const interval = this.intervals.get(userId);
        if (interval) {
            clearInterval(interval);
            this.intervals.delete(userId);
            console.log(`⏹️ Stopped email sync for user: ${userId}`);
        }
    }
    
    stopAll() {
        this.intervals.forEach((interval, userId) => {
            clearInterval(interval);
            console.log(`⏹️ Stopped email sync for user: ${userId}`);
        });
        this.intervals.clear();
    }
}

module.exports = {
    EmailService,
    EmailScheduler
};