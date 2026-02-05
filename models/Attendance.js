// models/Attendance.js
const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true
    },
    subject: {
        type: String,
        required: true,
        trim: true
    },
    totalClasses: {
        type: Number,
        default: 0,
        min: 0
    },
    attendedClasses: {
        type: Number,
        default: 0,
        min: 0
    }
}, {
    timestamps: true
});

// Virtual for percentage (calculated on the fly)
attendanceSchema.virtual('percentage').get(function() {
    if (this.totalClasses === 0) return 0;
    const perc = (this.attendedClasses / this.totalClasses) * 100;
    return Math.round(perc * 10) / 10; // One decimal place
});

// Virtual for status
attendanceSchema.virtual('status').get(function() {
    const perc = this.percentage;
    if (perc >= 75) return 'safe';
    if (perc >= 60) return 'atRisk';
    return 'critical';
});

// Enable virtuals in toJSON and toObject
attendanceSchema.set('toJSON', { virtuals: true });
attendanceSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Attendance', attendanceSchema);