const mongoose = require('mongoose');

const dailyEntrySchema = new mongoose.Schema({
    date: {
        type: Date,
        required: true,
        default: Date.now
    },
    description: {
        type: String,
        required: true,
        trim: true
    },
    timeSpent: {
        type: Number, // in minutes
        default: 0,
        min: 0
    },
    quantity: {
        type: Number, // for things like "5 problems", "3 chapters"
        default: 0,
        min: 0
    },
    unit: {
        type: String,
        trim: true
    },
    notes: {
        type: String,
        trim: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

const progressTrackerSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    title: {
        type: String,
        required: true,
        trim: true
    },
    category: {
        type: String,
        trim: true,
        default: 'General'
    },
    description: {
        type: String,
        trim: true
    },
    target: {
        type: Number, // Target quantity (e.g., 100 problems, 30 days)
        default: 0
    },
    unit: {
        type: String, // e.g., "problems", "hours", "chapters"
        trim: true
    },
    color: {
        type: String,
        default: '#0d6efd' // Bootstrap primary color
    },
    icon: {
        type: String,
        default: 'bi-check-circle'
    },
    dailyEntries: [dailyEntrySchema], // Array of daily entries
    streak: {
        type: Number,
        default: 0
    },
    lastUpdated: {
        type: Date,
        default: Date.now
    },
    status: {
        type: String,
        enum: ['active', 'completed', 'paused'],
        default: 'active'
    },
    isPublic: {
        type: Boolean,
        default: false
    },
    // New fields for student skill/progress
    assignmentsCompleted: { type: Number, default: 0 },
    totalAssignments: { type: Number, default: 0 },
    currentMarks: { type: Number, default: 0 },
    totalPossibleMarks: { type: Number, default: 0 },
    learningHoursGoal: { type: Number, default: 0 },
    learningHoursSpent: { type: Number, default: 0 },
    topicsCovered: [String],
    skillLevel: { type: Number, default: 0, min: 0, max: 100 }, // 0 to 100%
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Index for faster queries
progressTrackerSchema.index({ userId: 1, createdAt: -1 });
progressTrackerSchema.index({ userId: 1, category: 1 });

module.exports = mongoose.model('ProgressTracker', progressTrackerSchema);