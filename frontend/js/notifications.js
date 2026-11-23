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
                top: 72px; 
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
            'warning': '#4a3a1a',
            'info': '#1a3a4a'
        }[type] || '#1a3a4a';
        
        const textColor = {
            'success': '#31a651',
            'error': '#ff6b6b',
            'warning': '#ffd166',
            'info': '#87ceeb'
        }[type] || '#87ceeb';
        
        const icon = {
            'success': '✅',
            'error': '❌',
            'warning': '⚠️',
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

    showAction(message, type = 'info', actionLabel = 'Action', onAction = null, duration = 10000, secondaryLabel = null, onSecondary = null) {
        const notificationId = 'notification-' + Date.now();

        const bgColor = {
            'success': '#1f4620',
            'error': '#3a1a1a',
            'warning': '#4a3a1a',
            'info': '#1a3a4a'
        }[type] || '#1a3a4a';

        const textColor = {
            'success': '#31a651',
            'error': '#ff6b6b',
            'warning': '#ffd166',
            'info': '#87ceeb'
        }[type] || '#87ceeb';

        const icon = {
            'success': '✅',
            'error': '❌',
            'warning': '⚠️',
            'info': '📨'
        }[type] || '📨';

        const actionId = `${notificationId}-action`;
        const secondaryId = `${notificationId}-secondary`;

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
                max-width: 430px;
                word-wrap: break-word;
            ">
                <div>${icon} ${escapeHtml(message)}</div>
                <div style="margin-top: 10px; display: flex; justify-content: flex-end; gap: 8px;">
                    <button id="${actionId}" type="button" style="
                        border: 1px solid ${textColor};
                        background: transparent;
                        color: ${textColor};
                        border-radius: 4px;
                        padding: 4px 10px;
                        font-size: 0.85rem;
                        cursor: pointer;
                    ">${escapeHtml(actionLabel)}</button>
                    ${secondaryLabel ? `<button id="${secondaryId}" type="button" style="border: 1px solid ${textColor}; background: transparent; color: ${textColor}; border-radius: 4px; padding: 4px 10px; font-size: 0.85rem; cursor: pointer;">${escapeHtml(secondaryLabel)}</button>` : ''}
                </div>
            </div>
        `;

        this.container.insertAdjacentHTML('beforeend', html);

        const actionBtn = document.getElementById(actionId);
        if (actionBtn) {
            actionBtn.addEventListener('click', () => {
                try {
                    if (typeof onAction === 'function') {
                        onAction();
                    }
                } finally {
                    const el = document.getElementById(notificationId);
                    if (el) el.remove();
                }
            });
        }
        if (secondaryLabel) {
            const secondaryBtn = document.getElementById(secondaryId);
            if (secondaryBtn) {
                secondaryBtn.addEventListener('click', () => {
                    try {
                        if (typeof onSecondary === 'function') {
                            onSecondary();
                        }
                    } finally {
                        const el = document.getElementById(notificationId);
                        if (el) el.remove();
                    }
                });
            }
        }

        if (duration > 0) {
            setTimeout(() => {
                const el = document.getElementById(notificationId);
                if (el) {
                    el.style.opacity = '0';
                    el.style.transition = 'opacity 0.3s';
                    setTimeout(() => el.remove(), 300);
                }
            }, duration);
        }
    }

    success(message, duration = 3000) {
        this.show(message, 'success', duration);
    }

    error(message, duration = 3000) {
        this.show(message, 'error', duration);
    }

    warning(message, duration = 3000) {
        this.show(message, 'warning', duration);
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
