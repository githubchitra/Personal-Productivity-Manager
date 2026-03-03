const express = require('express');
const router = express.Router();
const User = require('../models/User');

// Auth middleware
const requireAuth = (req, res, next) => {
    if (!req.session.user) return res.redirect('/login');
    next();
};

router.use(requireAuth);

// Profile page
router.get('/profile', async (req, res) => {
    try {
        const user = await User.findById(req.session.user.id);
        res.render('user/profile', {
            title: 'My Profile',
            activeTab: 'profile',
            user: user.toObject()
        });
    } catch (err) {
        res.status(500).render('error', { error: err.message });
    }
});

// Update profile basic info
router.post('/profile/update', async (req, res) => {
    try {
        const { fullName, college, semester, bio, profilePicture } = req.body;
        await User.findByIdAndUpdate(req.session.user.id, {
            fullName,
            college,
            semester,
            bio,
            profilePicture
        });

        // Update session user info if needed
        req.session.user.fullName = fullName;

        res.redirect('/profile');
    } catch (err) {
        res.status(500).render('error', { error: err.message });
    }
});

// Settings page
router.get('/settings', async (req, res) => {
    try {
        const user = await User.findById(req.session.user.id);
        res.render('user/settings', {
            title: 'Settings',
            activeTab: 'settings',
            user: user.toObject()
        });
    } catch (err) {
        res.status(500).render('error', { error: err.message });
    }
});

// Update security settings (Password change)
router.post('/settings/security', async (req, res) => {
    try {
        const { currentPassword, newPassword, confirmPassword } = req.body;
        const user = await User.findById(req.session.user.id);

        if (newPassword !== confirmPassword) {
            return res.render('user/settings', {
                title: 'Settings',
                user: user.toObject(),
                error: 'Passwords do not match'
            });
        }

        const isMatch = await user.comparePassword(currentPassword);
        if (!isMatch) {
            return res.render('user/settings', {
                title: 'Settings',
                user: user.toObject(),
                error: 'Current password is incorrect'
            });
        }

        user.password = newPassword;
        await user.save();

        res.render('user/settings', {
            title: 'Settings',
            user: user.toObject(),
            success: 'Password updated successfully'
        });
    } catch (err) {
        res.status(500).render('error', { error: err.message });
    }
});

module.exports = router;
