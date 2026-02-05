// routes/todos.js
const express = require('express');
const router = express.Router();
const Todo = require('../models/Todo');

// Authentication middleware
const requireAuth = (req, res, next) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    next();
};

// Apply auth middleware to all routes
router.use(requireAuth);

// Get user ID from session
const getUserId = (req) => req.session.user.id;

// ========== VIEW ROUTES ==========

// Main todos page with filters
router.get('/', async (req, res) => {
    try {
        const userId = getUserId(req);
        const { 
            filter = 'all', 
            priority, 
            category, 
            sort = 'dueDate', 
            page = 1, 
            limit = 10,
            search = ''
        } = req.query;
        
        // Calculate skip for pagination
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        // Build query
        let query = { userId };
        
        // Apply status filter
        if (filter === 'pending') {
            query.status = 'pending';
        } else if (filter === 'in-progress') {
            query.status = 'in-progress';
        } else if (filter === 'completed') {
            query.status = 'completed';
        } else if (filter === 'overdue') {
            query.status = { $in: ['pending', 'in-progress'] };
            query.dueDate = { $lt: new Date() };
        } else if (filter === 'today') {
            const startOfToday = new Date();
            startOfToday.setHours(0, 0, 0, 0);
            const endOfToday = new Date();
            endOfToday.setHours(23, 59, 59, 999);
            
            query.status = { $in: ['pending', 'in-progress'] };
            query.dueDate = { $gte: startOfToday, $lte: endOfToday };
        }
        
        // Apply priority filter
        if (priority && ['low', 'medium', 'high'].includes(priority)) {
            query.priority = priority;
        }
        
        // Apply category filter
        if (category && category !== 'all') {
            query.category = category;
        }
        
        // Apply search
        if (search) {
            query.$or = [
                { title: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } },
                { tags: { $regex: search, $options: 'i' } }
            ];
        }
        
        // Sort options
        let sortOption = {};
        switch(sort) {
            case 'dueDate':
                sortOption = { dueDate: 1 };
                break;
            case 'priority':
                sortOption = { 
                    priority: -1, // High priority first
                    dueDate: 1 
                };
                break;
            case 'created':
                sortOption = { createdAt: -1 };
                break;
            case 'updated':
                sortOption = { updatedAt: -1 };
                break;
            default:
                sortOption = { dueDate: 1 };
        }
        
        // Get todos with pagination
        const todos = await Todo.find(query)
            .sort(sortOption)
            .skip(skip)
            .limit(parseInt(limit))
            .lean();
        
        // Get total count for pagination
        const totalTodos = await Todo.countDocuments(query);
        const totalPages = Math.ceil(totalTodos / parseInt(limit));
        
        // Get counts for filters
        const counts = {
            all: await Todo.countDocuments({ userId }),
            pending: await Todo.countDocuments({ userId, status: 'pending' }),
            'in-progress': await Todo.countDocuments({ userId, status: 'in-progress' }),
            completed: await Todo.countDocuments({ userId, status: 'completed' }),
            today: await Todo.countDocuments({
                userId,
                status: { $in: ['pending', 'in-progress'] },
                dueDate: {
                    $gte: new Date().setHours(0, 0, 0, 0),
                    $lte: new Date().setHours(23, 59, 59, 999)
                }
            }),
            overdue: await Todo.countDocuments({
                userId,
                status: { $in: ['pending', 'in-progress'] },
                dueDate: { $lt: new Date() }
            })
        };
        
        // Get unique categories for filter dropdown
        const categories = await Todo.distinct('category', { userId });
        
        // Format todos for template
        const formattedTodos = todos.map(todo => {
            const dueDate = todo.dueDate ? new Date(todo.dueDate) : null;
            const today = new Date();
            
            return {
                ...todo,
                formattedDueDate: dueDate ? dueDate.toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                    year: dueDate.getFullYear() !== today.getFullYear() ? 'numeric' : undefined
                }) : null,
                isToday: dueDate ? dueDate.toDateString() === today.toDateString() : false,
                isOverdue: dueDate ? dueDate < today && !['completed'].includes(todo.status) : false,
                daysUntilDue: dueDate ? Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24)) : null,
                priorityColor: {
                    high: 'danger',
                    medium: 'warning',
                    low: 'success'
                }[todo.priority] || 'secondary',
                statusColor: {
                    pending: 'warning',
                    'in-progress': 'info',
                    completed: 'success'
                }[todo.status] || 'secondary'
            };
        });
        
        res.render('todos/index', {
            title: 'Todo Manager',
            activeTab: 'todos',
            user: req.session.user,
            todos: formattedTodos,
            counts,
            categories,
            filters: {
                current: filter,
                priority,
                category,
                sort,
                search,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages,
                totalTodos,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1,
                nextPage: parseInt(page) + 1,
                prevPage: parseInt(page) - 1
            }
        });
    } catch (error) {
        console.error('Error loading todos page:', error);
        res.render('error', { 
            error: 'Failed to load todos. Please try again.',
            title: 'Error'
        });
    }
});

// Create todo page
router.get('/new', (req, res) => {
    res.render('todos/new', {
        title: 'Create New Task',
        activeTab: 'todos',
        user: req.session.user
    });
});

// Edit todo page
router.get('/edit/:id', async (req, res) => {
    try {
        const todo = await Todo.findOne({
            _id: req.params.id,
            userId: getUserId(req)
        }).lean();
        
        if (!todo) {
            return res.status(404).render('error', {
                title: 'Not Found',
                error: 'Task not found'
            });
        }
        
        res.render('todos/edit', {
            title: 'Edit Task',
            activeTab: 'todos',
            user: req.session.user,
            todo
        });
    } catch (error) {
        console.error('Error loading edit page:', error);
        res.render('error', {
            title: 'Error',
            error: 'Failed to load task for editing'
        });
    }
});

