// Main JavaScript file

// Form validation and enhancement
document.addEventListener('DOMContentLoaded', function() {
    // Auto-update forms
    const updateForms = document.querySelectorAll('.update-form');
    updateForms.forEach(form => {
        form.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const formData = new FormData(this);
            const response = await fetch(this.action, {
                method: 'POST',
                body: formData
            });
            
            if (response.ok) {
                window.location.reload();
            }
        });
    });
    
    // Attendance prediction enhancement
    const predictionButtons = document.querySelectorAll('.predict-btn');
    predictionButtons.forEach(btn => {
        btn.addEventListener('click', async function() {
            const attendanceId = this.dataset.id;
            // Prediction logic here
        });
    });
    
    // Initialize tooltips
    const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    tooltipTriggerList.map(function(tooltipTriggerEl) {
        return new bootstrap.Tooltip(tooltipTriggerEl);
    });
    
    // Auto-hide alerts after 5 seconds
    const alerts = document.querySelectorAll('.alert');
    alerts.forEach(alert => {
        setTimeout(() => {
            const bsAlert = new bootstrap.Alert(alert);
            bsAlert.close();
        }, 5000);
    });
});

// Utility functions
function formatPercentage(value) {
    return `${parseFloat(value).toFixed(1)}%`;
}

function getStatusColor(percentage) {
    if (percentage >= 75) return '#28a745';
    if (percentage >= 60) return '#ffc107';
    return '#dc3545';
}

// API calls
async function fetchAttendanceData() {
    try {
        const response = await fetch('/api/attendance/stats');
        return await response.json();
    } catch (error) {
        console.error('Error fetching attendance data:', error);
        return null;
    }
}

async function updateProgress(topicId, data) {
    try {
        const response = await fetch(`/api/progress/${topicId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        return await response.json();
    } catch (error) {
        console.error('Error updating progress:', error);
        return null;
    }
}

// Theme switching (optional)
function toggleTheme() {
    const body = document.body;
    body.classList.toggle('dark-mode');
    
    // Save preference to localStorage
    const isDark = body.classList.contains('dark-mode');
    localStorage.setItem('darkMode', isDark);
}

// Load theme preference
if (localStorage.getItem('darkMode') === 'true') {
    document.body.classList.add('dark-mode');
}

// Countdown timer for deadlines
function updateCountdowns() {
    const countdownElements = document.querySelectorAll('.countdown');
    
    countdownElements.forEach(element => {
        const targetDate = new Date(element.dataset.target);
        const now = new Date();
        const diff = targetDate - now;
        
        if (diff <= 0) {
            element.textContent = 'Overdue!';
            element.classList.add('text-danger');
            return;
        }
        
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        
        element.textContent = `${days}d ${hours}h`;
        
        if (days === 0) {
            element.classList.add('text-warning');
        }
    });
}

// Update countdown every minute
setInterval(updateCountdowns, 60000);
updateCountdowns();