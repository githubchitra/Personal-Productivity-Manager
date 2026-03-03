const mongoose = require('mongoose');

const reminderSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    title: {
        type: String,
        required: true
    },
    description: String,
    type: {
        type: String,
        enum: ['assignment', 'exam', 'class', 'other'],
        default: 'assignment'
    },
    dueDate: {
        type: Date,
        required: true
    },
    priority: {
        type: String,
        enum: ['low', 'medium', 'high'],
        default: 'medium'
    },
    status: {
        type: String,
        enum: ['pending', 'completed', 'overdue'],
        default: 'pending'
    },
    reminderSent: {
        type: Boolean,
        default: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Indexes
reminderSchema.index({ userId: 1, dueDate: 1 });
reminderSchema.index({ userId: 1, status: 1 });

module.exports = mongoose.model('Reminder', reminderSchema);