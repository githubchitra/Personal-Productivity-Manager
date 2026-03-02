const mongoose = require('mongoose');
require('dotenv').config();
const EmailNotification = require('./models/EmailNotification');

async function cleanup() {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/college-portal');
        console.log('Connected to MongoDB');

        const allowedKeywords = ['job', 'jobs', 'internship', 'internships', 'hackathon', 'college', 'placement', 'career'];

        // Find all emails
        const emails = await EmailNotification.find({});
        console.log(`Checking ${emails.length} emails...`);

        let deletedCount = 0;
        for (const email of emails) {
            const subjectLower = (email.subject || '').toLowerCase();
            const fromLower = (email.from?.email || '').toLowerCase();
            const hasRequiredKeyword = allowedKeywords.some(keyword => subjectLower.includes(keyword));

            // Delete if no keyword OR if from pinterest/social
            const isSocial = /pinterest|facebook|instagram|twitter|linkedin/.test(fromLower) ||
                /pinterest|facebook|instagram|twitter|linkedin/.test(subjectLower);

            if (!hasRequiredKeyword || isSocial) {
                await EmailNotification.findByIdAndDelete(email._id);
                deletedCount++;
                console.log(`🗑️ Deleted: ${email.subject}`);
            }
        }

        console.log(`Done! Deleted ${deletedCount} irrelevant emails.`);
        process.exit(0);
    } catch (err) {
        console.error('Cleanup error:', err);
        process.exit(1);
    }
}

cleanup();
