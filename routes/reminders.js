const express = require('express');
const router = express.Router();
const Reminder = require('../models/Reminder');

const requireAuth = (req, res, next) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    next();
};

router.use(requireAuth);

// Helper function to get date ranges
const getDateRange = (filter) => {
    const now = new Date();
    
    switch(filter) {
        case 'today':
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);
            const todayEnd = new Date(todayStart);
            todayEnd.setDate(todayEnd.getDate() + 1);
            return { $gte: todayStart, $lt: todayEnd };
            
        case 'tomorrow':
            const tomorrowStart = new Date();
            tomorrowStart.setDate(tomorrowStart.getDate() + 1);
            tomorrowStart.setHours(0, 0, 0, 0);
            const tomorrowEnd = new Date(tomorrowStart);
            tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);
            return { $gte: tomorrowStart, $lt: tomorrowEnd };
            
        case 'overdue':
            return { $lt: new Date() };
            
        case 'upcoming':
            const weekLater = new Date();
            weekLater.setDate(weekLater.getDate() + 7);
            return { $gte: new Date(), $lte: weekLater };
            
        default:
            return null;
    }
};

// Reminders main page
router.get('/', async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { filter } = req.query;
        
        let query = { userId };
        
        // Apply filters
        if (filter) {
            switch(filter) {
                case 'upcoming':
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    const weekLater = new Date(today);
                    weekLater.setDate(weekLater.getDate() + 7);
                    query.dueDate = { $gte: today };
                    query.status = 'pending';
                    break;
                    
                case 'today':
                    const todayStart = new Date();
                    todayStart.setHours(0, 0, 0, 0);
                    const todayEnd = new Date(todayStart);
                    todayEnd.setDate(todayEnd.getDate() + 1);
                    query.dueDate = { $gte: todayStart, $lt: todayEnd };
                    query.status = 'pending';
                    break;
                    
                case 'tomorrow':
                    const tomorrowStart = new Date();
                    tomorrowStart.setDate(tomorrowStart.getDate() + 1);
                    tomorrowStart.setHours(0, 0, 0, 0);
                    const tomorrowEnd = new Date(tomorrowStart);
                    tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);
                    query.dueDate = { $gte: tomorrowStart, $lt: tomorrowEnd };
                    query.status = 'pending';
                    break;
                    
                case 'overdue':
                    const now = new Date();
                    query.dueDate = { $lt: now };
                    query.status = 'pending';
                    break;
                    
                case 'completed':
                    query.status = 'completed';
                    break;
                    
                case 'high':
                    query.priority = 'high';
                    break;
                    
                default:
                    break;
            }
        }
        
        // Fetch reminders
        const reminders = await Reminder.find(query)
            .sort({ dueDate: 1 })
            .lean(); // Use lean() for plain JavaScript objects
        
        // Debug: Log the reminders data
        console.log('Reminders fetched:', reminders.length);
        reminders.forEach((reminder, index) => {
            console.log(`Reminder ${index + 1}:`, {
                title: reminder.title,
                type: reminder.type,
                dueDate: reminder.dueDate,
                priority: reminder.priority,
                status: reminder.status,
                id: reminder._id
            });
        });
        
        // Get stats
        const stats = {
            total: await Reminder.countDocuments({ userId }),
            pending: await Reminder.countDocuments({ 
                userId, 
                status: 'pending',
                dueDate: { $gte: new Date() }
            }),
            overdue: await Reminder.countDocuments({ 
                userId, 
                status: 'pending',
                dueDate: { $lt: new Date() }
            }),
            completed: await Reminder.countDocuments({ userId, status: 'completed' }),
            upcoming: await Reminder.countDocuments({
                userId,
                status: 'pending',
                dueDate: { 
                    $gte: new Date(),
                    $lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
                }
            }),
            highPriority: await Reminder.countDocuments({ 
                userId, 
                priority: 'high',
                status: 'pending'
            }),
            today: await Reminder.countDocuments({
                userId,
                status: 'pending',
                dueDate: { 
                    $gte: new Date(new Date().setHours(0, 0, 0, 0)),
                    $lt: new Date(new Date().setHours(24, 0, 0, 0))
                }
            }),
            tomorrow: await Reminder.countDocuments({
                userId,
                status: 'pending',
                dueDate: { 
                    $gte: new Date(new Date().setHours(24, 0, 0, 0)),
                    $lt: new Date(new Date().setHours(48, 0, 0, 0))
                }
            })
        };
        
        // Get upcoming reminders
        const upcoming = await Reminder.find({
            userId,
            status: 'pending',
            dueDate: { 
                $gte: new Date(),
                $lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
            }
        })
        .sort({ dueDate: 1 })
        .limit(10)
        .lean();
        
        res.render('reminders/index', {
            title: 'Reminders',
            reminders: reminders,
            stats: stats,
            upcoming: upcoming,
            currentFilter: filter || 'all'
        });
    } catch (err) {
        console.error('Error:', err);
        res.render('error', { error: err.message });
    }
});

