const express = require('express');
const router = express.Router();
const Attendance = require('../models/Attendance');

const requireAuth = (req, res, next) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    next();
};

router.use(requireAuth);

// Attendance main page
router.get('/', async (req, res) => {
    try {
        const userId = req.session.user.id;

        // Find all records - virtuals are handled by the model
        const attendance = await Attendance.find({ userId: userId });

        // Calculate overall stats
        let totalAttended = 0;
        let totalTotal = 0;

        attendance.forEach(a => {
            totalAttended += a.attendedClasses;
            totalTotal += a.totalClasses;
        });

        const overallPercentage = totalTotal > 0 ? (totalAttended / totalTotal) * 100 : 0;

        const stats = {
            totalSubjects: attendance.length,
            overallPercentage: Math.round(overallPercentage * 10) / 10,
            overallThreshold: 75,
            safeSubjects: attendance.filter(a => a.status === 'safe').length,
            atRiskSubjects: attendance.filter(a => a.status === 'atRisk').length,
            criticalSubjects: attendance.filter(a => a.status === 'critical').length
        };

        res.render('attendance/index', {
            title: 'Attendance Tracker',
            activeTab: 'attendance',
            attendance,
            stats
        });

    } catch (err) {
        console.error('Error in attendance route:', err);
        res.status(500).render('error', {
            error: err.message,
            title: 'Error'
        });
    }
});

// Add attendance record
router.post('/add', async (req, res) => {
    try {
        const { subject, totalClasses, attendedClasses, weeklyClassCount, threshold } = req.body;
        const userId = req.session.user.id;

        if (!subject || totalClasses === undefined || attendedClasses === undefined) {
            return res.status(400).json({ error: 'Subject and counts are required' });
        }

        const record = new Attendance({
            userId,
            subject: subject.trim(),
            totalClasses: parseInt(totalClasses),
            attendedClasses: parseInt(attendedClasses),
            weeklyClassCount: parseInt(weeklyClassCount) || 4,
            threshold: parseInt(threshold) || 75
        });

        await record.save();
        res.redirect('/attendance');

    } catch (err) {
        console.error('Error adding attendance:', err);
        res.status(500).render('error', { error: err.message });
    }
});

// Update attendance action
router.post('/update/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { action } = req.body;
        const userId = req.session.user.id;

        const record = await Attendance.findOne({ _id: id, userId: userId });

        if (!record) return res.redirect('/attendance');

        if (action === 'present') {
            record.attendedClasses += 1;
            record.totalClasses += 1;
        } else if (action === 'absent') {
            record.totalClasses += 1;
        }

        await record.save();
        res.redirect('/attendance');

    } catch (error) {
        console.error('Error updating attendance:', error);
        res.redirect('/attendance');
    }
});

// Risk Analysis Endpoint
router.get('/risk', async (req, res) => {
    try {
        const attendance = await Attendance.find({ userId: req.session.user.id });
        const risks = attendance.map(a => {
            // Predict for next 4 weeks
            const projectedTotal = a.totalClasses + (4 * a.weeklyClassCount);
            const neededToMaintain = Math.ceil((a.threshold / 100) * projectedTotal);
            const canMiss = Math.max(0, (projectedTotal - neededToMaintain) - (a.totalClasses - a.attendedClasses));

            return {
                subject: a.subject,
                percentage: a.percentage,
                threshold: a.threshold,
                status: a.status,
                canMissNext: canMiss,
                classesNeeded: a.classesNeeded
            };
        });

        res.json(risks);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete attendance record
router.post('/delete/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.session.user.id;

        await Attendance.findOneAndDelete({ _id: id, userId: userId });

        res.redirect('/attendance');

    } catch (error) {
        console.error('Error deleting attendance:', error);
        res.redirect('/attendance');
    }
});

module.exports = router;