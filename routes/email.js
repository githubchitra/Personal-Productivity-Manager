const express = require('express');
const router = express.Router();
const { google } = require('googleapis');
const EmailNotification = require('../models/EmailNotification');
const GmailService = require('../utils/gmailService');
const { EmailService } = require('../services/emailService');
const SmartEmailConnector = require('../services/smartEmailService');

const { isAuthenticated } = require('../middlewares/auth');
const constants = require('../config/constants');

router.use(isAuthenticated);

const gmailRedirectUri = constants.GOOGLE.GMAIL_REDIRECT_URI;

const oAuth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    gmailRedirectUri
);

// Email Routes Configuration

// Get email notifications
router.get('/', async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { category, priority, page = 1, limit = 20, unread } = req.query;

        let query = { userId, isArchived: false };

        if (category && category !== 'all') {
            query.category = category;
        }

        if (priority && priority !== 'all') {
            query.priority = priority;
        }

        if (unread === 'true') {
            query.isRead = false;
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const [notifications, total, unreadCount] = await Promise.all([
            EmailNotification.find(query)
                .sort({ date: -1, priority: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .lean(),
            EmailNotification.countDocuments(query),
            EmailNotification.countDocuments({ userId, isRead: false })
        ]);

        // Get counts by category
        const categoryCounts = await EmailNotification.aggregate([
            { $match: { userId, isArchived: false } },
            { $group: { _id: '$category', count: { $sum: 1 } } }
        ]);

        // Get today's important emails
        const todayImportant = await EmailNotification.getTodayImportant(userId);

        // Check if user has connected Gmail
        const hasGmailConnection = req.session.user.gmailTokens ? true : false;

        res.render('email/index', {
            title: 'Email Notifications',
            activeTab: 'email',
            user: req.session.user,
            notifications,
            stats: {
                total,
                unread: unreadCount,
                byCategory: categoryCounts.reduce((acc, curr) => {
                    acc[curr._id] = curr.count;
                    return acc;
                }, {}),
                todayImportant: todayImportant.length
            },
            filters: {
                category: category || 'all',
                priority: priority || 'all',
                unread: unread === 'true',
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(total / parseInt(limit))
            },
            hasGmailConnection
        });
    } catch (error) {
        console.error('Error loading email notifications:', error);
        res.render('error', {
            title: 'Error',
            error: 'Failed to load email notifications'
        });
    }
});

// Connect email account - Shows OAuth options
router.get('/connect', (req, res) => {
    // Generate Google OAuth URL
    const authUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: [
            'https://www.googleapis.com/auth/userinfo.profile',
            'https://www.googleapis.com/auth/userinfo.email',
            'https://www.googleapis.com/auth/gmail.readonly'
        ],
        prompt: 'consent select_account',
        include_granted_scopes: true
    });

    res.render('email/connect', {
        title: 'Connect Email',
        activeTab: 'email',
        user: req.session.user,
        googleAuthUrl: authUrl
    });
});

// Google OAuth callback
router.get('/auth/callback', async (req, res) => {
    try {
        const { code } = req.query;
        const userId = req.session?.user?.id || req.session?.user?._id;

        if (!userId) {
            console.error('❌ User session lost during Gmail OAuth callback');
            req.session.error = 'Session expired. Please log in again.';
            return res.redirect('/login');
        }

        if (!code) {
            throw new Error('No authorization code received');
        }

        console.log('📨 Received OAuth code, exchanging for tokens...');

        // Exchange code for tokens
        const { tokens } = await oAuth2Client.getToken(code);

        // Store tokens in session
        req.session.user.gmailTokens = tokens;

        // Test connection
        const gmailService = new GmailService(userId, tokens);

        // Fetch initial emails
        const result = await gmailService.getUnreadEmails();

        console.log('✅ Gmail connected successfully!');

        req.session.success = result.count > 0
            ? `Connected to Gmail! Found ${result.count} new emails.`
            : 'Connected to Gmail! No new emails found.';

        res.redirect('/email');

    } catch (error) {
        console.error('OAuth callback error:', error);
        req.session.error = 'Failed to connect Gmail. Please try again.';
        res.redirect('/email/connect');
    }
});