// Add reminder page
router.get('/add', (req, res) => {
    res.render('reminders/add', { title: 'Add Reminder' });
});

// Handle add reminder
router.post('/add', async (req, res) => {
    try {
        const { title, description, type, dueDate, priority } = req.body;
        const userId = req.session.user.id;
        
        // Calculate status based on due date
        const due = new Date(dueDate);
        const now = new Date();
        let status = 'pending';
        if (due < now) {
            status = 'overdue';
        }
        
        const reminder = new Reminder({
            userId,
            title,
            description,
            type,
            dueDate: due,
            priority,
            status
        });
        
        await reminder.save();
        res.redirect('/reminders');
    } catch (err) {
        console.error(err);
        res.render('reminders/add', {
            error: err.message,
            title: 'Add Reminder'
        });
    }
});

// Edit reminder page - FIXED
router.get('/edit/:id', async (req, res) => {
  //  res.render('reminders/edit')
     try {
        console.log('Edit route called with ID:', req.params.id);
        console.log('Session user:', req.session.user);
        
        const userId = req.session.user.id;
        
        // Validate ObjectId
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            console.log('Invalid ObjectId:', req.params.id);
            return res.status(400).render('404', {
                title: 'Invalid Reminder ID',
                message: 'The reminder ID format is invalid.'
            });
        }
        
        const reminder = await Reminder.findOne({ 
            _id: req.params.id, 
            userId: userId 
        });
        
        console.log('Found reminder:', reminder);
        
        if (!reminder) {
            console.log('Reminder not found for user');
            return res.status(404).render('404', {
                title: 'Reminder Not Found',
                message: 'The reminder you are trying to edit does not exist or you do not have permission to access it.'
            });
        }
        
        // Format date for datetime-local input
        const dueDate = new Date(reminder.dueDate);
        const formattedDate = dueDate.toISOString().slice(0, 16);
        
        console.log('Rendering edit page...');
        
        res.render('reminders/edit', {
            title: 'Edit Reminder',
            reminder: {
                ...reminder.toObject(),
                formattedDate: formattedDate
            }
        });
    } catch (err) {
        console.error('Edit route error details:', err);
        console.error('Error stack:', err.stack);
        res.status(500).render('error', { 
            error: 'Failed to load reminder for editing: ' + err.message,
            title: 'Error'
        });
    }
});

// Handle edit reminder - UPDATED
router.post('/edit/:id', async (req, res) => {
    try {
        console.log('POST Edit route called with ID:', req.params.id);
        
        const userId = req.session.user.id;
        const { title, description, type, dueDate, priority } = req.body;
        
        // Validate ObjectId
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).render('error', {
                error: 'Invalid reminder ID format',
                title: 'Error'
            });
        }
        
        // Calculate status based on due date
        const due = new Date(dueDate);
        const now = new Date();
        let status = 'pending';
        if (due < now) {
            status = 'overdue';
        }
        
        const result = await Reminder.updateOne(
            { _id: req.params.id, userId: userId },
            { 
                title,
                description,
                type,
                dueDate: due,
                priority,
                status
            }
        );
        
        console.log('Update result:', result);
        
        if (result.matchedCount === 0) {
            return res.status(404).render('404', {
                title: 'Reminder Not Found',
                message: 'The reminder you are trying to edit does not exist.'
            });
        }
        
        res.redirect('/reminders');
    } catch (err) {
        console.error('POST Edit error:', err);
        res.status(500).render('error', { 
            error: 'Failed to update reminder: ' + err.message,
            title: 'Error'
        });
    }
});

