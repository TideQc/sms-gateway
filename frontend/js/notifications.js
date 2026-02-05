// ==========================================
// NOTIFICATION SYSTEM
// ==========================================

class NotificationManager {
    constructor() {
        this.container = null;
        this.init();
    }

    init() {
        if (!document.getElementById('notificationContainer')) {
            const container = document.createElement('div');
            container.id = 'notificationContainer';
            container.style.cssText = `
                position: fixed; 
                top: 20px; 
                right: 20px; 
                z-index: 9999;
            `;
            document.body.appendChild(container);
            this.container = container;
        } else {
            this.container = document.getElementById('notificationContainer');
        }
    }

    show(message, type = 'info', duration = 3000) {
        const notificationId = 'notification-' + Date.now();
        
        const bgColor = {
            'success': '#1f4620',
            'error': '#3a1a1a',
            'info': '#1a3a4a'
        }[type] || '#1a3a4a';
        
        const textColor = {
            'success': '#31a651',
            'error': '#ff6b6b',
            'info': '#87ceeb'
        }[type] || '#87ceeb';
        
        const icon = {
            'success': '✅',
            'error': '❌',
            'info': '📨'
        }[type] || '📨';
        
        const html = `
            <div id="${notificationId}" style="
                background-color: ${bgColor};
                color: ${textColor};
                padding: 12px 16px;
                border-radius: 6px;
                margin-bottom: 10px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                border-left: 4px solid ${textColor};
                font-size: 0.95rem;
                max-width: 400px;
                word-wrap: break-word;
            ">
                ${icon} ${escapeHtml(message)}
            </div>
        `;
        
        this.container.insertAdjacentHTML('beforeend', html);
        
        setTimeout(() => {
            const el = document.getElementById(notificationId);
            if (el) {
                el.style.opacity = '0';
                el.style.transition = 'opacity 0.3s';
                setTimeout(() => el.remove(), 300);
            }
        }, duration);
    }

    success(message, duration = 3000) {
        this.show(message, 'success', duration);
    }

    error(message, duration = 3000) {
        this.show(message, 'error', duration);
    }

    info(message, duration = 3000) {
        this.show(message, 'info', duration);
    }
}

const notificationManager = new NotificationManager();

// Helper function for external use
function showNotification(message, type = 'info', duration = 3000) {
    notificationManager.show(message, type, duration);
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { NotificationManager, notificationManager, showNotification };
}