// Manual sync emails
router.post('/sync', async (req, res) => {
    try {
        const userId = req.session.user.id;
        const tokens = req.session.user.gmailTokens;

        if (!tokens) {
            return res.status(400).json({
                success: false,
                message: 'No Gmail account connected. Please connect first.'
            });
        }

        // Use the new SmartEmailConnector for more robust sync and filtering
        const connector = new SmartEmailConnector(userId, { type: 'gmail_oauth', tokens });
        const result = await connector.sync();

        res.json({
            success: true,
            message: `Synced ${result.count} new emails`,
            count: result.count
        });

    } catch (error) {
        console.error('Sync error:', error);

        // If token expired, try to refresh
        if (error.message.includes('invalid_grant') || error.message.includes('token expired')) {
            try {
                const gmailService = new GmailService(userId, req.session.user.gmailTokens);
                const newTokens = await gmailService.refreshAccessToken();
                req.session.user.gmailTokens = newTokens;

                // Retry sync
                const gmailService2 = new GmailService(userId, newTokens);
                const result = await gmailService2.getUnreadEmails();

                return res.json({
                    success: true,
                    message: `Synced ${result.count} new emails (token refreshed)`,
                    count: result.count
                });
            } catch (refreshError) {
                // Need to re-authenticate
                req.session.user.gmailTokens = null;
                return res.status(401).json({
                    success: false,
                    message: 'Session expired. Please reconnect your Gmail.',
                    needsReauth: true
                });
            }
        }

        res.status(500).json({
            success: false,
            message: 'Failed to sync emails'
        });
    }
});

// Disconnect Gmail
router.post('/disconnect', async (req, res) => {
    try {
        const userId = req.session.user.id;

        // Clear tokens from session
        if (req.session.user.gmailTokens) {
            delete req.session.user.gmailTokens;
        }

        // Optionally: Clear stored emails from database
        // await EmailNotification.deleteMany({ userId });

        res.json({
            success: true,
            message: 'Gmail disconnected successfully'
        });

    } catch (error) {
        console.error('Disconnect error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to disconnect Gmail'
        });
    }
});

