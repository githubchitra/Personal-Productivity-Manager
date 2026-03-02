// routes/smartEmail.js
const express = require('express');
const router = express.Router();
const SmartEmailConnector = require('../services/smartEmailService');
const EmailNotification = require('../models/EmailNotification');
const User = require('../models/User'); // Assuming User model exists

/**
 * Trigger manual sync with Smart Filtering
 */
router.post('/sync', async (req, res) => {
    try {
        const { userId, config } = req.body;
        if (!userId) return res.status(400).json({ success: false, message: 'User ID required' });

        // Instantiate our new smart connector
        const connector = new SmartEmailConnector(userId, config);
        const result = await connector.sync();

        if (result.success) {
            res.json({
                success: true,
                message: `Successfully synced ${result.count} unread emails.`,
                count: result.count
            });
        } else {
            res.status(500).json({
                success: false,
                message: 'Failed to sync emails. Backup system triggered.',
                error: result.error
            });
        }
    } catch (error) {
        console.error('API Error in Smart Sync:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * Get filtered notifications (by smart categories)
 */
router.get('/notifications/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const { category, priority } = req.query;

        let query = { userId };
        if (category) query.category = category;
        if (priority) query.priority = priority;

        const notifications = await EmailNotification.find(query)
            .sort({ date: -1 })
            .limit(50);

        res.json({ success: true, count: notifications.length, notifications });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * Mark all as read for specific user
 */
router.post('/mark-read', async (req, res) => {
    try {
        const { userId, emailIds } = req.body;
        await EmailNotification.updateMany(
            { userId, emailId: { $in: emailIds || [] } },
            { isRead: true }
        );
        res.json({ success: true, message: 'Updated notifications' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * Configuration check (Diagnostic tool for the user)
 */
router.get('/check-config', async (req, res) => {
    // Check environment variables required for connection
    const configStatus = {
        hasGoogleId: !!process.env.GOOGLE_CLIENT_ID,
        hasGoogleSecret: !!process.env.GOOGLE_CLIENT_SECRET,
        hasEmailUser: !!process.env.EMAIL_USER,
        hasEmailPass: !!process.env.EMAIL_PASSWORD
    };
    res.json({ success: true, configStatus });
});

module.exports = router;