// ========== API ROUTES ==========

// Create new todo
router.post('/api', async (req, res) => {
    try {
        const { title, description, dueDate, priority, category, tags } = req.body;
        
        if (!title || title.trim() === '') {
            return res.status(400).json({
                success: false,
                message: 'Task title is required'
            });
        }
        
        const todo = new Todo({
            userId: getUserId(req),
            title: title.trim(),
            description: description?.trim() || '',
            dueDate: dueDate || null,
            priority: priority || 'medium',
            category: category?.trim() || 'general',
            tags: tags ? tags.split(',').map(tag => tag.trim()) : [],
            status: 'pending'
        });
        
        await todo.save();
        
        res.json({
            success: true,
            message: 'Task created successfully',
            todo
        });
    } catch (error) {
        console.error('Error creating todo:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create task'
        });
    }
});

// Update todo
router.put('/api/:id', async (req, res) => {
    try {
        const { title, description, dueDate, priority, category, status, tags } = req.body;
        
        const todo = await Todo.findOneAndUpdate(
            {
                _id: req.params.id,
                userId: getUserId(req)
            },
            {
                title: title?.trim(),
                description: description?.trim(),
                dueDate,
                priority,
                category: category?.trim(),
                status,
                tags: tags ? tags.split(',').map(tag => tag.trim()) : undefined,
                updatedAt: new Date()
            },
            { new: true, runValidators: true }
        );
        
        if (!todo) {
            return res.status(404).json({
                success: false,
                message: 'Task not found'
            });
        }
        
        res.json({
            success: true,
            message: 'Task updated successfully',
            todo
        });
    } catch (error) {
        console.error('Error updating todo:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update task'
        });
    }
});

// Update todo status
router.patch('/api/:id/status', async (req, res) => {
    try {
        const { status } = req.body;
        
        if (!['pending', 'in-progress', 'completed'].includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid status'
            });
        }
        
        const updateData = { status, updatedAt: new Date() };
        
        if (status === 'completed') {
            updateData.completedAt = new Date();
        } else {
            updateData.completedAt = null;
        }
        
        const todo = await Todo.findOneAndUpdate(
            {
                _id: req.params.id,
                userId: getUserId(req)
            },
            updateData,
            { new: true }
        );
        
        if (!todo) {
            return res.status(404).json({
                success: false,
                message: 'Task not found'
            });
        }
        
        res.json({
            success: true,
            message: `Task marked as ${status}`,
            todo
        });
    } catch (error) {
        console.error('Error updating todo status:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update task status'
        });
    }
});

// Delete todo
router.delete('/api/:id', async (req, res) => {
    try {
        const todo = await Todo.findOneAndDelete({
            _id: req.params.id,
            userId: getUserId(req)
        });
        
        if (!todo) {
            return res.status(404).json({
                success: false,
                message: 'Task not found'
            });
        }
        
        res.json({
            success: true,
            message: 'Task deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting todo:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete task'
        });
    }
});

// Bulk operations
router.post('/api/bulk', async (req, res) => {
    try {
        const { action, todoIds } = req.body;
        const userId = getUserId(req);
        
        if (!['complete', 'delete'].includes(action) || !Array.isArray(todoIds) || todoIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid bulk operation'
            });
        }
        
        let result;
        if (action === 'complete') {
            result = await Todo.updateMany(
                {
                    _id: { $in: todoIds },
                    userId
                },
                {
                    status: 'completed',
                    completedAt: new Date(),
                    updatedAt: new Date()
                }
            );
        } else if (action === 'delete') {
            result = await Todo.deleteMany({
                _id: { $in: todoIds },
                userId
            });
        }
        
        res.json({
            success: true,
            message: `Bulk ${action} completed successfully`,
            count: result.modifiedCount || result.deletedCount
        });
    } catch (error) {
        console.error('Error in bulk operation:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to perform bulk operation'
        });
    }
});

// Get todo statistics
router.get('/api/stats', async (req, res) => {
    try {
        const userId = getUserId(req);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        const [
            total,
            pending,
            inProgress,
            completed,
            overdue,
            dueToday,
            byPriority,
            byCategory
        ] = await Promise.all([
            Todo.countDocuments({ userId }),
            Todo.countDocuments({ userId, status: 'pending' }),
            Todo.countDocuments({ userId, status: 'in-progress' }),
            Todo.countDocuments({ userId, status: 'completed' }),
            Todo.countDocuments({
                userId,
                status: { $in: ['pending', 'in-progress'] },
                dueDate: { $lt: new Date() }
            }),
            Todo.countDocuments({
                userId,
                status: { $in: ['pending', 'in-progress'] },
                dueDate: { $gte: today, $lt: tomorrow }
            }),
            Todo.aggregate([
                { $match: { userId } },
                { $group: { _id: '$priority', count: { $sum: 1 } } }
            ]),
            Todo.aggregate([
                { $match: { userId } },
                { $group: { _id: '$category', count: { $sum: 1 } } },
                { $sort: { count: -1 } },
                { $limit: 10 }
            ])
        ]);
        
        // Calculate completion rate
        const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
        
        // Format priority stats
        const priorityStats = {
            high: byPriority.find(p => p._id === 'high')?.count || 0,
            medium: byPriority.find(p => p._id === 'medium')?.count || 0,
            low: byPriority.find(p => p._id === 'low')?.count || 0
        };
        
        res.json({
            success: true,
            stats: {
                total,
                pending,
                inProgress,
                completed,
                overdue,
                dueToday,
                completionRate,
                priority: priorityStats,
                categories: byCategory
            }
        });
    } catch (error) {
        console.error('Error getting todo stats:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get statistics'
        });
    }
});

module.exports = router;