const express = require('express');
const router = express.Router();
const ProgressTracker = require('../models/Progress');

const requireAuth = (req, res, next) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    next();
};

router.use(requireAuth);

// Main progress dashboard - with IST handling
router.get('/', async (req, res) => {
    try {
        const userId = req.session.user.id;
        
        const trackers = await ProgressTracker.find({ userId })
            .sort({ lastUpdated: -1 })
            .lean();
        
        // Get today's start and end in IST (converted to UTC for querying)
        const now = new Date();
        const istNow = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
        
        // Today start in IST (00:00:00)
        const todayStartIST = new Date(istNow);
        todayStartIST.setHours(0, 0, 0, 0);
        const todayStartUTC = new Date(todayStartIST.getTime() - (5.5 * 60 * 60 * 1000));
        
        // Tomorrow start in IST (00:00:00)
        const tomorrowStartIST = new Date(todayStartIST);
        tomorrowStartIST.setDate(tomorrowStartIST.getDate() + 1);
        const tomorrowStartUTC = new Date(tomorrowStartIST.getTime() - (5.5 * 60 * 60 * 1000));
        
        // Calculate stats
        let todayTotalEntries = 0;
        let todayTotalTime = 0;
        
        trackers.forEach(tracker => {
            // Calculate today's entries for this tracker in IST
            tracker.todayEntries = tracker.dailyEntries.filter(entry => {
                const entryDate = new Date(entry.date);
                return entryDate >= todayStartUTC && entryDate < tomorrowStartUTC;
            }).length;
            
            tracker.totalEntries = tracker.dailyEntries.length;
            
            // Add to totals
            tracker.dailyEntries.forEach(entry => {
                const entryDate = new Date(entry.date);
                if (entryDate >= todayStartUTC && entryDate < tomorrowStartUTC) {
                    todayTotalEntries++;
                    todayTotalTime += entry.timeSpent || 0;
                }
            });
        });
        
        const stats = {
            totalTrackers: trackers.length,
            activeTrackers: trackers.filter(t => t.status === 'active').length,
            completedTrackers: trackers.filter(t => t.status === 'completed').length,
            todayEntries: todayTotalEntries,
            todayTime: todayTotalTime,
            totalEntries: trackers.reduce((sum, tracker) => 
                sum + tracker.dailyEntries.length, 0
            ),
            totalTimeSpent: trackers.reduce((sum, tracker) => 
                sum + tracker.dailyEntries.reduce((entrySum, entry) => 
                    entrySum + (entry.timeSpent || 0), 0
                ), 0
            )
        };
        
        // Get today's date in IST for display
        const todayStr = istNow.toISOString().split('T')[0];
        
        res.render('progress/index', {
            title: 'Daily Progress Tracker',
            trackers,
            stats,
            today: todayStr,
            hasTrackers: trackers.length > 0
        });
    } catch (err) {
        console.error(err);
        res.render('error', { error: err.message });
    }
});

// Create new tracker
router.get('/create', (req, res) => {
    res.render('progress/create', {
        title: 'Create New Tracker'
    });
});

// Handle tracker creation
router.post('/create', async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { 
            title, 
            category, 
            description, 
            target, 
            unit,
            color,
            icon 
        } = req.body;
        
        const tracker = new ProgressTracker({
            userId,
            title: title.trim(),
            category: category ? category.trim() : 'General',
            description: description ? description.trim() : '',
            target: target ? parseInt(target) : 0,
            unit: unit ? unit.trim() : '',
            color: color || '#0d6efd',
            icon: icon || 'bi-check-circle',
            status: 'active'
        });
        
        await tracker.save();
        
        req.session.success = 'Tracker created successfully!';
        res.redirect('/progress');
    } catch (err) {
        console.error(err);
        res.render('progress/create', {
            title: 'Create New Tracker',
            error: err.message,
            formData: req.body
        });
    }
});

