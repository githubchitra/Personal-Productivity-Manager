const mongoose = require('mongoose');

const studyPreferencesSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true
    },
    dailyAvailableHours: {
        monday: { type: Number, default: 2 },
        tuesday: { type: Number, default: 2 },
        wednesday: { type: Number, default: 2 },
        thursday: { type: Number, default: 2 },
        friday: { type: Number, default: 2 },
        saturday: { type: Number, default: 4 },
        sunday: { type: Number, default: 4 }
    },
    focusSubjects: [{
        subject: String,
        priority: { type: Number, default: 1 } // 1: Low, 2: Medium, 3: High
    }],
    startDate: { type: Date, default: () => new Date('2024-04-14') },
    endDate: { type: Date, default: () => new Date('2024-05-23') }
}, {
    timestamps: true
});

module.exports = mongoose.model('StudyPreferences', studyPreferencesSchema);
