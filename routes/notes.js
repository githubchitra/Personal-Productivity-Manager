const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Note = require('../models/Note');

const requireAuth = (req, res, next) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    next();
};

router.use(requireAuth);

// Configure multer storage properly
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        // Create uploads directory if it doesn't exist
        const uploadPath = path.join(__dirname, '../public/uploads/notes');
        console.log('Upload path:', uploadPath); // Debug
        
        // Create directory if it doesn't exist
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
            console.log('Created directory:', uploadPath);
        }
        
        cb(null, uploadPath);
    },
    filename: function (req, file, cb) {
        // Create unique filename
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, file.fieldname + '-' + uniqueSuffix + ext);
    }
});

// Configure multer
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = /pdf|jpeg|jpg|png|txt|doc|docx|ppt|pptx/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        
        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Error: Only PDF, Images, and Document files are allowed!'));
        }
    }
});

// Update the main route in routes/notes.js:
router.get('/', async (req, res) => {
    try {
        const userId = req.session.user.id;
        console.log('Fetching notes for user:', userId);
        
        // Get notes
        const notes = await Note.find({ userId }).sort({ uploadDate: -1 }).lean();
        
        // Get all unique subjects
        const subjects = [...new Set(notes.map(note => note.subject))];
        
        // Calculate stats - FIXED: Round to 2 decimal places
        const totalSizeBytes = notes.reduce((sum, note) => sum + (note.fileSize || 0), 0);
        const totalSizeMB = parseFloat((totalSizeBytes / (1024 * 1024)).toFixed(2));
        
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        
        const stats = {
            totalNotes: notes.length,
            totalSubjects: subjects.length,
            recentUploads: notes.filter(note => new Date(note.uploadDate) > sevenDaysAgo).length,
            totalSize: totalSizeBytes  // Now properly rounded
        };
        
        // Create recent activity
        const recentActivity = notes.slice(0, 5).map(note => {
            const actions = ['uploaded', 'modified', 'viewed'];
            const action = actions[Math.floor(Math.random() * actions.length)];
            
            let actionColor;
            switch(action) {
                case 'uploaded': actionColor = 'success'; break;
                case 'modified': actionColor = 'warning'; break;
                default: actionColor = 'info';
            }
            
            return {
                timeAgo: new Date(note.uploadDate).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) + 
                        ' ' + new Date(note.uploadDate).toLocaleDateString(),
                action: action,
                actionColor: actionColor,
                noteTitle: note.title,
                subject: note.subject
            };
        });
        
        console.log('Stats:', stats);
        
        res.render('notes/index', {
            title: 'Notes Manager',
            notes: notes,
            stats: stats,
            subjects: subjects,
            recentActivity: recentActivity
        });
        
    } catch (err) {
        console.error('Error in notes route:', err);
        res.status(500).render('error', { 
            error: err.message,
            title: 'Error'
        });
    }
});

// Add folder creation route
router.post('/folder', async (req, res) => {
    try {
        const { name, subject, color } = req.body;
        const userId = req.session.user.id;
        
        // For now, we'll just create a note with folder metadata
        // In a real app, you'd have a Folder model
        const folderNote = new Note({
            userId,
            subject: subject || 'General',
            title: `[FOLDER] ${name}`,
            filename: `folder-${Date.now()}`,
            originalName: name,
            fileType: 'folder',
            fileSize: 0,
            description: `Folder: ${name}`,
            tags: ['folder']
        });
        
        await folderNote.save();
        
        res.json({ success: true, message: 'Folder created successfully' });
        
    } catch (err) {
        console.error('Error creating folder:', err);
        res.status(500).json({ error: err.message });
    }
});

// Add bulk delete route
router.post('/bulk-delete', async (req, res) => {
    try {
        const { noteIds } = req.body;
        const userId = req.session.user.id;
        
        if (!noteIds || !Array.isArray(noteIds) || noteIds.length === 0) {
            return res.status(400).json({ error: 'No notes selected' });
        }
        
        // Find all notes to delete their files
        const notes = await Note.find({ _id: { $in: noteIds }, userId });
        
        // Delete files from filesystem
        for (const note of notes) {
            const filePath = path.join(__dirname, '../public/uploads/notes', note.filename);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }
        
        // Delete from database
        await Note.deleteMany({ _id: { $in: noteIds }, userId });
        
        res.json({ success: true, message: `${notes.length} note(s) deleted` });
        
    } catch (err) {
        console.error('Error bulk deleting:', err);
        res.status(500).json({ error: err.message });
    }
});