// View tracker details - with IST handling
router.get('/tracker/:id', async (req, res) => {
    try {
        const userId = req.session.user.id;
        const trackerId = req.params.id;
        
        const tracker = await ProgressTracker.findOne({
            _id: trackerId,
            userId
        }).lean();
        
        if (!tracker) {
            req.session.error = 'Tracker not found';
            return res.redirect('/progress');
        }
        
        // Sort entries by date (newest first)
        tracker.dailyEntries.sort((a, b) => new Date(b.date) - new Date(a.date));
        
        // Get today's range in IST
        const now = new Date();
        const istNow = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
        
        const todayStartIST = new Date(istNow);
        todayStartIST.setHours(0, 0, 0, 0);
        const todayStartUTC = new Date(todayStartIST.getTime() - (5.5 * 60 * 60 * 1000));
        
        const tomorrowStartIST = new Date(todayStartIST);
        tomorrowStartIST.setDate(tomorrowStartIST.getDate() + 1);
        const tomorrowStartUTC = new Date(tomorrowStartIST.getTime() - (5.5 * 60 * 60 * 1000));
        
        // Calculate stats
        const stats = {
            totalEntries: tracker.dailyEntries.length,
            todayEntries: tracker.dailyEntries.filter(entry => {
                const entryDate = new Date(entry.date);
                return entryDate >= todayStartUTC && entryDate < tomorrowStartUTC;
            }).length,
            totalTimeSpent: tracker.dailyEntries.reduce((sum, entry) => 
                sum + (entry.timeSpent || 0), 0
            ),
            totalQuantity: tracker.dailyEntries.reduce((sum, entry) => 
                sum + (entry.quantity || 0), 0
            ),
            streak: tracker.streak || 0,
            progressPercentage: tracker.target > 0 ? 
                Math.min(100, Math.round((tracker.dailyEntries.reduce((sum, entry) => 
                    sum + (entry.quantity || 0), 0
                ) / tracker.target) * 100)) : 0
        };
        
        // Get today's date in IST for form
        const todayStr = istNow.toISOString().split('T')[0];
        
        res.render('progress/tracker', {
            title: tracker.title,
            tracker,
            stats,
            today: todayStr
        });
    } catch (err) {
        console.error(err);
        res.render('error', { error: err.message });
    }
});

// Add daily entry - with IST handling
router.post('/entry/add/:trackerId', async (req, res) => {
    try {
        const userId = req.session.user.id;
        const trackerId = req.params.trackerId;
        const {
            description,
            timeSpent,
            quantity,
            unit,
            notes,
            entryDate
        } = req.body;
        
        const tracker = await ProgressTracker.findOne({
            _id: trackerId,
            userId
        });
        
        if (!tracker) {
            req.session.error = 'Tracker not found';
            return res.redirect('/progress');
        }
        
        // Handle date: if entryDate is provided, combine with current IST time
        let entryDateTime;
        if (entryDate) {
            // Get current time in IST
            const now = new Date();
            const istNow = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
            const currentTime = istNow.toTimeString().split(' ')[0].substring(0, 5); // HH:MM
            
            // Combine selected date with current IST time
            entryDateTime = new Date(`${entryDate}T${currentTime}:00.000+05:30`);
            // Convert to UTC for storage
            entryDateTime = new Date(entryDateTime.getTime() - (5.5 * 60 * 60 * 1000));
        } else {
            // Current time in IST, converted to UTC for storage
            const now = new Date();
            const istNow = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
            entryDateTime = new Date(istNow.getTime() - (5.5 * 60 * 60 * 1000));
        }
        
        // Create new entry
        const newEntry = {
            date: entryDateTime, // Stored in UTC
            description: description.trim(),
            timeSpent: timeSpent ? parseInt(timeSpent) : 0,
            quantity: quantity ? parseInt(quantity) : 0,
            unit: unit ? unit.trim() : tracker.unit,
            notes: notes ? notes.trim() : '',
            createdAt: new Date()
        };
        
        console.log('New entry date (UTC):', newEntry.date);
        console.log('New entry date (IST):', new Date(newEntry.date.getTime() + (5.5 * 60 * 60 * 1000)));
        
        // Always push new entry (append)
        tracker.dailyEntries.push(newEntry);
        
        // Update lastUpdated
        tracker.lastUpdated = new Date();
        
        // Update streak based on IST days
        const todayIST = new Date();
        const istToday = new Date(todayIST.getTime() + (5.5 * 60 * 60 * 1000));
        istToday.setHours(0, 0, 0, 0);
        
        // Get unique dates with entries in IST
        const entryDatesIST = tracker.dailyEntries.map(entry => {
            const entryDate = new Date(entry.date);
            const istEntryDate = new Date(entryDate.getTime() + (5.5 * 60 * 60 * 1000));
            istEntryDate.setHours(0, 0, 0, 0);
            return istEntryDate.getTime();
        });
        
        // Remove duplicates and sort
        const uniqueDates = [...new Set(entryDatesIST)].sort((a, b) => a - b);
        
        // Calculate streak in IST
        let streak = 0;
        let currentDate = istToday.getTime();
        
        // Check consecutive days backwards from today
        for (let i = uniqueDates.length - 1; i >= 0; i--) {
            const entryDate = uniqueDates[i];
            const expectedDate = currentDate - (streak * 24 * 60 * 60 * 1000);
            
            if (Math.abs(entryDate - expectedDate) < 24 * 60 * 60 * 1000) {
                streak++;
                currentDate = entryDate;
            } else {
                break;
            }
        }
        
        tracker.streak = streak;
        
        // Check if target is reached
        if (tracker.target > 0) {
            const totalQuantity = tracker.dailyEntries.reduce((sum, entry) => 
                sum + (entry.quantity || 0), 0
            );
            
            if (totalQuantity >= tracker.target) {
                tracker.status = 'completed';
            }
        }
        
        await tracker.save();
        
        req.session.success = 'Entry added successfully!';
        res.redirect(`/progress/tracker/${trackerId}`);
    } catch (err) {
        console.error('Add entry error:', err);
        req.session.error = 'Failed to add entry: ' + err.message;
        res.redirect(`/progress/tracker/${req.params.trackerId}`);
    }
});