// Auto-sync endpoint (for cron jobs)
router.post('/auto-sync', async (req, res) => {
    try {
        const { userId, tokens, apiKey } = req.body;

        if (apiKey !== process.env.INTERNAL_API_KEY) {
            return res.status(403).json({ success: false, message: 'Forbidden: Invalid API Key' });
        }

        if (!userId || !tokens) {
            return res.status(400).json({ success: false, message: 'Missing parameters' });
        }

        const gmailService = new GmailService(userId, tokens);
        const result = await gmailService.getUnreadEmails();

        res.json({
            success: true,
            message: `Auto-synced ${result.count} emails`,
            timestamp: new Date()
        });

    } catch (error) {
        console.error('Auto-sync error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

router.post('/test-connection', async (req, res) => {
    try {
        const { email, password, provider } = req.body;

        // Validate input
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email and password are required'
            });
        }

        // Determine IMAP settings based on provider
        let host, port;
        switch (provider) {
            case 'gmail':
                host = 'imap.gmail.com';
                port = 993;
                break;
            case 'outlook':
                host = 'outlook.office365.com';
                port = 993;
                break;
            case 'yahoo':
                host = 'imap.mail.yahoo.com';
                port = 993;
                break;
            default:
                return res.status(400).json({
                    success: false,
                    message: 'Invalid email provider'
                });
        }

        // For development: Accept self-signed certificates
        const tlsOptions = process.env.NODE_ENV === 'production' ? {} : {
            rejectUnauthorized: false
        };

        // Test connection with better error handling
        const testService = new EmailService('test', {
            user: email,
            password: password,
            host: host,
            port: port,
            tls: true,
            tlsOptions: tlsOptions,
            authTimeout: 10000, // 10 seconds timeout
            connTimeout: 30000  // 30 seconds connection timeout
        });

        let connectionResult;
        try {
            console.log(`Testing connection to ${email} via ${host}:${port}`);
            connectionResult = await testService.connect();
            await testService.disconnect();

            return res.json({
                success: true,
                message: 'Connection successful! Email server is reachable.',
                provider: provider
            });

        } catch (connectError) {
            console.error('Connection test failed:', connectError.message);

            // Provide more user-friendly error messages
            let errorMessage = 'Failed to connect to email server. ';

            if (connectError.code === 'ECONNREFUSED') {
                errorMessage += 'Connection refused. Please check if IMAP is enabled for your email account.';
            } else if (connectError.code === 'ETIMEDOUT') {
                errorMessage += 'Connection timed out. Please check your internet connection.';
            } else if (connectError.code === 'DEPTH_ZERO_SELF_SIGNED_CERT') {
                errorMessage += 'SSL certificate error. In development, you can bypass this by enabling "Allow less secure apps" in your email settings.';
            } else if (connectError.source === 'authentication') {
                errorMessage += 'Authentication failed. Please check your email and password.';
            } else {
                errorMessage += 'Please check your credentials and try again.';
            }

            // For Gmail specific errors
            if (provider === 'gmail' && connectError.source === 'authentication') {
                errorMessage += ' Note: For Gmail, you may need to: 1) Enable IMAP in Gmail settings, 2) Use an App Password if 2FA is enabled, 3) Allow less secure apps.';
            }

            return res.status(400).json({
                success: false,
                message: errorMessage,
                debug: process.env.NODE_ENV === 'development' ? connectError.message : undefined
            });
        }

    } catch (error) {
        console.error('Error testing email connection:', error);
        res.status(500).json({
            success: false,
            message: 'An unexpected error occurred while testing the connection.'
        });
    }
});

router.post('/connect', async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { email, password, provider, syncInterval } = req.body;

        // Validate input
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email and password are required'
            });
        }

        // Determine IMAP settings based on provider
        let host, port;
        switch (provider) {
            case 'gmail':
                host = 'imap.gmail.com';
                port = 993;
                break;
            case 'outlook':
                host = 'outlook.office365.com';
                port = 993;
                break;
            case 'yahoo':
                host = 'imap.mail.yahoo.com';
                port = 993;
                break;
            default:
                return res.status(400).json({
                    success: false,
                    message: 'Invalid email provider'
                });
        }

        // For development: Accept self-signed certificates
        const tlsOptions = process.env.NODE_ENV === 'production' ? {} : {
            rejectUnauthorized: false
        };

        // Test connection first
        const testService = new EmailService('test', {
            user: email,
            password: password,
            host: host,
            port: port,
            tls: true,
            tlsOptions: tlsOptions,
            authTimeout: 10000,
            connTimeout: 30000
        });

        try {
            console.log(`Connecting ${email} to ${host}:${port}`);
            await testService.connect();
            await testService.disconnect();
            console.log('Connection test passed');
        } catch (connectError) {
            console.error('Connection test failed:', connectError.message);

            let errorMessage = 'Failed to connect to email server. ';
            if (connectError.source === 'authentication') {
                errorMessage += 'Authentication failed. Please check your credentials.';
            } else if (connectError.code === 'DEPTH_ZERO_SELF_SIGNED_CERT') {
                errorMessage += 'SSL certificate error. Trying to continue anyway...';
                // We'll continue even with SSL errors in development
                if (process.env.NODE_ENV === 'production') {
                    return res.status(400).json({
                        success: false,
                        message: 'SSL certificate error. Please contact support.'
                    });
                }
            } else {
                return res.status(400).json({
                    success: false,
                    message: 'Failed to connect to email server. Please check your credentials and try again.'
                });
            }
        }

        // Save email config to user session
        req.session.user.emailConfig = {
            email: email,
            password: password,
            host: host,
            port: port,
            provider: provider,
            tlsOptions: tlsOptions
        };

        // Save to database if you have a User model
        try {
            // If you have a User model, save the config there
            // const User = require('../models/User');
            // await User.findByIdAndUpdate(userId, {
            //     emailConfig: req.session.user.emailConfig
            // });
        } catch (dbError) {
            console.error('Error saving email config to database:', dbError);
            // Continue anyway - config is in session
        }

        // Start syncing with error handling
        try {
            const result = await emailScheduler.startSyncForUser(
                userId,
                req.session.user.emailConfig,
                parseInt(syncInterval) || 30
            );

            if (result.success) {
                res.json({
                    success: true,
                    message: 'Email account connected successfully! Syncing will start shortly.'
                });
            } else {
                throw new Error(result.error || 'Failed to start email sync');
            }
        } catch (syncError) {
            console.error('Error starting email sync:', syncError);
            res.status(500).json({
                success: false,
                message: 'Connected to email server, but failed to start syncing. Please try again.'
            });
        }

    } catch (error) {
        console.error('Error connecting email:', error);
        res.status(500).json({
            success: false,
            message: 'An unexpected error occurred while connecting your email account.'
        });
    }
});

