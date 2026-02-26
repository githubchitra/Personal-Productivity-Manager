require('dotenv').config();
const express = require('express');
const exphbs = require('express-handlebars');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const path = require('path');
const handlebars = require('handlebars');
const handlebarsLayouts = require('handlebars-layouts')(handlebars);

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Import routes
const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard'); // UNCOMMENT THIS LINE
const attendanceRoutes = require('./routes/attendance');
const notesRoutes = require('./routes/notes');
const remindersRoutes = require('./routes/reminders');
const progressRoutes = require('./routes/progress');
const todoRoutes = require('./routes/todos');
const emailRoutes = require('./routes/email');

// ==================== ADD THIS MIDDLEWARE ====================
// Authentication middleware
const isAuthenticated = (req, res, next) => {
    console.log('=== AUTH MIDDLEWARE CHECK ===');
    console.log('Path:', req.path);
    console.log('Session user:', req.session?.user?.username);

    if (req.session && req.session.user) {
        console.log('✅ User authenticated:', req.session.user.username);
        return next();
    }
    // Redirect to login if not authenticated
    console.log('❌ User not authenticated, redirecting to login');
    res.redirect('/login');
};

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/college-portal', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000, // 5 second timeout
    connectTimeoutMS: 10000,
});

mongoose.connection.on('connected', () => {
    console.log('✅ Connected to MongoDB');
});

mongoose.connection.on('error', (err) => {
    console.error('❌ MongoDB connection error:', err.message);
    console.log('\n💡 Make sure MongoDB is running:');
    console.log('   Windows: Open Services (services.msc) and start "MongoDB"');
    console.log('   Or run: mongod --dbpath "C:\\data\\db"');
    console.log('   Then restart your app');
});

// Use dashboardRoutes with authentication
//app.use('/dashboard', isAuthenticated, dashboardRoutes);

