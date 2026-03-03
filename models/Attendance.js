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
    },
    weeklyClassCount: {
        type: Number,
        default: 4,
        min: 1
    },
    threshold: {
        type: Number,
        default: 75,
        min: 0,
        max: 100
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Virtual for percentage
attendanceSchema.virtual('percentage').get(function () {
    if (this.totalClasses === 0) return 0;
    return Math.round((this.attendedClasses / this.totalClasses) * 1000) / 10;
});

// Virtual for classes needed to reach threshold
// needed = ceil((threshold/100 * totalClasses - attendedClasses) / (1 - threshold/100))
attendanceSchema.virtual('classesNeeded').get(function () {
    const p = this.threshold / 100;
    if (this.percentage >= this.threshold) return 0;
    const needed = Math.ceil((p * this.totalClasses - this.attendedClasses) / (1 - p));
    return needed > 0 ? needed : 0;
});

// Method to calculate safe bunkable classes
attendanceSchema.methods.safeBunks = function () {
    const p = this.threshold / 100;
    if (this.percentage < this.threshold) return 0;
    // safeBunks = floor((attendedClasses - p * totalClasses) / p)
    const bunks = Math.floor((this.attendedClasses - p * this.totalClasses) / p);
    return bunks > 0 ? bunks : 0;
};

// Indexes
attendanceSchema.index({ userId: 1, subject: 1 });
attendanceSchema.index({ userId: 1, totalClasses: -1 });

module.exports = mongoose.model('Attendance', attendanceSchema);