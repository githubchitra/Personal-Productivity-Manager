const express = require('express');
const router = express.Router();
const Attendance = require('../models/Attendance');
const Reminder = require('../models/Reminder');
const Progress = require('../models/Progress');
const Todo = require('../models/Todo');
const Note = require('../models/Note');
const EmailNotification = require('../models/EmailNotification');
 
// Helper function to get email notifications
async function getEmailNotifications(userId) {
    try {
        // Get unread count
        const unreadCount = await EmailNotification.countDocuments({
            userId,
            isRead: false,
            isArchived: false
        });
        
        // Get today's important emails
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const todayImportant = await EmailNotification.find({
            userId,
            date: { $gte: today },
            category: { $in: ['job', 'internship', 'hackathon', 'college'] },
            isArchived: false
        })
        .sort({ priority: -1, date: -1 })
        .limit(10)
        .lean();
        
        // Format email data for template
        const formattedEmails = todayImportant.map(email => ({
            id: email._id.toString(),
            subject: email.subject || 'No Subject',
            category: email.category || 'other',
            priority: email.priority || 'medium',
            from: email.from?.name || email.from?.email || 'Unknown',
            date: email.date || new Date(),
            snippet: email.snippet || '',
            isRead: email.isRead || false,
            // Helper properties for template
            categoryColor: email.category === 'job' ? 'primary' : 
                         email.category === 'internship' ? 'info' :
                         email.category === 'hackathon' ? 'success' : 'warning',
            categoryIcon: email.category === 'job' ? 'briefcase' :
                        email.category === 'internship' ? 'person-workspace' :
                        email.category === 'hackathon' ? 'code-slash' : 'building',
            priorityColor: email.priority === 'critical' ? 'danger' :
                         email.priority === 'high' ? 'warning' :
                         email.priority === 'medium' ? 'info' : 'secondary',
            formattedDate: email.date ? new Date(email.date).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric'
            }) : ''
        }));
        
        return {
            stats: { unread: unreadCount },
            todayImportant: formattedEmails
        };
    } catch (error) {
        console.error('Error fetching email notifications:', error);
        return {
            stats: { unread: 0 },
            todayImportant: []
        };
    }
}

// Dashboard home
router.get('/', async (req, res) => {
    try {
        const userId = req.session.user._id || req.session.user.id;
        
        // Get email notifications in parallel with other data
        const emailStatsPromise = getEmailNotifications(userId);
        
        // Get attendance summary
        const attendance = await Attendance.find({ userId });
        const lowAttendance = attendance.filter(a => a.percentage < 75);
        const safeSubjects = attendance.filter(a => a.percentage >= 75).length;
        const atRiskSubjects = attendance.filter(a => a.percentage < 75 && a.percentage >= 60).length;
        
        // Get upcoming reminders
        const upcomingReminders = await Reminder.find({
            userId,
            dueDate: { $gte: new Date() },
            status: 'pending'
        }).sort({ dueDate: 1 }).limit(5);
        
        // Get DSA progress
        const dsaProgress = await Progress.findOne({
            userId,
            category: 'dsa',
            topic: 'DSA Overall'
        });
        
        // Get recent todos
        const todos = await Todo.find({ 
            userId,
            status: { $in: ['pending', 'in-progress'] }
        }).sort({ dueDate: 1 }).limit(5);
        
        // Get notes stats
        const notes = await Note.find({ userId });
        const notesStats = {
            totalNotes: notes.length,
            recentUploads: notes.filter(n => {
                const oneWeekAgo = new Date();
                oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
                return n.uploadDate > oneWeekAgo;
            }).length,
            totalSize: Math.round(notes.reduce((sum, n) => sum + (n.fileSize || 0), 0) / 1024 / 1024)
        };
        
        // Get reminders stats
        const allReminders = await Reminder.find({ userId });
        const remindersStats = {
            total: allReminders.length,
            pending: allReminders.filter(r => r.status === 'pending').length,
            overdue: allReminders.filter(r => r.status === 'overdue').length,
            completed: allReminders.filter(r => r.status === 'completed').length,
            upcoming: allReminders.filter(r => 
                r.status === 'pending' && 
                r.dueDate > new Date() && 
                r.dueDate < new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
            ).length,
            highPriority: allReminders.filter(r => r.priority === 'high').length
        };
        
        // Get recent activity
        const recentCompleted = await Todo.find({
            userId,
            status: 'completed',
            completedAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        }).sort({ completedAt: -1 }).limit(3);
        
        const recentNotes = await Note.find({ userId })
            .sort({ uploadDate: -1 })
            .limit(3);
        
        const upcomingTasks = await Todo.find({
            userId,
            status: { $in: ['pending', 'in-progress'] },
            dueDate: { $gte: new Date() }
        }).sort({ dueDate: 1 }).limit(3);
        
        // Wait for email stats to complete
        const emailStats = await emailStatsPromise;
        
        res.render('dashboard/index', {
            title: 'Dashboard',
            activeTab: 'dashboard',
            attendance,
            lowAttendance,
            safeSubjects,
            atRiskSubjects,
            upcomingReminders,
            dsaProgress,
            todos: todos.map(todo => ({
                ...todo.toObject(),
                dueIn: getDueIn(todo.dueDate)
            })),
            notesStats,
            remindersStats,
            recentCompleted: recentCompleted.map(t => ({
                title: t.title,
                timeAgo: getTimeAgo(t.completedAt)
            })),
            recentNotes: recentNotes.map(n => ({
                title: n.title,
                subject: n.subject,
                timeAgo: getTimeAgo(n.uploadDate)
            })),
            upcomingTasks: upcomingTasks.map(t => ({
                title: t.title,
                dueIn: getDueIn(t.dueDate)
            })),
            // Email notifications data
            emailNotifications: emailStats.todayImportant.slice(0, 5),
            emailUnreadCount: emailStats.stats?.unread || 0,
            user: req.session.user,
            helpers: {
                formatDate: function(date) {
                    if (!date) return '';
                    return new Date(date).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric'
                    });
                },
                eq: function(a, b) {
                    return a === b;
                },
                getTimeAgo: function(date) {
                    return getTimeAgo(date);
                }
            }
        });
    } catch (err) {
        console.error(err);
        res.render('error', { error: err.message });
    }
});

// Helper functions
function getTimeAgo(date) {
    if (!date) return 'recently';
    const seconds = Math.floor((new Date() - new Date(date)) / 1000);
    
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
    if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
    return Math.floor(seconds / 86400) + 'd ago';
}

function getDueIn(date) {
    if (!date) return 'no deadline';
    const diff = new Date(date) - new Date();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (diff < 0) return 'overdue';
    if (days === 0) return 'today';
    if (days === 1) return 'tomorrow';
    if (days < 7) return days + ' days';
    if (days < 30) return Math.floor(days / 7) + ' weeks';
    return Math.floor(days / 30) + ' months';
}

module.exports = router;