// models/Todo.js
const mongoose = require('mongoose');

const todoSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    title: {
        type: String,
        required: [true, 'Task title is required'],
        trim: true,
        minlength: [3, 'Task title must be at least 3 characters']
    },
    description: {
        type: String,
        trim: true,
        default: ''
    },
    status: {
        type: String,
        enum: ['pending', 'in-progress', 'completed'],
        default: 'pending'
    },
    priority: {
        type: String,
        enum: ['low', 'medium', 'high'],
        default: 'medium'
    },
    category: {
        type: String,
        trim: true,
        default: 'general'
    },
    tags: [{
        type: String,
        trim: true
    }],
    dueDate: {
        type: Date
    },
    completedAt: {
        type: Date
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    },
    // For recurring tasks
    isRecurring: {
        type: Boolean,
        default: false
    },
    recurrencePattern: {
        type: String,
        enum: ['daily', 'weekly', 'monthly', 'yearly', null],
        default: null
    },
    subtasks: [{
        title: String,
        completed: {
            type: Boolean,
            default: false
        },
        createdAt: {
            type: Date,
            default: Date.now
        }
    }],
    attachments: [{
        filename: String,
        path: String,
        mimetype: String,
        size: Number,
        uploadedAt: {
            type: Date,
            default: Date.now
        }
    }]
});

// Update updatedAt timestamp on save
todoSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    
    // Set completedAt when status changes to completed
    if (this.isModified('status') && this.status === 'completed' && !this.completedAt) {
        this.completedAt = new Date();
    }
    
    // Clear completedAt when status changes from completed
    if (this.isModified('status') && this.status !== 'completed' && this.completedAt) {
        this.completedAt = null;
    }
    
    next();
});

// Virtual for checking if task is overdue
todoSchema.virtual('isOverdue').get(function() {
    if (!this.dueDate || this.status === 'completed') return false;
    return new Date() > this.dueDate;
});

// Virtual for getting days until due
todoSchema.virtual('daysUntilDue').get(function() {
    if (!this.dueDate) return null;
    const today = new Date();
    const dueDate = new Date(this.dueDate);
    const diffTime = dueDate - today;
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// Virtual for completion percentage (based on subtasks)
todoSchema.virtual('completionPercentage').get(function() {
    if (!this.subtasks || this.subtasks.length === 0) {
        return this.status === 'completed' ? 100 : 0;
    }
    
    const completedSubtasks = this.subtasks.filter(st => st.completed).length;
    return Math.round((completedSubtasks / this.subtasks.length) * 100);
});

// Indexes for better query performance
todoSchema.index({ userId: 1, status: 1 });
todoSchema.index({ userId: 1, dueDate: 1 });
todoSchema.index({ userId: 1, priority: 1 });
todoSchema.index({ userId: 1, createdAt: -1 });
todoSchema.index({ userId: 1, category: 1 });

// Instance method to mark as complete
todoSchema.methods.markComplete = function() {
    this.status = 'completed';
    this.completedAt = new Date();
    return this.save();
};

// Instance method to add subtask
todoSchema.methods.addSubtask = function(title) {
    this.subtasks.push({ title });
    return this.save();
};

// Static method to get overdue todos for a user
todoSchema.statics.findOverdue = function(userId) {
    const today = new Date();
    return this.find({
        userId,
        status: { $in: ['pending', 'in-progress'] },
        dueDate: { $lt: today }
    });
};

// Static method to get today's todos for a user
todoSchema.statics.findToday = function(userId) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    return this.find({
        userId,
        status: { $in: ['pending', 'in-progress'] },
        dueDate: { $gte: today, $lt: tomorrow }
    });
};

// Static method to get todos by priority
todoSchema.statics.findByPriority = function(userId, priority) {
    return this.find({ userId, priority });
};

const Todo = mongoose.model('Todo', todoSchema);

module.exports = Todo;