router.post('/connect/mock', async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { provider } = req.body;

        // Save mock config
        req.session.user.emailConfig = {
            email: 'test@example.com',
            password: 'mock-password',
            host: 'mock.imap.server',
            port: 993,
            provider: provider || 'gmail',
            isMock: true
        };

        // Create mock notifications for testing
        const mockEmails = [
            {
                userId: userId,
                subject: 'Job Alert: Software Engineer Position at Tech Corp',
                from: { name: 'Tech Corp HR', email: 'careers@techcorp.com' },
                date: new Date(),
                category: 'job',
                priority: 'high',
                snippet: 'We are looking for a skilled Software Engineer...',
                isRead: false
            },
            {
                userId: userId,
                subject: 'Summer Internship Opportunity 2024',
                from: { name: 'Startup Inc', email: 'internships@startup.com' },
                date: new Date(Date.now() - 86400000), // Yesterday
                category: 'internship',
                priority: 'medium',
                snippet: 'Apply for our summer internship program...',
                isRead: false
            },
            {
                userId: userId,
                subject: 'Hackathon Announcement: CodeFest 2024',
                from: { name: 'CodeFest Organizers', email: 'info@codefest.org' },
                date: new Date(Date.now() - 172800000), // 2 days ago
                category: 'hackathon',
                priority: 'medium',
                snippet: 'Join us for the annual CodeFest hackathon...',
                isRead: true
            }
        ];

        // Save mock emails
        await EmailNotification.insertMany(mockEmails);

        res.json({
            success: true,
            message: 'Mock email account connected successfully! You can now test email features with sample data.',
            isMock: true
        });

    } catch (error) {
        console.error('Error connecting mock email:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to setup mock email account'
        });
    }
});

router.post('/mark-read', async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { emailIds } = req.body;

        if (!Array.isArray(emailIds) || emailIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No emails selected'
            });
        }

        await EmailNotification.markAsRead(userId, emailIds);

        res.json({
            success: true,
            message: 'Emails marked as read'
        });
    } catch (error) {
        console.error('Error marking emails as read:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to mark emails as read'
        });
    }
});

// Archive email
router.post('/archive/:id', async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { id } = req.params;

        await EmailNotification.findOneAndUpdate(
            { _id: id, userId },
            { isArchived: true, updatedAt: new Date() }
        );

        res.json({
            success: true,
            message: 'Email archived'
        });
    } catch (error) {
        console.error('Error archiving email:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to archive email'
        });
    }
});

// Get email details
router.get('/:id', async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { id } = req.params;

        const email = await EmailNotification.findOne({
            _id: id,
            userId
        }).lean();

        if (!email) {
            return res.status(404).render('error', {
                title: 'Not Found',
                error: 'Email not found'
            });
        }

        // Mark as read when viewing
        if (!email.isRead) {
            await EmailNotification.findOneAndUpdate(
                { _id: id, userId },
                { isRead: true, updatedAt: new Date() }
            );
        }

        res.render('email/view', {
            title: email.subject,
            activeTab: 'email',
            user: req.session.user,
            email
        });
    } catch (error) {
        console.error('Error loading email:', error);
        res.render('error', {
            title: 'Error',
            error: 'Failed to load email'
        });
    }
});

// Get email stats for dashboard
router.get('/api/stats', async (req, res) => {
    try {
        const userId = req.session.user.id;

        const [
            unreadCount,
            todayImportant,
            byCategory
        ] = await Promise.all([
            EmailNotification.getUnreadCount(userId),
            EmailNotification.getTodayImportant(userId),
            EmailNotification.aggregate([
                { $match: { userId, isArchived: false } },
                { $group: { _id: '$category', count: { $sum: 1 } } }
            ])
        ]);

        res.json({
            success: true,
            stats: {
                unread: unreadCount,
                todayImportant: todayImportant.length,
                byCategory: byCategory.reduce((acc, curr) => {
                    acc[curr._id] = curr.count;
                    return acc;
                }, {})
            },
            todayImportant: todayImportant.map(email => ({
                id: email._id,
                subject: email.subject,
                category: email.category,
                priority: email.priority,
                from: email.from?.name || email.from?.email,
                date: email.date
            }))
        });
    } catch (error) {
        console.error('Error getting email stats:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get email statistics'
        });
    }
});

// Add this to your email routes
router.post('/bulk-delete', isAuthenticated, async (req, res) => {
    try {
        const { emailIds } = req.body;

        if (!emailIds || !Array.isArray(emailIds) || emailIds.length === 0) {
            req.session.error = 'No emails selected for deletion';
            return res.redirect('/email');
        }

        // Delete selected emails
        const result = await EmailNotification.deleteMany({
            userId: req.session.user._id,
            emailId: { $in: emailIds }
        });

        req.session.success = `Successfully deleted ${result.deletedCount} email(s)`;
        res.redirect('/email');

    } catch (error) {
        console.error('Bulk delete error:', error);
        req.session.error = 'Failed to delete emails';
        res.redirect('/email');
    }
});

module.exports = router;