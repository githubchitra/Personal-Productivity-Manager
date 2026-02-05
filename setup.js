const fs = require('fs');
const path = require('path');

console.log('Setting up project structure...');

// Create necessary directories
const dirs = [
    'views/layouts',
    'views/partials', 
    'views/pages',
    'views/auth',
    'views/attendance',
    'views/progress',
    'views/notes',
    'views/reminders',
    'public/css',
    'public/js',
    'models',
    'routes',
    'middlewares',
    'config',
    'services',
    'uploads/notes'
];

dirs.forEach(dir => {
    const dirPath = path.join(__dirname, dir);
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        console.log(`✅ Created: ${dir}`);
    }
});

// Create basic CSS file
const cssPath = path.join(__dirname, 'public/css/style.css');
if (!fs.existsSync(cssPath)) {
    const cssContent = `/* Basic Styles */
body {
    padding-top: 20px;
    background-color: #f8f9fa;
}

.card {
    margin-bottom: 20px;
    box-shadow: 0 2px 4px rgba(0,0,0,.1);
}

.navbar {
    margin-bottom: 20px;
}

.table th {
    background-color: #f8f9fa;
}`;
    fs.writeFileSync(cssPath, cssContent);
    console.log('✅ Created CSS file');
}

// Create basic JS file
const jsPath = path.join(__dirname, 'public/js/main.js');
if (!fs.existsSync(jsPath)) {
    const jsContent = `// Main JavaScript file
console.log('College Portal JS loaded');

// Add any JavaScript functionality here
document.addEventListener('DOMContentLoaded', function() {
    console.log('Document loaded');
});`;
    fs.writeFileSync(jsPath, jsContent);
    console.log('✅ Created JS file');
}

// Create .env file if not exists
const envPath = path.join(__dirname, '.env');
if (!fs.existsSync(envPath)) {
    const envContent = `PORT=3000
MONGODB_URI=mongodb://localhost:27017/college-portal
SESSION_SECRET=college-portal-secret-key-2024
NODE_ENV=development`;
    fs.writeFileSync(envPath, envContent);
    console.log('✅ Created .env file');
}

console.log('\n🎉 Setup complete!');
console.log('Next steps:');
console.log('1. Make sure MongoDB is running: mongod');
console.log('2. Install dependencies: npm install');
console.log('3. Start the server: npm run dev');
console.log('4. Visit: http://localhost:3000');