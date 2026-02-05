// ==========================================
// UTILITY FUNCTIONS
// ==========================================

/**
 * Format a date to EST timezone in French
 * @param {string} dateString - ISO date string
 * @returns {string} Formatted date
 */
function formatDateEST(dateString) {
    const date = new Date(dateString);
    return date.toLocaleString('fr-FR', {
        timeZone: 'America/New_York',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

/**
 * Escape HTML special characters
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeHtml(text) {
    if (!text) return '';
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return String(text).replace(/[&<>"']/g, m => map[m]);
}

/**
 * Normalize phone numbers for comparison (10 digits only, no formatting)
 * @param {string} phone - Phone number
 * @returns {string} Normalized phone (10 digits)
 */
function normalizePhone(phone) {
    if (!phone) return '';
    let cleaned = String(phone).replace(/\D/g, '');
    if (cleaned.length === 11 && cleaned.startsWith('1')) {
        cleaned = cleaned.substring(1);
    }
    return cleaned;
}

/**
 * Format phone number for display (+15141234567)
 * @param {string} phone - Phone number
 * @returns {string} Formatted phone
 */
function formatPhoneForDisplay(phone) {
    if (!phone) return 'Inconnu';
    const normalized = normalizePhone(phone);
    if (!normalized || normalized.length !== 10) return String(phone);
    return '+1' + normalized;
}

/**
 * Debounce function
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in ms
 * @returns {Function} Debounced function
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Check if element is visible
 * @param {HTMLElement} el - Element to check
 * @returns {boolean} Is visible
 */
function isElementVisible(el) {
    return el.offsetParent !== null;
}

/**
 * Get safe ID for DOM (remove special characters)
 * @param {string} str - String to convert
 * @returns {string} Safe ID
 */
function getSafeId(str) {
    return String(str).replace(/[^a-zA-Z0-9]/g, '_');
}

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        formatDateEST,
        escapeHtml,
        normalizePhone,
        formatPhoneForDisplay,
        debounce,
        isElementVisible,
        getSafeId
    };
}