// Mark as complete
router.post('/complete/:id', async (req, res) => {
    try {
        const userId = req.session.user.id;
        await Reminder.updateOne(
            { _id: req.params.id, userId },
            { $set: { status: 'completed' } }
        );
        
        res.redirect('/reminders');
    } catch (err) {
        console.error(err);
        res.render('error', { error: err.message });
    }
});

// Mark as pending
router.post('/pending/:id', async (req, res) => {
    try {
        const userId = req.session.user.id;
        
        // Recalculate status based on due date
        const reminder = await Reminder.findOne({ _id: req.params.id, userId });
        const now = new Date();
        let status = 'pending';
        if (reminder.dueDate < now) {
            status = 'overdue';
        }
        
        await Reminder.updateOne(
            { _id: req.params.id, userId },
            { $set: { status: status } }
        );
        
        res.redirect('/reminders');
    } catch (err) {
        console.error(err);
        res.render('error', { error: err.message });
    }
});

// Delete reminder
router.delete('/delete/:id', async (req, res) => {
    try {
        const userId = req.session.user.id;
        const reminderId = req.params.id;
        
        console.log('Delete request received:', {
            userId: userId,
            reminderId: reminderId,
            method: req.method
        });
        
        // Validate ObjectId
        if (!mongoose.Types.ObjectId.isValid(reminderId)) {
            console.log('Invalid ObjectId format:', reminderId);
            return res.status(400).json({ 
                success: false, 
                error: 'Invalid reminder ID format' 
            });
        }
        
        const result = await Reminder.deleteOne({ 
            _id: reminderId, 
            userId: userId 
        });
        
        console.log('Delete result:', result);
        
        if (result.deletedCount === 0) {
            return res.status(404).json({ 
                success: false, 
                error: 'Reminder not found or you do not have permission' 
            });
        }
        
        res.json({ 
            success: true, 
            message: 'Reminder deleted successfully' 
        });
        
    } catch (err) {
        console.error('Delete error:', err);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to delete reminder: ' + err.message 
        });
    }
});

// POST route for delete (for form submissions)
router.post('/delete/:id', async (req, res) => {
    try {
        const userId = req.session.user.id;
        const reminderId = req.params.id;
        
        console.log('POST Delete request received:', {
            userId: userId,
            reminderId: reminderId
        });
        
        if (!mongoose.Types.ObjectId.isValid(reminderId)) {
            req.session.error = 'Invalid reminder ID format';
            return res.redirect('/reminders');
        }
        
        const result = await Reminder.deleteOne({ 
            _id: reminderId, 
            userId: userId 
        });
        
        if (result.deletedCount === 0) {
            req.session.error = 'Reminder not found or you do not have permission';
        } else {
            req.session.success = 'Reminder deleted successfully';
        }
        
        res.redirect('/reminders');
        
    } catch (err) {
        console.error('POST Delete error:', err);
        req.session.error = 'Failed to delete reminder: ' + err.message;
        res.redirect('/reminders');
    }
});

// Get reminders for calendar (API)
router.get('/api/calendar', async (req, res) => {
    try {
        const userId = req.session.user.id;
        const reminders = await Reminder.find({
            userId,
            status: { $in: ['pending', 'overdue'] }
        }).sort({ dueDate: 1 });
        
        const events = reminders.map(reminder => ({
            id: reminder._id,
            title: reminder.title,
            start: reminder.dueDate,
            end: new Date(reminder.dueDate.getTime() + 60 * 60 * 1000),
            color: reminder.priority === 'high' ? '#dc3545' : 
                   reminder.priority === 'medium' ? '#ffc107' : '#0d6efd',
            textColor: '#fff',
            description: reminder.description,
            extendedProps: {
                type: reminder.type,
                priority: reminder.priority,
                status: reminder.status
            }
        }));
        
        res.json(events);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// Get upcoming reminders (API)
router.get('/api/upcoming', async (req, res) => {
    try {
        const userId = req.session.user.id;
        
        const upcomingRange = getDateRange('upcoming');
        const upcoming = await Reminder.find({
            userId,
            status: 'pending',
            dueDate: upcomingRange
        }).sort({ dueDate: 1 }).limit(10);
        
        res.json(upcoming);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;