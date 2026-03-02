// utils/smartFiltering.js
const EmailParser = require('./emailParser');
const whitelistConfig = require('../config/emailWhitelist');

class SmartFiltering {
    constructor() {
        this.categories = {
            HACKATHON: 'hackathon',
            COLLEGE: 'college',
            PLACEMENT: 'placement',
            INTERNSHIP: 'internship',
            JOB: 'job',
            OTHER: 'other'
        };

        this.priorities = {
            CRITICAL: 'critical',
            HIGH: 'high',
            MEDIUM: 'medium',
            LOW: 'low'
        };

        // Use centralized whitelist
        this.whitelist = [...whitelistConfig.emails, ...whitelistConfig.domains];

        // Specific keywords for categorization
        this.keywords = {
            hackathon: [
                'hackathon', 'coding competition', 'codefest', 'techfest',
                'programming contest', 'devpost', 'mlh', 'hackerearth',
                'registration', 'prize pool', 'winners', 'challenge'
            ],
            placement: [
                'placement', 'recruitment', 'campus drive', 'placement cell',
                'placement notice', 'tpc', 'training and placement', 'job fair',
                'aptitude test', 'technical interview', 'hr round'
            ],
            college: [
                'college', 'university', 'exam', 'semester', 'dean', 'department',
                'academic', 'lecture', 'assignment', 'timetable', 'attendance',
                'library', 'scholarship', 'event', 'workshop', 'seminar'
            ],
            internship: [
                'internship', 'intern', 'stipend', 'summer training',
                'trainee', 'temporary position', 'paid internship'
            ],
            job: [
                'job offer', 'salary', 'lpa', 'ctc', 'full time', 'hiring',
                'application status', 'interview scheduled', 'career opportunity'
            ]
        };

        // Exclusion keywords for spam/promotions
        this.spamKeywords = [
            'pinterest', 'facebook', 'instagram', 'twitter', 'linkedin',
            'unsubscribe', 'promotion', 'marketing', 'newsletter', 'ad',
            'discount', 'sale', 'deal', 'limited time offer', 'bank offer',
            'social notification', 'daily digest'
        ];

        // Urgent/High priority markers
        this.urgentMarkers = [
            'urgent', 'immediate', 'deadline tomorrow', 'last date',
            'action required', 'important', 'final reminder', 'missing',
            'critical', 'don\'t miss', 'expiring'
        ];
    }

    /**
     * Categorize an email based on its subject, body, and sender
     */
    categorize(email) {
        const subject = (email.subject || '').toLowerCase();
        const body = (email.body || '').toLowerCase();
        const fromEmail = (email.from?.email || '').toLowerCase();
        const content = subject + ' ' + body;

        // 1. Check for Spam/Promotions first
        if (this.spamKeywords.some(keyword => content.includes(keyword)) &&
            !this.whitelist.some(domain => fromEmail.includes(domain))) {
            return this.categories.OTHER;
        }

        // 2. Check for Placement (Specific high-priority category)
        if (this.keywords.placement.some(keyword => content.includes(keyword)) ||
            subject.includes('placement')) {
            return this.categories.PLACEMENT;
        }

        // 3. Check for Hackathons
        if (this.keywords.hackathon.some(keyword => content.includes(keyword)) ||
            subject.includes('hackathon')) {
            return this.categories.HACKATHON;
        }

        // 4. Check for Internships
        if (this.keywords.internship.some(keyword => content.includes(keyword)) ||
            subject.includes('internship')) {
            return this.categories.INTERNSHIP;
        }

        // 5. Check for Jobs
        if (this.keywords.job.some(keyword => content.includes(keyword)) ||
            subject.includes('job offer')) {
            return this.categories.JOB;
        }

        // 6. Check for College
        if (this.keywords.college.some(keyword => content.includes(keyword)) ||
            this.whitelist.some(domain => fromEmail.endsWith(domain) && (domain.includes('edu') || domain.includes('ac.in')))) {
            return this.categories.COLLEGE;
        }

        return this.categories.OTHER;
    }

    /**
     * Determine importance/priority level
     */
    determinePriority(email, category) {
        const subject = (email.subject || '').toLowerCase();
        const body = (email.body || '').toLowerCase();
        const content = subject + ' ' + body;

        // Critical: Urgent markers + high-priority category
        if (this.urgentMarkers.some(marker => content.includes(marker))) {
            if ([this.categories.PLACEMENT, this.categories.JOB, this.categories.HACKATHON].includes(category)) {
                return this.priorities.CRITICAL;
            }
            return this.priorities.HIGH;
        }

        // High: Placement Cell or Job/Internship offers
        if (category === this.categories.PLACEMENT || category === this.categories.JOB) {
            return this.priorities.HIGH;
        }

        // Medium: Hackathon or Internship
        if (category === this.categories.HACKATHON || category === this.categories.INTERNSHIP) {
            return this.priorities.MEDIUM;
        }

        // Low: Everything else
        return this.priorities.LOW;
    }

    /**
     * Verify if sender is trusted
     */
    isSenderVerified(fromEmail) {
        fromEmail = fromEmail.toLowerCase();
        return this.whitelist.some(domain => fromEmail.includes(domain));
    }

    /**
     * Process email content to extract structured data
     */
    extractInfo(email) {
        const metadata = EmailParser.extractMetadata(email);
        const category = this.categorize(email);
        const priority = this.determinePriority(email, category);
        const isVerified = this.isSenderVerified(email.from?.email || '');

        return {
            category,
            priority,
            isVerified,
            extractedData: Object.fromEntries(metadata)
        };
    }
}

module.exports = new SmartFiltering();