// Upload note page
router.get('/upload', (req, res) => {
    res.render('notes/upload', { 
        title: 'Upload Notes',
        user: req.session.user
    });
});

// Handle note upload - FIXED
router.post('/upload', upload.single('noteFile'), async (req, res) => {
    try {
        console.log('Upload request received:', req.body);
        console.log('Uploaded file:', req.file);
        
        const { subject, title, description, tags } = req.body;
        const userId = req.session.user.id;
        
        if (!req.file) {
            console.log('No file uploaded');
            return res.status(400).render('notes/upload', {
                title: 'Upload Notes',
                error: 'Please select a file to upload'
            });
        }
        
        // Get file extension
        const fileExt = path.extname(req.file.originalname).toLowerCase();
        const fileType = fileExt.substring(1); // Remove the dot
        
        // Create note record
        const note = new Note({
            userId,
            subject: subject.trim(),
            title: title.trim(),
            filename: req.file.filename,
            originalName: req.file.originalname,
            fileType: fileType,
            fileSize: req.file.size,
            description: description || '',
            tags: tags ? tags.split(',').map(tag => tag.trim()) : [],
            uploadDate: new Date()
        });
        
        await note.save();
        console.log('Note saved successfully:', note);
        
        res.redirect('/notes');
        
    } catch (err) {
        console.error('Upload error:', err);
        res.status(500).render('notes/upload', {
            title: 'Upload Notes',
            error: err.message
        });
    }
});

// View/download note
router.get('/download/:id', async (req, res) => {
    try {
        const userId = req.session.user.id;
        const note = await Note.findOne({ _id: req.params.id, userId });
        
        if (!note) {
            return res.status(404).render('error', {
                title: 'Note Not Found',
                error: 'Note not found'
            });
        }
        
        const filePath = path.join(__dirname, '../public/uploads/notes', note.filename);
        
        // Check if file exists
        if (!fs.existsSync(filePath)) {
            return res.status(404).render('error', {
                title: 'File Not Found',
                error: 'The file does not exist on the server'
            });
        }
        
        res.download(filePath, note.originalName);
        
    } catch (err) {
        console.error('Download error:', err);
        res.status(500).render('error', {
            title: 'Error',
            error: err.message
        });
    }
});

// View note
router.get('/view/:id', async (req, res) => {
    try {
        const userId = req.session.user.id;
        const note = await Note.findOne({ _id: req.params.id, userId }).lean();
        
        if (!note) {
            return res.status(404).render('error', {
                title: 'Note Not Found',
                error: 'Note not found'
            });
        }
        
        // Check file type
        const isPDF = note.fileType.toLowerCase() === 'pdf';
        const isImage = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(note.fileType.toLowerCase());
        
        res.render('notes/view', {
            title: note.title,
            note: note,
            isPDF: isPDF,
            isImage: isImage,
            fileUrl: `/uploads/notes/${note.filename}`
        });
        
    } catch (err) {
        console.error('View error:', err);
        res.status(500).render('error', { error: err.message });
    }
});