// Handlebars configuration
const hbs = exphbs.create({
    extname: '.hbs',
    defaultLayout: 'main',
    layoutsDir: path.join(__dirname, 'views/layouts'),
    partialsDir: [
        path.join(__dirname, 'views/partials'),
        path.join(__dirname, 'views/layouts')
    ],
    handlebars: handlebars,
    helpers: {
        // Comparison helpers
        eq: (a, b) => a === b,
        gt: (a, b) => a > b,
        lt: (a, b) => a < b,
        neq: (a, b) => a !== b,
        gte: (a, b) => a >= b,
        lte: (a, b) => a <= b,

        // Format helpers
        formatDate: (date) => {
            if (!date) return 'Not started';
            return new Date(date).toLocaleDateString('en-US', {
                weekday: 'short',
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
        },

        formatNumber: function (num, decimals) {
            if (num === undefined || num === null || isNaN(num)) return '0.00';
            return parseFloat(num).toFixed(decimals || 2);
        },

        now: () => new Date(),

        formatDateISO: (date) => {
            if (!date) return '';
            const d = new Date(date);
            d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
            return d.toISOString().slice(0, 16);
        },

        formatFileSize: function (bytes) {
            if (!bytes && bytes !== 0) return '0 Bytes';
            bytes = Number(bytes);
            if (bytes === 0) return '0 Bytes';

            const k = 1024;
            const sizes = ['Bytes', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            const index = Math.min(i, sizes.length - 1);
            const size = bytes / Math.pow(k, index);

            if (index === 0) {
                return Math.round(bytes) + ' ' + sizes[index];
            }

            let formatted = size.toFixed(2);
            formatted = formatted.replace(/\.00$/, '');
            formatted = formatted.replace(/(\.\d)0$/, '$1');

            return formatted + ' ' + sizes[index];
        },

        formatKB: function (bytes) {
            if (!bytes || bytes === 0) return '0 KB';
            const kb = bytes / 1024;
            return kb.toFixed(2) + ' KB';
        },

        formatMB: function (bytes) {
            if (!bytes || bytes === 0) return '0 MB';
            const mb = bytes / (1024 * 1024);
            return mb.toFixed(2) + ' MB';
        },

        smartFileSize: function (bytes) {
            if (!bytes || bytes === 0) return '0 Bytes';

            const k = 1024;
            const sizes = ['Bytes', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));

            if (i === 0) {
                return bytes + ' ' + sizes[i];
            } else if (i === 1) {
                const kb = bytes / k;
                return (kb < 10 ? kb.toFixed(1) : Math.round(kb)) + ' ' + sizes[i];
            } else if (i === 2) {
                const mb = bytes / (k * k);
                return (mb < 10 ? mb.toFixed(1) : Math.round(mb)) + ' ' + sizes[i];
            } else {
                const gb = bytes / (k * k * k);
                return gb.toFixed(2) + ' ' + sizes[i];
            }
        },

        isPDF: function (fileType) {
            if (!fileType) return false;
            return fileType.toLowerCase() === 'pdf';
        },

        isImage: function (fileType) {
            if (!fileType) return false;
            const imageTypes = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'];
            return imageTypes.includes(fileType.toLowerCase());
        },

        divide: function (a, b) {
            if (!a || !b) return 0;
            return parseFloat((a / b).toFixed(2));
        },

        fileIcon: function (fileType) {
            if (!fileType) return 'bi-file-earmark-text';

            const type = fileType.toLowerCase();
            if (type === 'pdf') return 'bi-file-earmark-pdf-fill';
            if (type === 'doc' || type === 'docx') return 'bi-file-earmark-word-fill';
            if (['jpg', 'jpeg', 'png', 'gif', 'bmp'].includes(type)) return 'bi-file-earmark-image-fill';
            if (type === 'txt') return 'bi-file-earmark-text-fill';
            if (['ppt', 'pptx'].includes(type)) return 'bi-file-earmark-slides-fill';
            if (['xls', 'xlsx'].includes(type)) return 'bi-file-earmark-excel-fill';
            return 'bi-file-earmark-text-fill';
        },

        fileColor: function (fileType) {
            if (!fileType) return 'secondary';

            const type = fileType.toLowerCase();
            if (type === 'pdf') return 'danger';
            if (type === 'doc' || type === 'docx') return 'primary';
            if (['jpg', 'jpeg', 'png', 'gif', 'bmp'].includes(type)) return 'success';
            if (type === 'txt') return 'dark';
            if (['ppt', 'pptx'].includes(type)) return 'warning';
            if (['xls', 'xlsx'].includes(type)) return 'success';
            return 'secondary';
        },

        timeAgo: function (date) {
            if (!date) return 'Just now';
            const seconds = Math.floor((new Date() - new Date(date)) / 1000);

            let interval = Math.floor(seconds / 31536000);
            if (interval >= 1) return interval + ' year' + (interval > 1 ? 's' : '') + ' ago';

            interval = Math.floor(seconds / 2592000);
            if (interval >= 1) return interval + ' month' + (interval > 1 ? 's' : '') + ' ago';

            interval = Math.floor(seconds / 86400);
            if (interval >= 1) return interval + ' day' + (interval > 1 ? 's' : '') + ' ago';

            interval = Math.floor(seconds / 3600);
            if (interval >= 1) return interval + ' hour' + (interval > 1 ? 's' : '') + ' ago';

            interval = Math.floor(seconds / 60);
            if (interval >= 1) return interval + ' minute' + (interval > 1 ? 's' : '') + ' ago';

            return 'Just now';
        },

        formatPercentage: (percentage) => {
            if (percentage === undefined || percentage === null) return '0.0';
            return parseFloat(percentage).toFixed(1);
        },

        formatDateTimeLocal: (date) => {
            if (!date) return '';
            const d = new Date(date);
            d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
            return d.toISOString().slice(0, 16);
        },

        formatDateShort: (date) => {
            if (!date) return '';
            try {
                const d = new Date(date);
                return d.toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric'
                });
            } catch (err) {
                return '';
            }
        },

        progressBar: (percentage) => {
            if (percentage === undefined || percentage === null) percentage = 0;
            const width = Math.min(Math.max(percentage, 0), 100);
            let color = 'bg-danger';

            if (percentage >= 75) {
                color = 'bg-success';
            } else if (percentage >= 60) {
                color = 'bg-warning';
            }

            return new handlebars.SafeString(`
                <div class="progress" style="height: 20px;">
                    <div class="progress-bar ${color}" role="progressbar" 
                         style="width: ${width}%;" 
                         aria-valuenow="${width}" 
                         aria-valuemin="0" 
                         aria-valuemax="100">
                        ${parseFloat(percentage).toFixed(1)}%
                    </div>
                </div>
            `);
        },

        add: (a, b) => a + b,
        subtract: (a, b) => a - b,
        multiply: (a, b) => a * b,
        divide: (a, b) => a / b,

        length: (array) => array ? array.length : 0,

        json: (context) => {
            return JSON.stringify(context, null, 2);
        },

        encodeURIComponent: (str) => {
            return encodeURIComponent(str);
        },

        percentage: (part, total) => {
            if (!total || total === 0) return 0;
            return Math.round((part / total) * 100);
        },

        todayISO: () => {
            const now = new Date();
            const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
            return localDate.toISOString().slice(0, 10);
        },

        getFirst: (array) => {
            return array && array.length > 0 ? array[0] : null;
        },

        isPast: function (date) {
            if (!date) return false;
            try {
                const d = new Date(date);
                const now = new Date();
                return d < now;
            } catch (err) {
                return false;
            }
        },

        isFuture: function (date) {
            if (!date) return false;
            try {
                const d = new Date(date);
                const now = new Date();
                return d > now;
            } catch (err) {
                return false;
            }
        },

        groupEntriesByDate: (entries) => {
            if (!entries || !Array.isArray(entries)) return [];

            const sortedEntries = [...entries].sort((a, b) =>
                new Date(b.date) - new Date(a.date)
            );

            const grouped = {};
            sortedEntries.forEach(entry => {
                const date = new Date(entry.date);
                date.setHours(0, 0, 0, 0);
                const dateKey = date.toISOString().split('T')[0];

                if (!grouped[dateKey]) {
                    grouped[dateKey] = {
                        date: date,
                        entries: []
                    };
                }
                grouped[dateKey].entries.push(entry);
            });

            return Object.values(grouped).sort((a, b) =>
                new Date(b.date) - new Date(a.date)
            );
        },

        formatDateIST: (date) => {
            if (!date || date === 'Invalid Date' || isNaN(new Date(date).getTime())) {
                return 'No date set';
            }
            try {
                const d = new Date(date);
                const istDate = new Date(d.getTime() + (5.5 * 60 * 60 * 1000));

                return istDate.toLocaleDateString('en-IN', {
                    weekday: 'short',
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true,
                    timeZone: 'Asia/Kolkata'
                });
            } catch (err) {
                console.error('Date formatting error:', err, 'Date value:', date);
                return 'Invalid date';
            }
        },

        formatDateISOIST: (date) => {
            if (!date) return '';
            const d = new Date(date);
            const istDate = new Date(d.getTime() + (5.5 * 60 * 60 * 1000));
            return istDate.toISOString().split('T')[0];
        },

        isTodayIST: (date) => {
            if (!date) return false;

            const d = new Date(date);
            const istDate = new Date(d.getTime() + (5.5 * 60 * 60 * 1000));

            const today = new Date();
            const istToday = new Date(today.getTime() + (5.5 * 60 * 60 * 1000));

            istDate.setHours(0, 0, 0, 0);
            istToday.setHours(0, 0, 0, 0);

            return istDate.getTime() === istToday.getTime();
        },

        toIST: (date) => {
            if (!date) return new Date();
            const d = new Date(date);
            return new Date(d.getTime() + (5.5 * 60 * 60 * 1000));
        },

        formatTime: (date) => {
            if (!date) return '';
            try {
                const d = new Date(date);
                const istDate = new Date(d.getTime() + (5.5 * 60 * 60 * 1000));
                return istDate.toLocaleTimeString('en-IN', {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true
                });
            } catch (err) {
                return '';
            }
        },

        formatDateOnly: (date) => {
            if (!date) return '';
            try {
                const d = new Date(date);
                const istDate = new Date(d.getTime() + (5.5 * 60 * 60 * 1000));
                return istDate.toLocaleDateString('en-IN', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                });
            } catch (err) {
                return '';
            }
        },

        currentTimeIST: () => {
            const now = new Date();
            const istNow = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
            return istNow.toLocaleTimeString('en-IN', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            });
        },

        todayISOIST: () => {
            const now = new Date();
            const istNow = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
            return istNow.toISOString().split('T')[0];
        },

        getTodaysEntriesIST: (entries) => {
            if (!entries || !Array.isArray(entries)) return [];

            const now = new Date();
            const istNow = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
            istNow.setHours(0, 0, 0, 0);
            const todayStartUTC = new Date(istNow.getTime() - (5.5 * 60 * 60 * 1000));

            const tomorrowIST = new Date(istNow);
            tomorrowIST.setDate(tomorrowIST.getDate() + 1);
            const tomorrowStartUTC = new Date(tomorrowIST.getTime() - (5.5 * 60 * 60 * 1000));

            return entries.filter(entry => {
                const entryDate = new Date(entry.date);
                return entryDate >= todayStartUTC && entryDate < tomorrowStartUTC;
            }).sort((a, b) => new Date(a.date) - new Date(b.date));
        },

        groupEntriesByDateIST: (entries) => {
            if (!entries || !Array.isArray(entries) || entries.length === 0) {
                return [];
            }

            const grouped = {};
            entries.forEach((entry, index) => {
                try {
                    const entryDate = new Date(entry.date);
                    const istDate = new Date(entryDate.getTime() + (5.5 * 60 * 60 * 1000));
                    istDate.setHours(0, 0, 0, 0);
                    const dateKey = istDate.toISOString().split('T')[0];

                    if (!grouped[dateKey]) {
                        grouped[dateKey] = {
                            date: istDate,
                            entries: []
                        };
                    }
                    grouped[dateKey].entries.push({ ...entry, originalIndex: index });
                } catch (err) {
                    console.error('Error grouping entry:', err);
                }
            });

            Object.values(grouped).forEach(group => {
                group.entries.sort((a, b) => new Date(a.date) - new Date(b.date));
            });

            const result = Object.values(grouped).sort((a, b) =>
                new Date(b.date) - new Date(a.date)
            );

            return result;
        },

        getDayTotalTime: (entries) => {
            if (!entries || !Array.isArray(entries)) return 0;
            return entries.reduce((total, entry) => total + (entry.timeSpent || 0), 0);
        },

        getDayTotalQuantity: (entries) => {
            if (!entries || !Array.isArray(entries)) return 0;
            return entries.reduce((total, entry) => total + (entry.quantity || 0), 0);
        },

        getLastEntryIST: (entries) => {
            if (!entries || !Array.isArray(entries) || entries.length === 0) {
                return null;
            }

            try {
                const sortedEntries = [...entries].sort((a, b) =>
                    new Date(b.date) - new Date(a.date)
                );

                return sortedEntries[0];
            } catch (err) {
                console.error('Error in getLastEntryIST:', err);
                return entries[0] || null;
            }
        },

        sortEntriesByDate: (entries) => {
            if (!entries || !Array.isArray(entries)) return [];

            return [...entries].sort((a, b) =>
                new Date(b.date) - new Date(a.date)
            );
        },

        priorityColor: (priority) => {
            switch (priority) {
                case 'high': return 'danger';
                case 'medium': return 'warning';
                case 'low': return 'info';
                default: return 'secondary';
            }
        },

        isOverdue: (date) => {
            if (!date) return false;
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const dueDate = new Date(date);
            dueDate.setHours(0, 0, 0, 0);
            return dueDate < today;
        },

        isToday: (date) => {
            if (!date) return false;
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const checkDate = new Date(date);
            checkDate.setHours(0, 0, 0, 0);
            return checkDate.getTime() === today.getTime();
        },
        ...handlebarsLayouts,

        range: function (start, end, options) {
            // Handle case where it's called as {{range start end}} without a block
            if (!options || typeof options.fn !== 'function') {
                const arr = [];
                for (let i = start; i < end; i++) {
                    arr.push(i);
                }
                return arr;
            }

            // Handle block usage {{#range start end}}...{{/range}}
            let result = '';
            for (let i = start; i < end; i++) {
                result += options.fn(i);
            }
            return result;
        },

        ifCond: function (v1, operator, v2, options) {
            switch (operator) {
                case '==':
                    return (v1 == v2) ? options.fn(this) : options.inverse(this);
                case '===':
                    return (v1 === v2) ? options.fn(this) : options.inverse(this);
                case '!=':
                    return (v1 != v2) ? options.fn(this) : options.inverse(this);
                case '!==':
                    return (v1 !== v2) ? options.fn(this) : options.inverse(this);
                case '<':
                    return (v1 < v2) ? options.fn(this) : options.inverse(this);
                case '<=':
                    return (v1 <= v2) ? options.fn(this) : options.inverse(this);
                case '>':
                    return (v1 > v2) ? options.fn(this) : options.inverse(this);
                case '>=':
                    return (v1 >= v2) ? options.fn(this) : options.inverse(this);
                case '&&':
                    return (v1 && v2) ? options.fn(this) : options.inverse(this);
                case '||':
                    return (v1 || v2) ? options.fn(this) : options.inverse(this);
                default:
                    return options.inverse(this);
            }
        }
    }
});

