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
        console.log('Fetching attendance for user:', userId);
        
        // Use .lean() with transform option to include virtuals
        const attendance = await Attendance.find({ userId: userId })
            .lean({ virtuals: true });
        
        console.log('Found attendance records:', attendance.length);
        
        // Manually add percentage and status for each record
        attendance.forEach(record => {
            // Calculate percentage
            const perc = record.totalClasses > 0 ? 
                (record.attendedClasses / record.totalClasses) * 100 : 0;
            record.percentage = Math.round(perc * 10) / 10;
            
            // Determine status
            if (record.percentage >= 75) {
                record.status = 'safe';
            } else if (record.percentage >= 60) {
                record.status = 'atRisk';
            } else {
                record.status = 'critical';
            }
            
            console.log(`Record: ${record.subject} - ${record.attendedClasses}/${record.totalClasses} = ${record.percentage}%`);
        });
        
        // Calculate stats
        const totalSubjects = attendance.length;
        const safeSubjects = attendance.filter(a => a.percentage >= 75).length;
        const atRiskSubjects = attendance.filter(a => a.percentage >= 60 && a.percentage < 75).length;
        const criticalSubjects = attendance.filter(a => a.percentage < 60).length;
        
        res.render('attendance/index', {
            title: 'Attendance Tracker',
            attendance,
            totalSubjects,
            safeSubjects,
            atRiskSubjects,
            criticalSubjects
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
        const { subject, totalClasses, attendedClasses } = req.body;
        const userId = req.session.user.id;
        
        // Validate
        if (!subject || !totalClasses || attendedClasses === undefined) {
            return res.status(400).json({ error: 'All fields are required' });
        }
        
        const total = parseInt(totalClasses);
        const attended = parseInt(attendedClasses);
        
        if (attended > total) {
            return res.status(400).json({ error: 'Attended classes cannot be more than total classes' });
        }
        
        // Create new attendance record
        const attendance = new Attendance({
            userId,
            subject: subject.trim(),
            totalClasses: total,
            attendedClasses: attended
        });
        
        await attendance.save();
        console.log('Attendance saved:', attendance);
        
        res.redirect('/attendance');
        
    } catch (err) {
        console.error('Error adding attendance:', err);
        res.status(500).render('error', { error: err.message });
    }
});

// Update attendance (mark present/absent)
router.post('/update/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { action } = req.body;
        const userId = req.session.user.id;
        
        console.log('Update request:', { id, action, userId });
        
        // Find the attendance record
        const attendance = await Attendance.findOne({ _id: id, userId: userId });
        
        if (!attendance) {
            console.log('Attendance not found or unauthorized');
            return res.redirect('/attendance');
        }
        
        // Update based on action
        if (action === 'present') {
            attendance.attendedClasses += 1;
            attendance.totalClasses += 1;
        } else if (action === 'absent') {
            attendance.totalClasses += 1;
            // attendedClasses remains the same
        } else {
            return res.status(400).redirect('/attendance');
        }
        
        await attendance.save();
        console.log('Attendance updated:', attendance);
        
        res.redirect('/attendance');
        
    } catch (error) {
        console.error('Error updating attendance:', error);
        res.redirect('/attendance');
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