/**
 * Authentication and Security Middlewares
 */

/**
 * Check if user is authenticated via session
 */
const isAuthenticated = (req, res, next) => {
    if (req.session && req.session.user) {
        return next();
    }

    // Check if it's an API request or a page request
    if (req.xhr || req.headers.accept.indexOf('json') > -1) {
        return res.status(401).json({
            success: false,
            message: 'Unauthorized: Please log in'
        });
    }

    res.redirect('/login');
};

/**
 * Check if user is NOT authenticated (for login/register pages)
 */
const isNotAuthenticated = (req, res, next) => {
    if (!req.session || !req.session.user) {
        return next();
    }
    res.redirect('/dashboard');
};

/**
 * Role-based access control (Future proofing)
 */
const authorize = (roles = []) => {
    if (typeof roles === 'string') {
        roles = [roles];
    }

    return (req, res, next) => {
        if (!req.session.user || (roles.length && !roles.includes(req.session.user.role))) {
            return res.status(403).json({
                success: false,
                message: 'Forbidden: You do not have permission'
            });
        }
        next();
    };
};

module.exports = {
    isAuthenticated,
    isNotAuthenticated,
    authorize
};
