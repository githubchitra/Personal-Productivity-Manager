// models/EmailNotification.js
const mongoose = require('mongoose');

const emailNotificationSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    emailId: {
        type: String,
        required: true,
        unique: true
    },
    from: {
        name: String,
        email: String
    },
    subject: {
        type: String,
        required: true
    },
    snippet: {
        type: String
    },
    body: {
        type: String
    },
    date: {
        type: Date,
        required: true
    },
    category: {
        type: String,
        enum: ['job', 'internship', 'hackathon', 'college', 'important', 'other'],
        default: 'other'
    },
    priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'critical'],
        default: 'medium'
    },
    tags: [{
        type: String,
        trim: true
    }],
    isRead: {
        type: Boolean,
        default: false
    },
    isArchived: {
        type: Boolean,
        default: false
    },
    hasAttachment: {
        type: Boolean,
        default: false
    },
    attachments: [{
        filename: String,
        contentType: String,
        size: Number
    }],
    // For job/internship specific
    company: String,
    position: String,
    deadline: Date,
    location: String,
    stipend: String,
    // For hackathon specific
    hackathonName: String,
    prize: String,
    registrationLink: String,
    // Automatically extracted metadata
    metadata: {
        type: Map,
        of: String
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Indexes
emailNotificationSchema.index({ userId: 1, date: -1 });
emailNotificationSchema.index({ userId: 1, category: 1, isRead: 1 });
emailNotificationSchema.index({ userId: 1, priority: 1 });
emailNotificationSchema.index({ userId: 1, isRead: 1 });

// Pre-save hook
emailNotificationSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    
    // Auto-categorize based on content
    if (!this.category || this.category === 'other') {
        this.autoCategorize();
    }
    
    // Auto-tag based on content
    this.autoTag();
    
    next();
});

// Auto-categorization method
emailNotificationSchema.methods.autoCategorize = function() {
    const content = (this.subject + ' ' + this.body).toLowerCase();
    
    // Job related keywords
    const jobKeywords = ['job', 'career', 'recruitment', 'hiring', 'vacancy', 'position', 'opening'];
    const internshipKeywords = ['internship', 'intern', 'trainee', 'training'];
    const hackathonKeywords = ['hackathon', 'coding competition', 'programming contest', 'tech fest'];
    const collegeKeywords = ['college', 'university', 'campus', 'academic', 'exam', 'result', 'admission'];
    
    if (jobKeywords.some(keyword => content.includes(keyword))) {
        this.category = 'job';
    } else if (internshipKeywords.some(keyword => content.includes(keyword))) {
        this.category = 'internship';
    } else if (hackathonKeywords.some(keyword => content.includes(keyword))) {
        this.category = 'hackathon';
    } else if (collegeKeywords.some(keyword => content.includes(keyword))) {
        this.category = 'college';
    }
    
    // Set priority based on keywords
    const highPriorityKeywords = ['urgent', 'important', 'deadline', 'last date', 'final'];
    const criticalKeywords = ['immediate', 'action required', 'response needed', 'today'];
    
    if (criticalKeywords.some(keyword => content.includes(keyword))) {
        this.priority = 'critical';
    } else if (highPriorityKeywords.some(keyword => content.includes(keyword))) {
        this.priority = 'high';
    }
};

// Auto-tagging method
emailNotificationSchema.methods.autoTag = function() {
    const content = (this.subject + ' ' + this.body).toLowerCase();
    const tags = [];
    
    // Common tags
    const tagKeywords = {
        'remote': ['remote', 'work from home'],
        'full-time': ['full time', 'full-time', 'permanent'],
        'part-time': ['part time', 'part-time'],
        'freelance': ['freelance', 'contract'],
        'stipend': ['stipend', 'salary', 'pay'],
        'on-campus': ['on campus', 'oncampus'],
        'off-campus': ['off campus', 'offcampus'],
        'summer': ['summer internship', 'summer training'],
        'winter': ['winter internship'],
        'paid': ['paid', 'compensation'],
        'unpaid': ['unpaid', 'volunteer']
    };
    
    for (const [tag, keywords] of Object.entries(tagKeywords)) {
        if (keywords.some(keyword => content.includes(keyword))) {
            tags.push(tag);
        }
    }
    
    this.tags = [...new Set([...this.tags, ...tags])];
};

// Static method to get unread count
emailNotificationSchema.statics.getUnreadCount = async function(userId) {
    return this.countDocuments({ userId, isRead: false });
};

// Static method to get by category
emailNotificationSchema.statics.getByCategory = async function(userId, category) {
    return this.find({ userId, category })
        .sort({ date: -1 })
        .limit(50);
};

// Static method to mark as read
emailNotificationSchema.statics.markAsRead = async function(userId, emailIds) {
    return this.updateMany(
        { userId, emailId: { $in: emailIds } },
        { isRead: true, updatedAt: new Date() }
    );
};

// Static method to get today's important emails
emailNotificationSchema.statics.getTodayImportant = async function(userId) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    return this.find({
        userId,
        date: { $gte: today },
        category: { $in: ['job', 'internship', 'hackathon', 'college'] }
    }).sort({ priority: -1, date: -1 }).limit(10);
};

// Add this to your EmailNotification model
emailNotificationSchema.statics.bulkDelete = async function(userId, emailIds) {
    return this.deleteMany({
        userId: userId,
        emailId: { $in: emailIds }
    });
};

const EmailNotification = mongoose.model('EmailNotification', emailNotificationSchema);

module.exports = EmailNotification;