app.engine('hbs', hbs.engine);
app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET || 'college-portal-secret-key-2024-change-this',
    resave: false, // Changed to false
    saveUninitialized: false, // Changed to false
    store: MongoStore.create({
        mongoUrl: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/college-portal',
        ttl: 24 * 60 * 60, // 1 day
        autoRemove: 'native',
    }),
    cookie: {
        maxAge: 1000 * 60 * 60 * 24 * 7, // 1 week
        secure: false, // Set to true if using HTTPS
        httpOnly: true,
        sameSite: 'lax'
    }
}));

// Flash messages middleware
app.use((req, res, next) => {
    res.locals.success = req.session.success;
    delete req.session.success;

    res.locals.error = req.session.error;
    delete req.session.error;

    next();
});

// Make user data available to all templates
app.use((req, res, next) => {
    res.locals.user = req.session.user;
    next();
});

// No-cache middleware for authenticated pages
app.use((req, res, next) => {
    if (req.session.user) {
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');
    }
    next();
});

// Debug middleware - Add this temporarily
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    console.log('Session user:', req.session.user ? req.session.user.username : 'No user');
    next();
});

// Routes
app.use('/', authRoutes);
// Note: dashboardRoutes is already mounted above with authentication
app.use('/attendance', isAuthenticated, attendanceRoutes);
app.use('/dashboard', isAuthenticated, dashboardRoutes);
app.use('/notes', isAuthenticated, notesRoutes);
app.use('/reminders', isAuthenticated, remindersRoutes);
app.use('/progress', isAuthenticated, progressRoutes);
app.use('/todos', isAuthenticated, todoRoutes);
app.use('/email', isAuthenticated, emailRoutes);

