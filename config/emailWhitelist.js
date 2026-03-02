// config/emailWhitelist.js

module.exports = {
    // Trusted domains for higher priority and verification
    domains: [
        'edu.in', 'ac.in', 'yourcollege.edu', 'university.edu',
        'google.com', 'microsoft.com', 'amazon.com', 'github.com',
        'hackerrank.com', 'topcoder.com', 'codechef.com',
        'devpost.com', 'mlh.io', 'unstop.com'
    ],

    // Specific trusted email addresses (e.g. your professors, placement cell)
    emails: [
        'placement@yourcollege.edu',
        'career.center@university.edu',
        'dean.academics@college.edu',
        'hr@knowncompany.com',
        'recruitment@topstartup.io'
    ],

    // Keywords for specific sub-categories
    priorityKeywords: {
        urgent: ['urgent', 'important', 'action required', 'immediate', 'deadline'],
        hackathon: ['hackathon', 'competition', 'prize', 'coding challenge'],
        placement: ['placement', 'recruitment', 'campus', 'interview', 'jd'],
        college: ['exam', 'semester', 'results', 'lecture', 'assignment']
    }
};
