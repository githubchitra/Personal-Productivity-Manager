const express = require('express');
const router = express.Router();
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const constants = require('../config/constants');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { isNotAuthenticated } = require('../middlewares/auth');


// Configure Passport Google Strategy
passport.use(new GoogleStrategy({
    clientID: constants.GOOGLE.CLIENT_ID,
    clientSecret: constants.GOOGLE.CLIENT_SECRET,
    callbackURL: constants.GOOGLE.REDIRECT_URI,
    userProfileURL: 'https://www.googleapis.com/oauth2/v3/userinfo'
},
    async (accessToken, refreshToken, profile, done) => {
        try {
            console.log('🔍 Google OAuth Profile received:', profile.displayName || profile.id);
            // Find or create user in your database
            let user = await User.findOne({ googleId: profile.id });

            if (!user) {
                // Check if user exists with same email
                user = await User.findOne({ email: profile.emails[0].value.toLowerCase() });

                if (user) {
                    // Link Google account to existing user
                    user.googleId = profile.id;
                    user.googleAccessToken = accessToken;
                    user.googleRefreshToken = refreshToken;
                    await user.save();
                } else {
                    // Create new user
                    user = new User({
                        username: profile.displayName || profile.emails[0].value.split('@')[0],
                        email: profile.emails[0].value.toLowerCase(),
                        googleId: profile.id,
                        googleAccessToken: accessToken,
                        googleRefreshToken: refreshToken,
                        // Set default values
                        college: '',
                        semester: 1
                    });
                    await user.save();
                }
            } else {
                // Update tokens specifically if user logs in again
                user.googleAccessToken = accessToken;
                if (refreshToken) {
                    user.googleRefreshToken = refreshToken;
                }
                await user.save();
            }
            return done(null, user);
        } catch (error) {
            return done(error, null);
        }
    }
));

// Required for passport session management, though we manually handle session mapping later
passport.serializeUser((user, done) => {
    done(null, user.id);
});
passport.deserializeUser(async (id, done) => {
    try {
        const user = await User.findById(id);
        done(null, user);
    } catch (err) {
        done(err, null);
    }
});

// In routes/auth.js, make sure you have:
router.get('/', (req, res) => {
    if (req.session.user) {
        return res.redirect('/dashboard');
    }
    res.render('home', { title: 'Welcome' });
});

// Login page
router.get('/login', isNotAuthenticated, (req, res) => {
    res.render('auth/login', { title: 'Login' });
});

// Registration Validation Rules
const registerValidation = [
    body('username').trim().isLength({ min: 3 }).withMessage('Username must be at least 3 characters'),
    body('email').isEmail().withMessage('Enter a valid email address').normalizeEmail(),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('confirmPassword').custom((value, { req }) => {
        if (value !== req.body.password) {
            throw new Error('Password confirmation does not match password');
        }
        return true;
    })
];

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
router.post('/register', isNotAuthenticated, registerValidation, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.render('auth/register', {
                error: errors.array()[0].msg,
                title: 'Register',
                ...req.body
            });
        }

        const { username, email, password, college, semester } = req.body;
        console.log('Registration attempt for:', username, email);

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

// Register handle (omitted from display, kept as is) ...

// ======================= GOOGLE AUTH ROUTES =======================

// Initiate Google Login
router.get('/auth/google',
    passport.authenticate('google', {
        scope: ['profile', 'email', 'openid', 'https://www.googleapis.com/auth/gmail.readonly'],
        accessType: 'offline', // Requests a refresh token
        prompt: 'consent', // Forces consent screen to ensure refresh token is returned
        includeGrantedScopes: true // Helps if user has already granted some scopes
    })
);

// Google Auth Callback
router.get('/auth/google/callback',
    passport.authenticate('google', {
        failureRedirect: '/login',
        failureMessage: true
    }),
    (req, res) => {
        // Successful authentication
        req.session.user = {
            _id: req.user._id,
            id: req.user._id,
            username: req.user.username,
            email: req.user.email,
            college: req.user.college,
            semester: req.user.semester,
            // If we got new tokens, store them in the session
            gmailTokens: {
                access_token: req.user.googleAccessToken,
                refresh_token: req.user.googleRefreshToken,
            }
        };

        req.session.save((err) => {
            if (err) {
                console.error("Session save error after Google login:", err);
                return res.redirect('/login');
            }
            res.redirect('/dashboard');
        });
    }
);

// Logout
router.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

module.exports = router;