// Health check route
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
        session: req.session.user ? 'authenticated' : 'not authenticated'
    });
});

// Home route
// Home route - FIXED VERSION
app.get('/', (req, res) => {
    console.log('=== HOME ROUTE ===');
    console.log('Session ID:', req.sessionID);
    console.log('Session user:', req.session.user);
    console.log('Session exists:', !!req.session);

    // If user is logged in, redirect to dashboard
    if (req.session && req.session.user) {
        console.log('User is logged in, redirecting to dashboard');
        return res.redirect('/dashboard');
    }

    console.log('User is not logged in, showing home page');
    // Otherwise, show the homepage/login
    res.render('home', {
        title: 'College Portal',
        layout: 'main'
    });
});

// 404 handler
app.use((req, res, next) => {
    res.status(404).render('404', {
        title: 'Page Not Found',
        user: req.session.user,
        layout: 'main'
    });
});

// Error handler
app.use((err, req, res, next) => {
    console.error('Error:', err.stack);
    res.status(500).render('error', {
        error: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong!',
        title: 'Error',
        user: req.session.user,
        layout: 'main'
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`✅ Server running on http://localhost:${PORT}`);
    console.log(`📊 MongoDB URI: ${process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/college-portal'}`);
    console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
});

console.log('hiiiiiiiiiiiiiiiiiiiiiiiii')