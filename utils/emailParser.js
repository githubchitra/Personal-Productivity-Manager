// utils/emailParser.js
const cheerio = require('cheerio');

class EmailParser {
    static parseSubject(subject) {
        // Clean subject
        subject = subject || '';
        
        // Remove common prefixes
        const prefixes = ['Re:', 'Fwd:', 'FW:', 'RE:'];
        prefixes.forEach(prefix => {
            if (subject.startsWith(prefix)) {
                subject = subject.slice(prefix.length).trim();
            }
        });
        
        return subject.trim();
    }
    
    static extractCompanyFromEmail(email) {
        if (!email) return '';
        
        // Extract company from email domain
        const domains = {
            'amazon.com': 'Amazon',
            'google.com': 'Google',
            'microsoft.com': 'Microsoft',
            'facebook.com': 'Facebook',
            'apple.com': 'Apple',
            'netflix.com': 'Netflix',
            'adobe.com': 'Adobe',
            'intel.com': 'Intel',
            'oracle.com': 'Oracle',
            'ibm.com': 'IBM',
            'infosys.com': 'Infosys',
            'tcs.com': 'TCS',
            'wipro.com': 'Wipro',
            'accenture.com': 'Accenture',
            'cognizant.com': 'Cognizant'
        };
        
        const domain = email.split('@')[1];
        return domains[domain] || this.extractCompanyFromSubject(email);
    }
    
    static extractCompanyFromSubject(subject) {
        const companyKeywords = [
            'Amazon', 'Google', 'Microsoft', 'Facebook', 'Apple', 'Netflix',
            'Adobe', 'Intel', 'Oracle', 'IBM', 'Infosys', 'TCS', 'Wipro',
            'Accenture', 'Cognizant', 'Deloitte', 'PwC', 'EY', 'KPMG',
            'Goldman', 'Sachs', 'Morgan', 'Stanley', 'JPMorgan', 'Citi'
        ];
        
        for (const keyword of companyKeywords) {
            if (subject.includes(keyword)) {
                return keyword;
            }
        }
        
        return '';
    }
    
    static extractPosition(subject) {
        const positions = [
            'Software Engineer', 'Developer', 'Intern', 'Analyst', 'Designer',
            'Manager', 'Associate', 'Specialist', 'Consultant', 'Engineer',
            'Researcher', 'Trainee', 'Full Stack', 'Backend', 'Frontend',
            'Mobile', 'DevOps', 'Data Scientist', 'ML Engineer', 'AI Engineer'
        ];
        
        subject = subject.toLowerCase();
        for (const position of positions) {
            if (subject.includes(position.toLowerCase())) {
                return position;
            }
        }
        
        return '';
    }
    
    static extractDeadline(content) {
        const deadlinePatterns = [
            /deadline.*?(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})/i,
            /last date.*?(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})/i,
            /apply by.*?(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})/i,
            /closing date.*?(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})/i,
            /(\d{1,2}\/\d{1,2}\/\d{4}).*?deadline/i,
            /deadline.*?(\d{1,2}\/\d{1,2}\/\d{4})/i
        ];
        
        for (const pattern of deadlinePatterns) {
            const match = content.match(pattern);
            if (match) {
                try {
                    const dateStr = match[1];
                    return new Date(dateStr);
                } catch (error) {
                    console.error('Error parsing deadline:', error);
                }
            }
        }
        
        return null;
    }
    
    static extractStipend(content) {
        const stipendPatterns = [
            /stipend.*?(\d[\d,]*\s*(?:₹|Rs\.?|INR|USD|\$|LPA|Lakh))/i,
            /salary.*?(\d[\d,]*\s*(?:₹|Rs\.?|INR|USD|\$|LPA|Lakh))/i,
            /(\d[\d,]*\s*(?:₹|Rs\.?|INR|USD|\$|LPA|Lakh)).*?stipend/i,
            /pay.*?(\d[\d,]*\s*(?:₹|Rs\.?|INR|USD|\$|LPA|Lakh))/i
        ];
        
        for (const pattern of stipendPatterns) {
            const match = content.match(pattern);
            if (match) {
                return match[1].trim();
            }
        }
        
        return '';
    }
    
    static extractLocation(content) {
        const locations = [
            'Bangalore', 'Bengaluru', 'Mumbai', 'Delhi', 'Hyderabad', 'Chennai',
            'Pune', 'Gurgaon', 'Noida', 'Remote', 'Work from Home', 'WFH',
            'On-site', 'Hybrid', 'USA', 'UK', 'Canada', 'Australia'
        ];
        
        content = content.toLowerCase();
        for (const location of locations) {
            if (content.includes(location.toLowerCase())) {
                return location;
            }
        }
        
        return '';
    }
    
    static parseHtmlBody(html) {
        if (!html) return '';
        
        try {
            const $ = cheerio.load(html);
            
            // Remove scripts, styles, and unnecessary elements
            $('script, style, noscript, meta, link').remove();
            
            // Get text content
            let text = $('body').text();
            
            // Clean up text
            text = text.replace(/\s+/g, ' ').trim();
            text = text.substring(0, 1000); // Limit length
            
            return text;
        } catch (error) {
            console.error('Error parsing HTML:', error);
            return html.substring(0, 1000); // Fallback
        }
    }
    
    static extractMetadata(email) {
        const content = (email.subject + ' ' + email.body).toLowerCase();
        const metadata = new Map();
        
        // Extract key information
        const company = this.extractCompanyFromEmail(email.from?.email) || 
                       this.extractCompanyFromSubject(email.subject);
        if (company) metadata.set('company', company);
        
        const position = this.extractPosition(email.subject);
        if (position) metadata.set('position', position);
        
        const deadline = this.extractDeadline(content);
        if (deadline) metadata.set('deadline', deadline.toISOString());
        
        const stipend = this.extractStipend(content);
        if (stipend) metadata.set('stipend', stipend);
        
        const location = this.extractLocation(content);
        if (location) metadata.set('location', location);
        
        // Check for hackathon
        if (content.includes('hackathon') || content.includes('coding competition')) {
            metadata.set('event_type', 'hackathon');
            
            // Try to extract hackathon name
            const hackathonMatch = content.match(/(?:hackathon|competition).*?["']([^"']+)["']/i);
            if (hackathonMatch) {
                metadata.set('hackathon_name', hackathonMatch[1]);
            }
            
            // Extract prize
            const prizeMatch = content.match(/prize.*?(\d[\d,]*\s*(?:₹|Rs\.?|INR|USD|\$))/i);
            if (prizeMatch) {
                metadata.set('prize', prizeMatch[1]);
            }
        }
        
        return metadata;
    }
}

module.exports = EmailParser;