// Edit tracker
router.get('/edit/:id', async (req, res) => {
    try {
        const userId = req.session.user.id;
        const trackerId = req.params.id;
        
        const tracker = await ProgressTracker.findOne({
            _id: trackerId,
            userId
        }).lean();
        
        if (!tracker) {
            req.session.error = 'Tracker not found';
            return res.redirect('/progress');
        }
        
        res.render('progress/edit', {
            title: 'Edit Tracker',
            tracker
        });
    } catch (err) {
        console.error(err);
        res.render('error', { error: err.message });
    }
});

// Update tracker
router.post('/edit/:id', async (req, res) => {
    try {
        const userId = req.session.user.id;
        const trackerId = req.params.id;
        const { 
            title, 
            category, 
            description, 
            target, 
            unit,
            color,
            icon,
            status 
        } = req.body;
        
        const tracker = await ProgressTracker.findOne({
            _id: trackerId,
            userId
        });
        
        if (!tracker) {
            req.session.error = 'Tracker not found';
            return res.redirect('/progress');
        }
        
        tracker.title = title.trim();
        tracker.category = category ? category.trim() : 'General';
        tracker.description = description ? description.trim() : '';
        tracker.target = target ? parseInt(target) : 0;
        tracker.unit = unit ? unit.trim() : '';
        tracker.color = color || '#0d6efd';
        tracker.icon = icon || 'bi-check-circle';
        tracker.status = status || 'active';
        tracker.lastUpdated = new Date();
        
        await tracker.save();
        
        req.session.success = 'Tracker updated successfully!';
        res.redirect(`/progress/tracker/${trackerId}`);
    } catch (err) {
        console.error(err);
        res.render('progress/edit', {
            title: 'Edit Tracker',
            error: err.message,
            tracker: req.body
        });
    }
});

// Delete tracker
router.post('/delete/:id', async (req, res) => {
    try {
        const userId = req.session.user.id;
        const trackerId = req.params.id;
        
        const result = await ProgressTracker.deleteOne({
            _id: trackerId,
            userId
        });
        
        if (result.deletedCount === 0) {
            req.session.error = 'Tracker not found';
        } else {
            req.session.success = 'Tracker deleted successfully!';
        }
        
        res.redirect('/progress');
    } catch (err) {
        console.error(err);
        req.session.error = 'Failed to delete tracker: ' + err.message;
        res.redirect('/progress');
    }
});

