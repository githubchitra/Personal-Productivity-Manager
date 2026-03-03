const mongoose = require('mongoose');

const StudyPlanSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    weekStartDate: {
        type: Date,
        required: true
    },
    plan: [{
        day: {
            type: String, // e.g., 'Monday'
            required: true
        },
        slots: [{
            subject: String,
            duration: Number, // duration in hours
            startTime: String // e.g., '10:00 AM'
        }]
    }]
}, {
    timestamps: true
});

module.exports = mongoose.model('StudyPlan', StudyPlanSchema);