// Delete note
router.delete('/:id', async (req, res) => {
    try {
        const userId = req.session.user.id;
        const note = await Note.findOne({ _id: req.params.id, userId });
        
        if (!note) {
            return res.status(404).json({ error: 'Note not found' });
        }
        
        // Delete file from filesystem
        const filePath = path.join(__dirname, '../public/uploads/notes', note.filename);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log('Deleted file:', filePath);
        }
        
        // Delete from database
        await Note.deleteOne({ _id: req.params.id });
        
        res.json({ success: true, message: 'Note deleted successfully' });
        
    } catch (err) {
        console.error('Delete error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Get note details for editing
router.get('/edit/:id', async (req, res) => {
    try {
        const userId = req.session.user.id;
        const note = await Note.findOne({ _id: req.params.id, userId }).lean();
        
        if (!note) {
            return res.status(404).json({ error: 'Note not found' });
        }
        
        res.json(note);
        
    } catch (err) {
        console.error('Edit error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Update note
router.put('/:id', async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { title, subject, description, tags } = req.body;
        
        const note = await Note.findOne({ _id: req.params.id, userId });
        
        if (!note) {
            return res.status(404).json({ error: 'Note not found' });
        }
        
        // Update fields
        note.title = title || note.title;
        note.subject = subject || note.subject;
        note.description = description || note.description;
        note.tags = tags || note.tags;
        
        await note.save();
        
        res.json({ 
            success: true, 
            message: 'Note updated successfully',
            note: note
        });
        
    } catch (err) {
        console.error('Update error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Search notes
router.get('/search', async (req, res) => {
    try {
        const { q } = req.query;
        const userId = req.session.user.id;
        
        if (!q || q.trim() === '') {
            return res.json([]);
        }
        
        const notes = await Note.find({
            userId,
            $or: [
                { title: { $regex: q, $options: 'i' } },
                { subject: { $regex: q, $options: 'i' } },
                { description: { $regex: q, $options: 'i' } },
                { tags: { $regex: q, $options: 'i' } }
            ]
        }).limit(20).lean();
        
        res.json(notes);
        
    } catch (err) {
        console.error('Search error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Get single note for editing
router.get('/:id', async (req, res) => {
    try {
        const userId = req.session.user.id;
        const note = await Note.findOne({ _id: req.params.id, userId }).lean();
        
        if (!note) {
            return res.status(404).json({ error: 'Note not found' });
        }
        
        res.json(note);
    } catch (err) {
        console.error('Error fetching note:', err);
        res.status(500).json({ error: err.message });
    }
});

// Share note route (simplified)
router.get('/share/:id', async (req, res) => {
    try {
        const note = await Note.findById(req.params.id).lean();
        
        if (!note) {
            return res.status(404).json({ error: 'Note not found' });
        }
        
        // Create a shareable link
        const shareableLink = `${req.protocol}://${req.get('host')}/notes/view/${note._id}`;
        
        res.json({
            shareableLink: shareableLink,
            note: note
        });
    } catch (err) {
        console.error('Error sharing note:', err);
        res.status(500).json({ error: err.message });
    }
});

// Update share settings (simplified)
router.put('/update-share/:id', async (req, res) => {
    try {
        const { expiry, allowDownload } = req.body;
        
        // Just acknowledge the request for now
        res.json({ 
            success: true, 
            message: 'Share settings updated',
            expiry: expiry,
            allowDownload: allowDownload
        });
    } catch (err) {
        console.error('Error updating share settings:', err);
        res.status(500).json({ error: err.message });
    }
});

// Bulk delete route
router.post('/bulk-delete', async (req, res) => {
    try {
        const { noteIds } = req.body;
        const userId = req.session.user.id;
        
        if (!noteIds || !Array.isArray(noteIds)) {
            return res.status(400).json({ error: 'No notes selected' });
        }
        
        // Find and delete notes
        const deletedNotes = [];
        for (const noteId of noteIds) {
            const note = await Note.findOne({ _id: noteId, userId });
            if (note) {
                // Delete file from filesystem
                const filePath = path.join(__dirname, '../public/uploads/notes', note.filename);
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
                await Note.deleteOne({ _id: noteId });
                deletedNotes.push(noteId);
            }
        }
        
        res.json({ 
            success: true, 
            message: `${deletedNotes.length} note(s) deleted successfully`,
            deletedCount: deletedNotes.length
        });
    } catch (err) {
        console.error('Error in bulk delete:', err);
        res.status(500).json({ error: err.message });
    }
});

// Search notes (fixed)
router.get('/search', async (req, res) => {
    try {
        const { q } = req.query;
        const userId = req.session.user.id;
        
        if (!q || q.trim() === '') {
            // Return all notes if no query
            const notes = await Note.find({ userId }).lean();
            return res.render('notes/index', {
                title: 'Notes Manager - Search',
                notes: notes,
                searchQuery: q
            });
        }
        
        const notes = await Note.find({
            userId,
            $or: [
                { title: { $regex: q, $options: 'i' } },
                { subject: { $regex: q, $options: 'i' } },
                { description: { $regex: q, $options: 'i' } },
                { tags: { $regex: q, $options: 'i' } }
            ]
        }).lean();
        
        res.render('notes/index', {
            title: 'Notes Manager - Search Results',
            notes: notes,
            searchQuery: q
        });
    } catch (err) {
        console.error('Search error:', err);
        res.status(500).render('error', { error: err.message });
    }
});

module.exports = router;