// Delete entry
router.post('/entry/delete/:trackerId/:entryIndex', async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { trackerId, entryIndex } = req.params;
        
        const tracker = await ProgressTracker.findOne({
            _id: trackerId,
            userId
        });
        
        if (!tracker) {
            req.session.error = 'Tracker not found';
            return res.redirect('/progress');
        }
        
        if (entryIndex >= 0 && entryIndex < tracker.dailyEntries.length) {
            tracker.dailyEntries.splice(entryIndex, 1);
            tracker.lastUpdated = new Date();
            await tracker.save();
            
            req.session.success = 'Entry deleted successfully!';
        } else {
            req.session.error = 'Entry not found';
        }
        
        res.redirect(`/progress/tracker/${trackerId}`);
    } catch (err) {
        console.error(err);
        req.session.error = 'Failed to delete entry: ' + err.message;
        res.redirect(`/progress/tracker/${req.params.trackerId}`);
    }
});

// Get calendar data (API)
router.get('/api/calendar/:trackerId', async (req, res) => {
    try {
        const userId = req.session.user.id;
        const trackerId = req.params.trackerId;
        
        const tracker = await ProgressTracker.findOne({
            _id: trackerId,
            userId
        }).lean();
        
        if (!tracker) {
            return res.status(404).json({ error: 'Tracker not found' });
        }
        
        // Create calendar events
        const events = tracker.dailyEntries.map(entry => ({
            id: entry._id,
            title: `${tracker.title}: ${entry.description}`,
            start: entry.date,
            end: new Date(new Date(entry.date).getTime() + 60 * 60 * 1000), // 1 hour
            color: tracker.color,
            description: entry.notes,
            extendedProps: {
                timeSpent: entry.timeSpent,
                quantity: entry.quantity,
                unit: entry.unit
            }
        }));
        
        res.json(events);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// Get statistics (API)
router.get('/api/stats/:trackerId', async (req, res) => {
    try {
        const userId = req.session.user.id;
        const trackerId = req.params.trackerId;
        
        const tracker = await ProgressTracker.findOne({
            _id: trackerId,
            userId
        }).lean();
        
        if (!tracker) {
            return res.status(404).json({ error: 'Tracker not found' });
        }
        
        // Calculate weekly stats
        const now = new Date();
        const last7Days = new Date(now);
        last7Days.setDate(last7Days.getDate() - 7);
        
        const last30Days = new Date(now);
        last30Days.setDate(last30Days.getDate() - 30);
        
        const weeklyEntries = tracker.dailyEntries.filter(entry => 
            new Date(entry.date) >= last7Days
        );
        
        const monthlyEntries = tracker.dailyEntries.filter(entry => 
            new Date(entry.date) >= last30Days
        );
        
        // Group by day
        const dailyStats = {};
        weeklyEntries.forEach(entry => {
            const dateStr = new Date(entry.date).toISOString().split('T')[0];
            if (!dailyStats[dateStr]) {
                dailyStats[dateStr] = {
                    date: entry.date,
                    entries: 0,
                    timeSpent: 0,
                    quantity: 0
                };
            }
            dailyStats[dateStr].entries += 1;
            dailyStats[dateStr].timeSpent += entry.timeSpent || 0;
            dailyStats[dateStr].quantity += entry.quantity || 0;
        });
        
        res.json({
            tracker: {
                title: tracker.title,
                streak: tracker.streak,
                totalEntries: tracker.dailyEntries.length
            },
            weekly: {
                entries: weeklyEntries.length,
                timeSpent: weeklyEntries.reduce((sum, entry) => sum + (entry.timeSpent || 0), 0),
                quantity: weeklyEntries.reduce((sum, entry) => sum + (entry.quantity || 0), 0)
            },
            monthly: {
                entries: monthlyEntries.length,
                timeSpent: monthlyEntries.reduce((sum, entry) => sum + (entry.timeSpent || 0), 0),
                quantity: monthlyEntries.reduce((sum, entry) => sum + (entry.quantity || 0), 0)
            },
            dailyStats: Object.values(dailyStats)
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;