const express = require('express');
const router = express.Router();
const User = require('../models/User');
const bcrypt = require('bcryptjs');

// In routes/auth.js, make sure you have:
router.get('/', (req, res) => {
    if (req.session.user) {
        return res.redirect('/dashboard');
    }
    res.render('home', { title: 'Welcome' });
});

// Login page
router.get('/login', (req, res) => {
    res.render('auth/login', { title: 'Login' });
});

// In auth.js - Update the login success part
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        console.log('Login attempt for username:', username);
        
        // Find user by username
        const user = await User.findOne({ username: username.trim() });
        
        if (!user) {
            console.log('No user found with username:', username);
            req.session.error = 'User not found';
            return res.redirect('/login');
        }
        
        console.log('User found:', user.username);
        
        // Check password
        const isValidPassword = await user.comparePassword(password);
        
        if (!isValidPassword) {
            console.log('Invalid password for user:', user.username);
            req.session.error = 'Invalid password';
            return res.redirect('/login');
        }
        
        // Set session data
        req.session.user = {
            _id: user._id,
            id: user._id,
            username: user.username,
            email: user.email,
            college: user.college,
            semester: user.semester
        };
        
        console.log('Session set for user:', req.session.user.username);
        console.log('Session ID:', req.sessionID);
        
        // Force session save with callback
        req.session.save((saveErr) => {
            if (saveErr) {
                console.error('❌ Session save error:', saveErr);
                req.session.error = 'Login failed - session error';
                return res.redirect('/login');
            }
            
            console.log('✅ Session saved successfully');
            console.log('✅ Login successful, redirecting to /dashboard');
            
            // Add timestamp to prevent caching issues
            const timestamp = Date.now();
            res.redirect(`/dashboard?t=${timestamp}`);
        });
        
    } catch (error) {
        console.error('Login error:', error);
        req.session.error = 'Login failed';
        res.redirect('/login');
    }
});

// Register page
router.get('/register', (req, res) => {
    res.render('auth/register', { title: 'Register' });
});

// Register handle
router.post('/register', async (req, res) => {
    try {
        const { username, email, password, confirmPassword, college, semester } = req.body;
        
        console.log('Registration attempt for:', username, email); // Debug
        
        // Check required fields
        if (!username || !email || !password) {
            return res.render('auth/register', {
                error: 'Username, email and password are required',
                title: 'Register',
                username,
                email,
                college,
                semester
            });
        }
        
        if (password !== confirmPassword) {
            return res.render('auth/register', {
                error: 'Passwords do not match',
                title: 'Register',
                username,
                email,
                college,
                semester
            });
        }
        
        // Check if username or email already exists
        const existingUser = await User.findOne({ 
            $or: [{ username }, { email: email.toLowerCase() }] 
        });
        
        if (existingUser) {
            let errorMsg = 'Username or email already exists';
            if (existingUser.username === username) {
                errorMsg = 'Username already taken';
            } else if (existingUser.email === email.toLowerCase()) {
                errorMsg = 'Email already registered';
            }
            
            return res.render('auth/register', {
                error: errorMsg,
                title: 'Register',
                username,
                email,
                college,
                semester
            });
        }
        
        // Create new user
        const user = new User({
            username,
            email: email.toLowerCase(),
            password,
            college: college || '',
            semester: semester || 1
        });
        
        await user.save();
        console.log('User created:', user.username); // Debug
        
        // Set session - same structure as login
        req.session.user = {
            _id: user._id,
            id: user._id,
            username: user.username,
            email: user.email,
            college: user.college,
            semester: user.semester
        };
        
        // Save session
        req.session.save((err) => {
            if (err) {
                console.error('Session save error on register:', err);
                req.session.error = 'Registration successful but login failed';
                return res.redirect('/login');
            }
            console.log('Registration successful, redirecting to dashboard');
            res.redirect('/dashboard');
        });
        
    } catch (err) {
        console.error('Registration error:', err);
        res.render('auth/register', {
            error: 'Registration failed: ' + err.message,
            title: 'Register',
            username: req.body.username,
            email: req.body.email,
            college: req.body.college,
            semester: req.body.semester
        });
    }
});

// Logout
router.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

module.exports = router;