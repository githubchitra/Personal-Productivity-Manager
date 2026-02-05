// models/Note.js (correct filename - not Node.js)
const mongoose = require('mongoose');

const noteSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true
    },
    subject: {
        type: String,
        required: true
    },
    title: {
        type: String,
        required: true
    },
    filename: {
        type: String,
        required: true
    },
    originalName: { // Add this field
        type: String,
        required: true
    },
    fileType: String,
    fileSize: Number,
    uploadDate: {
        type: Date,
        default: Date.now
    },
    shareableLink: String,
    description: String, // Add this field
    tags: [String]
}, {
    timestamps: true
});

module.exports = mongoose.model('Note', noteSchema);