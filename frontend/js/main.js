// ==========================================
// MAIN APPLICATION CLASS - cpaSmsApp
// ==========================================

class cpaSmsApp {
    constructor(containerId) {
        this.containerId = containerId;
        this.container = document.querySelector(containerId);
        
        if (!this.container) {
            throw new Error(`Container ${containerId} not found`);
        }

        // State management
        this.state = {
            user: null,
            authToken: localStorage.getItem('authToken'),
            isLoggedIn: false,
            selectedParticipants: {},
            allParticipants: [],
            smsQuickReplyCallbacks: {},
            dataTable: null,
            socket: null,
            filters: {
                parc: [],
                type: [],
                coach: []
            },
            openConversation: null,
            selectedDistributionListId: null,
            distributionLists: [],
            scheduledJobs: [],
            scheduledRecipients: [],
            bulkSendInFlight: false,
            lastBulkArchiveRefreshAt: 0,
            monitoring: {
                summary: null,
                logs: [],
                windowMinutes: 60,
                refreshTimer: null,
                lastBulkReport: null,
                logsDataTable: null,
                logLevelFilter: 'ALL'
            }
        };

        // Sub-modules
        this.login = {};
        this.ui = {};
        this.api = {};
        this.sms = {};
        this.participants = {};
        this.filters = {};
        this.events = {};
    }

    /**
     * Initialize the application
     */
    async init() {
        console.log('🚀 Initializing cpaSmsApp...');

        // Initialize API module
        this._initApi();

        // Initialize UI module
        this._initUI();

        // Initialize Login module
        this._initLogin();

        // Initialize SMS module
        this._initSMS();

        // Initialize Participants module
        this._initParticipants();

        // Check if user is already logged in
        if (this.state.authToken) {
            try {
                await this._verifyToken();
            } catch (err) {
                this._logout();
            }
        } else {
            this._showLogin();
        }
    }

    /**
     * Initialize API module
     */
    _initApi() {
        this.api = {
            baseUrl: CONFIG.API_URL,
            
            /**
             * Make API call
             */
            call: async (endpoint, options = {}) => {
                const url = `${this.api.baseUrl}${endpoint}`;
                const headers = {
                    'Content-Type': 'application/json',
                    ...options.headers
                };

                if (this.state.authToken) {
                    headers['Authorization'] = `Bearer ${this.state.authToken}`;
                }

                try {
                    const response = await fetch(url, {
                        method: options.method || 'GET',
                        headers,
                        body: options.body ? JSON.stringify(options.body) : undefined
                    });

                    const data = await response.json();

                    if (!response.ok) {
                        throw new Error(data.error || 'API Error');
                    }

                    return data;
                } catch (err) {
                    console.error('API Error:', err);
                    throw err;
                }
            },

            /**
             * Login endpoint
             */
            login: async (username, password) => {
                return await this.api.call('/login', {
                    method: 'POST',
                    body: { username, password }
                });
            },

            /**
             * Verify token
             */
            verifyToken: async () => {
                return await this.api.call('/verify-token');
            },

            /**
             * Get participants
             */
            getParticipants: async () => {
                return await this.api.call('/participants');
            },

            /**
             * Get unread SMS
             */
            getUnreadSMS: async () => {
                return await this.api.call('/unread-sms');
            },

            /**
             * Get sent messages archive
             */
            getArchive: async () => {
                return await this.api.call('/sent-messages-archive');
            },

            /**
             * Send bulk SMS
             */
            sendBulkSMS: async (message, data) => {
                return await this.api.call('/send-bulk', {
                    method: 'POST',
                    body: { message, ...data }
                });
            },

            /**
             * Send single SMS
             */
            sendSms: async (data) => {
                return await this.api.call('/send-sms-quick', {
                    method: 'POST',
                    body: {
                        phone: data.phone,
                        message: data.message
                    }
                });
            },

            /**
             * Mark conversation as read
             */
            markConversationRead: async (contactKey, sourceSocketId = null) => {
                return await this.api.call('/mark-conversation-read', {
                    method: 'POST',
                    body: { contactKey, sourceSocketId }
                });
            },

            markAllSmsRead: async () => {
                return await this.api.call('/mark-all-sms-read', { method: 'POST' });
            },

            /**
             * Delete conversations from DB
             */
            deleteConversations: async (contactKeys) => {
                return await this.api.call('/delete-conversations', {
                    method: 'POST',
                    body: { contactKeys }
                });
            },

            /**
             * Mark individual SMS as read
             */
            markSmsAsRead: async (smsId) => {
                return await this.api.call(`/mark-sms-read/${smsId}`, {
                    method: 'POST'
                });
            },

            /**
             * Import Excel file
             */
            importExcel: async (file) => {
                const formData = new FormData();
                formData.append('file', file);

                const response = await fetch(`${this.api.baseUrl}/api/participants/import-excel`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.state.authToken}`
                    },
                    body: formData
                });

                return await response.json();
            },

            /**
             * Check Pixel status
             */
            checkPixelStatus: async () => {
                return await this.api.call('/pixel-status');
            },

            /**
             * Sync unread SMS from Pixel
             */
            syncPixelUnreadOnly: async () => {
                return await this.api.call('/pixel/sync-unread-only', { method: 'POST' });
            },

            /**
             * Sync all SMS from Pixel
             */
            syncPixelAll: async () => {
                return await this.api.call('/pixel/sync-sms', { method: 'POST' });
            },

            getDistributionLists: async () => {
                return await this.api.call('/admin/distribution-lists');
            },

            createDistributionList: async (payload) => {
                return await this.api.call('/admin/distribution-lists', {
                    method: 'POST',
                    body: payload
                });
            },

            updateDistributionList: async (id, payload) => {
                return await this.api.call(`/admin/distribution-lists/${id}`, {
                    method: 'PUT',
                    body: payload
                });
            },

            deleteDistributionList: async (id) => {
                return await this.api.call(`/admin/distribution-lists/${id}`, {
                    method: 'DELETE'
                });
            },

            getDistributionMembers: async (listId) => {
                return await this.api.call(`/admin/distribution-lists/${listId}/members`);
            },

            addDistributionMember: async (listId, payload) => {
                return await this.api.call(`/admin/distribution-lists/${listId}/members`, {
                    method: 'POST',
                    body: payload
                });
            },

            deleteDistributionMember: async (listId, memberId) => {
                return await this.api.call(`/admin/distribution-lists/${listId}/members/${memberId}`, {
                    method: 'DELETE'
                });
            },

            getScheduledJobs: async () => {
                return await this.api.call('/scheduled-jobs');
            },

            createScheduledJob: async (payload) => {
                return await this.api.call('/scheduled-jobs', {
                    method: 'POST',
                    body: payload
                });
            },

            cancelScheduledJob: async (jobId) => {
                return await this.api.call(`/scheduled-jobs/${jobId}/cancel`, {
                    method: 'POST'
                });
            },

            runScheduledJobNow: async (jobId) => {
                return await this.api.call(`/scheduled-jobs/${jobId}/run-now`, {
                    method: 'POST'
                });
            },

            getMonitoringSummary: async (windowMinutes = 60) => {
                return await this.api.call(`/monitoring/summary?windowMinutes=${encodeURIComponent(windowMinutes)}`);
            },

            getMonitoringLogs: async (limit = 200) => {
                return await this.api.call(`/monitoring/logs?limit=${encodeURIComponent(limit)}`);
            }
        };
    }

    /**
     * Initialize UI module
     */
    _initUI() {
        this.ui = {
            /**
             * Render login container
             */
            renderLogin: () => {
                const html = `
                    <div id="loginContainer" class="login-container">
                        <div class="card login-card">
                            <div class="card-body p-4">
                                <div class="login-header">
                                    <img src="images/logo.svg" alt="Logo">
                                    <h1>🔐 Connexion</h1>
                                    <p>SMS Gateway - Cardio Plein Air</p>
                                </div>
                                
                                <form class="login-form" id="loginForm">
                                    <div class="mb-3">
                                        <label class="form-label" for="loginUsername">Nom d'utilisateur</label>
                                        <input type="text" id="loginUsername" name="loginUsername" class="form-control" placeholder="Entrez votre username" required>
                                    </div>
                                    
                                    <div class="mb-3">
                                        <label class="form-label" for="loginPassword">Mot de passe</label>
                                        <div class="input-group login-password-group">
                                            <input type="password" id="loginPassword" name="loginPassword" class="form-control" placeholder="Entrez votre mot de passe" required>
                                            <button type="button" class="btn login-password-toggle" id="toggleLoginPassword" aria-label="Afficher le mot de passe" title="Afficher le mot de passe">👁️</button>
                                        </div>
                                    </div>
                                    
                                    <button type="submit" class="btn btn-login w-100">Connexion</button>
                                    
                                    <div class="login-error" id="loginError"></div>
                                    <div class="login-loading" id="loginLoading">⏳ Connexion en cours...</div>
                                </form>
                            </div>
                        </div>
                    </div>
                `;
                this.container.innerHTML = html;
                return document.querySelector('#loginForm');
            },

            /**
             * Render main app
             */
            renderApp: () => {
                const html = `
                    <div id="mainApp" style="height: 100%; display: flex; flex-direction: column;">
                        <div style="background-color: #151515; border-bottom: 1px solid #222; padding: 12px 20px; display: flex; align-items: center; justify-content: space-between; flex-wrap: nowrap;">
                            <div style="display: flex; align-items: center; gap: 15px;">
                                <img src="images/logo.svg" alt="Logo" style="height: 40px; flex-shrink: 0;">
                                <h2 style="color: #31a651; margin: 0; white-space: nowrap;">🚀 SMS Gateway</h2>
                            </div>
                            <div style="display: flex; align-items: center; gap: 20px; flex-shrink: 0;">
                                <!-- BURGER MENU -->
                                <div class="burger-menu">
                                    <button class="burger-icon" id="burgerToggle" aria-label="Ouvrir le menu administration" aria-expanded="false">
                                        <span></span>
                                        <span></span>
                                        <span></span>
                                    </button>
                                    <div class="burger-dropdown" id="burgerDropdown">
                                        <div class="burger-dropdown-header">
                                            <span class="burger-dropdown-title">Administration</span>
                                            <span class="burger-dropdown-subtitle">SMS Gateway</span>
                                        </div>

                                        <div id="pixelStatusContainer" class="burger-status-card">
                                            <div id="pixelStatusDot" style="width: 8px; height: 8px; border-radius: 50%; background-color: #888; transition: all 0.3s ease; margin-right: 8px;"></div>
                                            <span id="pixelStatusText" style="color: #888; font-size: 0.85rem;">Vérification...</span>
                                        </div>

                                        <div class="burger-user-card">
                                            <div class="burger-user-info">
                                                <span class="burger-user-icon" aria-hidden="true">👤</span>
                                                <div class="burger-user-meta">
                                                    <span class="burger-user-label">Connecté en tant que</span>
                                                    <strong id="loggedUsername" class="burger-user-name"></strong>
                                                </div>
                                            </div>
                                        </div>

                                        <div class="burger-actions">
                                            <button id="btnOpenScheduledModal" class="burger-action-btn" data-bs-toggle="modal" data-bs-target="#adminManagementModal">
                                                <span class="burger-action-icon" aria-hidden="true">🗓️</span>
                                                <span class="burger-action-text">
                                                    <strong>Envoi planifié</strong>
                                                    <small>Créer et suivre vos envois</small>
                                                </span>
                                                <span class="burger-action-arrow" aria-hidden="true">›</span>
                                            </button>

                                            <button id="btnOpenNotificationRecipientsModal" class="burger-action-btn" data-bs-toggle="modal" data-bs-target="#notificationRecipientsModal">
                                                <span class="burger-action-icon" aria-hidden="true">🔔</span>
                                                <span class="burger-action-text">
                                                    <strong>Destinataires notifications</strong>
                                                    <small>Gérer les listes de notifications</small>
                                                </span>
                                                <span class="burger-action-arrow" aria-hidden="true">›</span>
                                            </button>
                                        </div>

                                        <div class="burger-dropdown-footer">
                                            <button id="btnLogout" class="btn btn-logout btn-sm w-100">Déconnexion</button>
                                        </div>
                                    </div>
                                    <div class="burger-backdrop" id="burgerBackdrop"></div>
                                </div>
                            </div>
                        </div>

                        <div id="globalBulkStatusBar" style="display: none; background-color: #12331d; border-bottom: 1px solid #1f5c34; padding: 8px 20px; align-items: center; gap: 12px;">
                            <span id="globalBulkStatusText" style="color: #7fe0a0; font-size: 0.85rem; white-space: nowrap;">Envoi en cours...</span>
                            <div class="progress" style="flex: 1; height: 8px; background-color: #0a0a0a;">
                                <div id="globalBulkStatusBarFill" class="progress-bar" role="progressbar" style="background-color: #31a651; width: 0%"></div>
                            </div>
                        </div>

                        <div class="container-fluid" style="height: calc(100vh - 64px); display: flex; flex-direction: column; padding: 0;">
                            <div class="col-12" id="tabsContainer" style="flex: 1; display: flex; flex-direction: column; overflow: hidden;">
                                <ul class="nav nav-tabs mb-3" id="sendTab">
                                    <li class="nav-item"><button class="nav-link active" id="mass-tab" data-bs-toggle="tab" data-bs-target="#mass-panel">Saisie de masse</button></li>
                                    <li class="nav-item"><button class="nav-link" id="sms-tab" data-bs-toggle="tab" data-bs-target="#sms-panel">SMS <span id="unreadBadge" class="badge bg-danger ms-2" style="display: none;">0</span></button></li>
                                    <li class="nav-item"><button class="nav-link" id="monitoring-tab" data-bs-toggle="tab" data-bs-target="#monitoring-panel">Monitoring</button></li>
                                </ul>
                                <div class="tab-content">
                                    <div class="tab-pane fade show active" id="mass-panel">
                                        <ul class="nav nav-tabs nav-tabs-sm mb-3">
                                            <li class="nav-item"><button class="nav-link active" id="db-tab" data-bs-toggle="tab" data-bs-target="#db-panel">Base de données</button></li>
                                            <li class="nav-item"><button class="nav-link" id="manual-tab" data-bs-toggle="tab" data-bs-target="#manual-panel">Saisie Manuelle</button></li>
                                        </ul>
                                        <div class="tab-content">
                                            <div class="tab-pane fade show active" id="db-panel">
                                                <div style="padding: 15px;">
                                                    <h6>Importation DB</h6>
                                                    <p class="text-muted mb-0">La gestion administration / planification est disponible dans le menu du haut (Administration).</p>
                                                </div>
                                            </div>
                                            <div class="tab-pane fade" id="manual-panel">
                                                <div style="padding: 15px;">
                                                    <h6>Saisie Manuelle</h6>
                                                    <form id="manualSmsForm" style="max-width: 600px;">
                                                        <div class="mb-3">
                                                            <label for="manualNumbers" class="form-label">Numéros de téléphone (séparés par des virgules ou un par ligne) *</label>
                                                            <textarea class="form-control" id="manualNumbers" rows="4" placeholder="5141234567, 5149876543\nou\n5141234567\n5149876543" required style="resize: none; font-family: monospace;"></textarea>
                                                            <small class="text-muted d-block mt-1"><span id="numberCount">0</span> numéro(s) détecté(s)</small>
                                                        </div>
                                                        <button type="submit" class="btn btn-primary" style="background-color: #31a651; border-color: #31a651;">
                                                            📤 Envoyer SMS
                                                        </button>
                                                    </form>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="tab-pane fade" id="sms-panel" style="overflow: auto;">
                                        <div id="smsTabContent">
                                            <div id="archiveSection">
                                                <div id="archiveHeaderRow" class="d-flex justify-content-between align-items-center mb-3">
                                                    <h5 class="text-secondary mb-0">Conversations</h5>
                                                    <div style="position: relative;">
                                                        <button class="btn btn-sm btn-outline-secondary" type="button" id="archiveActionsMenuBtn" aria-expanded="false" title="Options conversations" style="min-width: 36px;">
                                                            ⋮
                                                        </button>
                                                        <div id="archiveActionsMenu" style="display: none; position: absolute; top: calc(100% + 6px); right: 0; width: min(320px, calc(100vw - 16px)); max-height: calc(100vh - 16px); overflow-y: auto; background-color: #151515; border: 1px solid #333; border-radius: 8px; z-index: 4000; padding: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.5);">
                                                            <div class="mb-2">
                                                                <label for="archiveSearch" class="form-label text-muted mb-1" style="font-size: 0.85rem;">Recherche</label>
                                                                <input type="text" id="archiveSearch" class="form-control form-control-sm" placeholder="Rechercher dans les messages..." style="background-color: #0f0f0f; border: 1px solid #333; color: #fff;">
                                                            </div>
                                                            <div class="row g-2 mb-2">
                                                                <div class="col-6">
                                                                    <label for="archiveSearchDateFrom" class="form-label text-muted mb-1" style="font-size: 0.8rem;">Du</label>
                                                                    <input type="date" id="archiveSearchDateFrom" class="form-control form-control-sm" style="background-color: #0f0f0f; border: 1px solid #333; color: #fff;">
                                                                </div>
                                                                <div class="col-6">
                                                                    <label for="archiveSearchDateTo" class="form-label text-muted mb-1" style="font-size: 0.8rem;">Au</label>
                                                                    <input type="date" id="archiveSearchDateTo" class="form-control form-control-sm" style="background-color: #0f0f0f; border: 1px solid #333; color: #fff;">
                                                                </div>
                                                            </div>
                                                            <div class="row g-2 mb-2">
                                                                <div class="col-6">
                                                                    <label for="archiveFilter" class="form-label text-muted mb-1" style="font-size: 0.8rem;">Afficher</label>
                                                                    <select id="archiveFilter" class="form-select form-select-sm" style="background-color: #0f0f0f; border: 1px solid #333; color: #fff;">
                                                                        <option value="all">Toutes</option>
                                                                        <option value="unread">Non lues</option>
                                                                        <option value="favorites">Favorites</option>
                                                                    </select>
                                                                </div>
                                                                <div class="col-6">
                                                                    <label for="archiveSort" class="form-label text-muted mb-1" style="font-size: 0.8rem;">Trier par</label>
                                                                    <select id="archiveSort" class="form-select form-select-sm" style="background-color: #0f0f0f; border: 1px solid #333; color: #fff;">
                                                                        <option value="newest">Plus récentes</option>
                                                                        <option value="oldest">Plus anciennes</option>
                                                                        <option value="unread">Non lues d'abord</option>
                                                                        <option value="favorites">Favorites d'abord</option>
                                                                        <option value="name">Nom</option>
                                                                    </select>
                                                                </div>
                                                            </div>
                                                            <button type="button" id="archiveSearchReset" class="btn btn-sm btn-outline-secondary w-100 mb-2">↺ Réinitialiser filtres</button>
                                                            <button type="button" id="archiveMarkAllRead" class="btn btn-sm btn-outline-success w-100 mb-2">Marquer tout comme lu</button>
                                                            <button type="button" id="archiveToggleDeleteMode" class="btn btn-sm btn-outline-warning w-100 mb-2">🗑️ Activer suppression</button>
                                                            <button type="button" id="archiveSuggestOldCleanup" class="btn btn-sm btn-outline-danger w-100 mb-2">🧹 Suggérer suppression &gt; 90 jours</button>
                                                            <div id="archiveDeleteControls" style="display: none;">
                                                            <div class="form-check mb-2">
                                                                <input class="form-check-input" type="checkbox" id="archiveSelectAll">
                                                                <label class="form-check-label text-muted" for="archiveSelectAll">Tout sélectionner</label>
                                                            </div>
                                                            <button type="button" id="archiveDeleteSelected" class="btn btn-sm btn-outline-danger w-100" disabled>🗑️ Supprimer sélection</button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div id="archiveContactsList"></div>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="tab-pane fade" id="monitoring-panel" style="overflow: auto; padding: 12px;">
                                        <div class="d-flex justify-content-between align-items-center mb-3">
                                            <h5 class="text-secondary fw-bold mb-0">Monitoring temps réel</h5>
                                            <div class="d-flex gap-2 align-items-center">
                                                <small class="text-white-50" id="monitoringUpdatedAt">-</small>
                                                <button class="btn btn-sm btn-outline-success" id="monitoringRefreshBtn">Actualiser</button>
                                            </div>
                                        </div>

                                        <div class="row g-2 mb-3">
                                            <div class="col-6 col-md-2"><div class="card bg-dark border-secondary"><div class="card-body p-2 text-light"><small class="text-info d-block fw-bold fs-6">Entrants</small><strong id="monitoringIncoming" class="text-white">0</strong></div></div></div>
                                            <div class="col-6 col-md-2"><div class="card bg-dark border-secondary"><div class="card-body p-2 text-light"><small class="text-warning d-block fw-bold fs-6">Sortants</small><strong id="monitoringOutgoing" class="text-white">0</strong></div></div></div>
                                            <div class="col-6 col-md-2"><div class="card bg-dark border-secondary"><div class="card-body p-2 text-light"><small class="text-success d-block fw-bold fs-6">Succès</small><strong id="monitoringSuccess" class="text-white">0</strong></div></div></div>
                                            <div class="col-6 col-md-2"><div class="card bg-dark border-secondary"><div class="card-body p-2 text-light"><small class="text-danger d-block fw-bold fs-6">Erreurs</small><strong id="monitoringErrors" class="text-white">0</strong></div></div></div>
                                            <div class="col-6 col-md-2"><div class="card bg-dark border-secondary"><div class="card-body p-2 text-light"><small class="text-secondary d-block fw-bold fs-6">Ignorés</small><strong id="monitoringSkipped" class="text-white">0</strong></div></div></div>
                                            <div class="col-6 col-md-2"><div class="card bg-dark border-secondary"><div class="card-body p-2 text-light"><small class="text-light d-block fw-bold fs-6">Logs</small><strong id="monitoringLogsCount" class="text-white">0</strong></div></div></div>
                                        </div>

                                        <div class="card bg-dark border-secondary mb-3">
                                            <div class="card-body p-3 text-light">
                                                <div class="d-flex justify-content-between align-items-center mb-2">
                                                    <h6 class="card-title fw-bold mb-0">Dernier rapport d'envoi massif</h6>
                                                    <div class="d-flex align-items-center gap-2">
                                                        <small class="text-white-50" id="monitoringLastBulkDate">-</small>
                                                        <button class="btn btn-sm btn-outline-secondary" id="monitoringClearLastBulkBtn">Effacer</button>
                                                    </div>
                                                </div>
                                                <div class="row g-2 mb-2">
                                                    <div class="col-6 col-md-3"><small class="text-light d-block fw-bold fs-6">Total</small><strong id="monitoringLastBulkTotal" class="text-white">0</strong></div>
                                                    <div class="col-6 col-md-3"><small class="text-success d-block fw-bold fs-6">Envoyés</small><strong id="monitoringLastBulkSuccess" class="text-white">0</strong></div>
                                                    <div class="col-6 col-md-3"><small class="text-secondary d-block fw-bold fs-6">Ignorés</small><strong id="monitoringLastBulkSkipped" class="text-white">0</strong></div>
                                                    <div class="col-6 col-md-3"><small class="text-danger d-block fw-bold fs-6">Erreurs</small><strong id="monitoringLastBulkFail" class="text-white">0</strong></div>
                                                </div>
                                                <small class="text-white-50" id="monitoringLastBulkMessage">Aucun rapport disponible.</small>
                                            </div>
                                        </div>

                                        <div class="card bg-dark border-secondary mb-3">
                                            <div class="card-body text-light">
                                                <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-2">
                                                    <h6 class="card-title text-light fw-bold mb-0">Graphique (60 dernières minutes)</h6>
                                                    <div id="monitoringChartLegend" class="d-flex align-items-center gap-3 flex-wrap"></div>
                                                </div>
                                                <svg id="monitoringChartSvg" viewBox="0 0 800 220" style="width: 100%; height: 220px; background: #101010; border-radius: 8px;"></svg>
                                            </div>
                                        </div>

                                        <div class="card bg-dark border-secondary" style="margin-bottom: 60px;">
                                            <div class="card-body text-light">
                                                <div class="d-flex align-items-center flex-wrap gap-2 mb-2" id="monitoringLogsHeaderRow">
                                                    <h6 class="card-title text-light fw-bold mb-0 me-2">Logs récents</h6>
                                                    <div id="monitoringLogFilters" class="btn-group btn-group-sm" role="group" aria-label="Filtre niveau logs">
                                                        <button type="button" class="btn btn-outline-light active" data-level="ALL">Tous</button>
                                                        <button type="button" class="btn btn-outline-info" data-level="INFO">INFO</button>
                                                        <button type="button" class="btn btn-outline-warning" data-level="WARN">WARN</button>
                                                        <button type="button" class="btn btn-outline-danger" data-level="ERROR">ERROR</button>
                                                    </div>
                                                    <div id="monitoringLogsSearchSlot" class="ms-auto"></div>
                                                </div>
                                                <div id="monitoringLogsContainer" style="max-height: 420px; overflow: auto;">
                                                    <table id="monitoringLogsTable" class="table table-sm table-dark table-striped mb-0">
                                                        <thead>
                                                            <tr>
                                                                <th style="width: 110px;">Niveau</th>
                                                                <th style="width: 180px;">Date</th>
                                                                <th>Message</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody id="monitoringLogsBody">
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- MODALS -->
                        <div id="modalsContainer">
                            <div class="modal fade" id="adminManagementModal" tabindex="-1" aria-hidden="true" style="overflow: hidden;">
                                <div class="modal-dialog modal-dialog-scrollable modal-dialog-centered modal-lg">
                                    <div class="modal-content" style="background-color: #1a1a1a; border: 1px solid #333;">
                                        <div class="modal-header">
                                            <h5 class="modal-title" style="color: #31a651;">Envoi Planifié</h5>
                                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                                        </div>
                                        <div class="modal-body" style="color: #fff;">
                                            <div class="card bg-dark border-secondary mb-3">
                                                <div class="card-body">
                                                    <h6 class="card-title">Créer un envoi planifié</h6>
                                                    <form id="scheduledJobForm">
                                                                <div class="mb-2">
                                                                    <input type="text" id="scheduledJobTitle" class="form-control form-control-sm" placeholder="Titre (optionnel)">
                                                                </div>
                                                                <div class="mb-2">
                                                                    <textarea id="scheduledJobMessage" class="form-control form-control-sm" rows="3" placeholder="Message" required></textarea>
                                                                </div>
                                                                <div class="mb-2">
                                                                    <label for="scheduledRecipientsRaw" class="form-label text-muted mb-1">Destinataires (virgules ou lignes)</label>
                                                                    <textarea id="scheduledRecipientsRaw" class="form-control form-control-sm" rows="3" placeholder="5141234567, 5149876543\nou\n5141234567\n5149876543" style="resize: none; font-family: monospace;"></textarea>
                                                                    <div class="d-flex justify-content-between align-items-center mt-2">
                                                                        <button type="button" id="scheduledRecipientsParseBtn" class="btn btn-sm btn-outline-success">Ajouter les numéros</button>
                                                                        <small class="text-muted">Total: <span id="scheduledRecipientsCount">0</span></small>
                                                                    </div>
                                                                </div>
                                                                <div id="scheduledRecipientsTags" class="mb-2 p-2" style="background-color: #1a1a1a; border: 1px solid #333; border-radius: 6px; min-height: 42px; max-height: 120px; overflow-y: auto; display: flex; flex-wrap: wrap; align-items: flex-start; gap: 6px; align-content: flex-start;"></div>
                                                                <div class="mb-2" style="position: relative;">
                                                                    <input type="text" id="scheduledParticipantsSearch" class="form-control form-control-sm" placeholder="Rechercher un participant à ajouter...">
                                                                    <div id="scheduledParticipantsSuggestions" class="mt-1" style="background-color: #222; border: 1px solid #333; border-radius: 6px; max-height: 150px; overflow-y: auto; display: none; position: absolute; width: 100%; z-index: 1000;"></div>
                                                                </div>
                                                                <div class="row g-2 mb-2">
                                                                    <div class="col-12">
                                                                        <input type="datetime-local" id="scheduledJobDate" class="form-control form-control-sm" required>
                                                                    </div>
                                                                    <div class="col-12 col-md-6">
                                                                        <label for="scheduledJobRecurrenceType" class="form-label text-muted mb-1">Récurrence</label>
                                                                        <select id="scheduledJobRecurrenceType" class="form-select form-select-sm">
                                                                            <option value="none">Aucune (une seule fois)</option>
                                                                            <option value="minutely">Par minute</option>
                                                                            <option value="hourly">Par heure</option>
                                                                            <option value="daily">Quotidienne</option>
                                                                            <option value="weekly">Hebdomadaire</option>
                                                                            <option value="monthly">Mensuelle</option>
                                                                        </select>
                                                                        <small class="scheduled-recurrence-help text-muted d-block mt-1">Les répétitions gardent la même heure locale (Montréal).</small>
                                                                    </div>
                                                                    <div id="scheduledRecurrenceIntervalGroup" class="col-12 col-md-6">
                                                                        <label for="scheduledJobRecurrenceInterval" class="form-label text-muted mb-1">Intervalle</label>
                                                                        <input type="number" id="scheduledJobRecurrenceInterval" class="form-control form-control-sm" min="1" max="365" value="1" placeholder="1" disabled>
                                                                        <small class="scheduled-recurrence-help text-muted d-block mt-1">Exemple: 2 = un envoi toutes les 2 périodes (minutes/heures/jours/semaines/mois).</small>
                                                                    </div>
                                                                    <div id="scheduledRecurrenceUntilGroup" class="col-12">
                                                                        <label for="scheduledJobRecurrenceUntil" class="form-label text-muted mb-1">Fin de récurrence (optionnel)</label>
                                                                        <input type="datetime-local" id="scheduledJobRecurrenceUntil" class="form-control form-control-sm" placeholder="AAAA-MM-JJ HH:MM" disabled>
                                                                        <small class="scheduled-recurrence-help text-muted d-block mt-1">Sans date de fin, la récurrence continue jusqu'à annulation.</small>
                                                                    </div>
                                                                    <div class="col-12">
                                                                        <label for="scheduledJobDistributionList" class="form-label text-muted mb-1">Envoyer un rapport à (optionnel)</label>
                                                                        <select id="scheduledJobDistributionList" class="form-select form-select-sm">
                                                                            <option value="">Aucune liste de notification</option>
                                                                        </select>
                                                                    </div>
                                                                </div>
                                                                <button type="submit" class="btn btn-sm btn-success">Programmer</button>
                                                    </form>
                                                </div>
                                            </div>
                                            <div class="card bg-dark border-secondary">
                                                <div class="card-body">
                                                    <h6 class="card-title">Jobs planifiés</h6>
                                                    <div id="scheduledJobsContainer" style="max-height: 360px; overflow: auto;"></div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div class="modal fade" id="notificationRecipientsModal" tabindex="-1" aria-hidden="true" style="overflow: hidden;">
                                <div class="modal-dialog modal-dialog-scrollable modal-dialog-centered modal-lg">
                                    <div class="modal-content" style="background-color: #1a1a1a; border: 1px solid #333;">
                                        <div class="modal-header">
                                            <h5 class="modal-title" style="color: #31a651;">Destinataires notifications</h5>
                                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                                        </div>
                                        <div class="modal-body" style="color: #fff;">
                                            <div class="card bg-dark border-secondary mb-3">
                                                <div class="card-body">
                                                    <h6 class="card-title">Listes de distribution</h6>
                                                    <form id="distributionListForm" class="mb-3">
                                                        <input type="hidden" id="distributionListId">
                                                        <div class="mb-2">
                                                            <input type="text" id="distributionListName" class="form-control form-control-sm" placeholder="Nom de la liste" required>
                                                        </div>
                                                        <div class="mb-2">
                                                            <input type="text" id="distributionListDescription" class="form-control form-control-sm" placeholder="Description (optionnel)">
                                                        </div>
                                                        <div class="d-flex gap-2">
                                                            <button type="submit" class="btn btn-sm btn-success">Enregistrer</button>
                                                            <button type="button" id="distributionListReset" class="btn btn-sm btn-outline-secondary">Réinitialiser</button>
                                                        </div>
                                                    </form>
                                                    <div id="distributionListsContainer" style="max-height: 220px; overflow: auto;"></div>
                                                </div>
                                            </div>
                                            <div class="card bg-dark border-secondary">
                                                <div class="card-body">
                                                    <h6 class="card-title">Membres de la liste</h6>
                                                    <p class="text-muted small mb-2" id="distributionMembersTitle">Sélectionnez une liste</p>
                                                    <form id="distributionMemberForm" class="mb-3">
                                                        <div class="mb-2">
                                                            <input type="text" id="distributionMemberName" class="form-control form-control-sm" placeholder="Nom (optionnel)">
                                                        </div>
                                                        <div class="mb-2">
                                                            <input type="text" id="distributionMemberPhone" class="form-control form-control-sm" placeholder="Téléphone" required>
                                                        </div>
                                                        <button type="submit" class="btn btn-sm btn-success">Ajouter</button>
                                                    </form>
                                                    <div id="distributionMembersContainer" style="max-height: 220px; overflow: auto;"></div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <!-- FLOATING BUTTON -->
                        <div id="composeAction" class="position-fixed bottom-0 end-0 m-4 d-none">
                            <button id="btnCompose" class="btn btn-success btn-lg shadow-lg" data-bs-toggle="modal" data-bs-target="#composeModal">
                                ✉️ Rédiger un SMS (<span id="selectedCount">0</span>)
                            </button>
                        </div>
                    </div>
                `;
                this.container.innerHTML = html;
            },

            showLoader: (message = 'Chargement...') => {
                const loader = document.createElement('div');
                loader.id = 'appLoader';
                loader.style.cssText = `
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0, 0, 0, 0.8);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 9999;
                `;
                loader.innerHTML = `
                    <div style="text-align: center; color: #31a651;">
                        <div class="spinner-border mb-3" role="status"></div>
                        <p>${message}</p>
                    </div>
                `;
                document.body.appendChild(loader);
            },

            hideLoader: () => {
                const loader = document.getElementById('appLoader');
                if (loader) loader.remove();
            }
        };
    }

    /**
     * Initialize Login module
     */
    _initLogin() {
        this.login = {
            handleSubmit: async (username, password) => {
                try {
                    const response = await this.api.login(username, password);
                    
                    if (response.success) {
                        this.state.authToken = response.token;
                        this.state.user = response.username;
                        localStorage.setItem('authToken', this.state.authToken);
                        localStorage.setItem('username', response.username);
                        
                        this._showMainApp();
                        await this._initializeApp();
                    } else {
                        throw new Error(response.error || 'Erreur de connexion');
                    }
                } catch (err) {
                    console.error('Login error:', err);
                    throw err;
                }
            }
        };
    }

    /**
     * Initialize SMS module
     */
    _initSMS() {
        this.sms = {
            /**
             * Load received SMS
             */
            loadReceived: async () => {
                try {
                    const data = await this.api.getUnreadSMS();
                    // Render SMS list...
                    return data;
                } catch (err) {
                    console.error('Error loading received SMS:', err);
                    throw err;
                }
            },

            /**
             * Load archive
             */
            loadArchive: async () => {
                try {
                    const data = await this.api.getArchive();
                    // Render archive...
                    return data;
                } catch (err) {
                    console.error('Error loading archive:', err);
                    throw err;
                }
            },

            /**
             * Send quick reply
             */
            sendQuickReply: async (message, phone) => {
                // Implementation for quick SMS reply
            }
        };
    }

    /**
     * Initialize Participants module
     */
    _initParticipants() {
        this.participants = {
            /**
             * Load participants
             */
            load: async () => {
                try {
                    const data = await this.api.getParticipants();
                    this.state.allParticipants = data;
                    // Render participants table...
                    return data;
                } catch (err) {
                    console.error('Error loading participants:', err);
                    throw err;
                }
            },

            /**
             * Select participant
             */
            select: (participantId, name, phone) => {
                this.state.selectedParticipants[participantId] = { name, phone };
                this._updateParticipantsTags();
            },

            /**
             * Deselect participant
             */
            deselect: (participantId) => {
                delete this.state.selectedParticipants[participantId];
                this._updateParticipantsTags();
            },

            /**
             * Get selected count
             */
            getSelectedCount: () => {
                return Object.keys(this.state.selectedParticipants).length;
            }
        };
    }

    /**
     * Verify token
     */
    async _verifyToken() {
        try {
            const response = await this.api.verifyToken();
            
            if (response.success) {
                this.state.isLoggedIn = true;
                this.state.user = localStorage.getItem('username');
                this._showMainApp();
                await this._initializeApp();
            } else {
                throw new Error('Token invalid');
            }
        } catch (err) {
            console.error('Token verification failed:', err);
            throw err;
        }
    }

    /**
     * Show login screen
     */
    _showLogin() {
        const loginForm = this.ui.renderLogin();
        const passwordInput = document.querySelector('#loginPassword');
        const togglePasswordBtn = document.querySelector('#toggleLoginPassword');

        if (passwordInput && togglePasswordBtn) {
            togglePasswordBtn.addEventListener('click', () => {
                const isHidden = passwordInput.type === 'password';
                passwordInput.type = isHidden ? 'text' : 'password';
                togglePasswordBtn.textContent = isHidden ? '🙈' : '👁️';
                togglePasswordBtn.setAttribute('aria-label', isHidden ? 'Masquer le mot de passe' : 'Afficher le mot de passe');
                togglePasswordBtn.setAttribute('title', isHidden ? 'Masquer le mot de passe' : 'Afficher le mot de passe');
            });
        }
        
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const username = document.querySelector('#loginUsername').value;
            const password = document.querySelector('#loginPassword').value;
            const errorEl = document.querySelector('#loginError');
            const loadingEl = document.querySelector('#loginLoading');
            
            errorEl.textContent = '';
            loadingEl.style.display = 'block';
            
            try {
                await this.login.handleSubmit(username, password);
            } catch (err) {
                errorEl.textContent = err.message || 'Identifiants invalides';
            } finally {
                loadingEl.style.display = 'none';
            }
        });
    }

    /**
     * Show main app
     */
    _showMainApp() {
        this.ui.renderApp();
        
        // Setup burger menu
        this._setupBurgerMenu();
        
        // Load user info
        document.querySelector('#loggedUsername').textContent = this.state.user;
        
        // Setup logout
        document.querySelector('#btnLogout').addEventListener('click', () => {
            if (confirm('Êtes-vous sûr de vouloir vous déconnecter ?')) {
                this._logout();
            }
        });
    }

    /**
     * Initialize main app features
     */
    async _initializeApp() {
        try {
            // Check Pixel status
            await this._checkPixelStatus();
            setInterval(() => this._checkPixelStatus(), 30000);
            
            // Load participants
            await this.loadParticipants();
            
            // Load SMS conversations
            await this.loadArchive();
            
            // Initialize WebSocket
            this._initializeWebSocket();

            // Fetch current bulk send status immediately in case socket connect is delayed
            this.api.call('/bulk-queue-status')
                .then((snapshot) => this._updateGlobalBulkStatusBar(snapshot))
                .catch(err => console.warn('Unable to fetch bulk queue status:', err));
            
            // Setup manual SMS form
            this._setupManualSmsForm();

            // Setup scheduling/distribution panel
            await this._setupSchedulingPanel();

            // Setup monitoring panel
            await this._setupMonitoringPanel();

            // Setup modal focus handling for accessibility
            this._setupModalFocusManagement();
            
        } catch (err) {
            console.error('Error initializing app:', err);
            showNotification('Erreur lors de l\'initialisation', 'error');
        }
    }

    /**
     * Setup manual SMS form
     */
    _setupManualSmsForm() {
        const form = document.querySelector('#manualSmsForm');
        const numbersInput = document.querySelector('#manualNumbers');
        const numberCount = document.querySelector('#numberCount');
        if (!form || !numbersInput || !numberCount) return;

        const parseManualPhones = (input) => String(input || '')
            .replace(/\b1\s*,\s*(\d{3})\s*,\s*(\d{3})\s*,\s*(\d{4})\b/g, '1$1$2$3')
            .replace(/\b(\d{3})\s*,\s*(\d{3})\s*,\s*(\d{4})\b/g, '$1$2$3')
            .split(/[\n,]+/)
            .map(value => value.trim())
            .filter(value => value.length > 0)
            .map(raw => ({ raw, digits: raw.replace(/\D/g, '') }));
        
        // Mise à jour du compteur de numéros
        numbersInput.addEventListener('input', () => {
            const entries = parseManualPhones(numbersInput.value);
            numberCount.textContent = entries.length;
        });

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const numbersText = numbersInput.value.trim();
                
                if (!numbersText) {
                    notificationManager.show('Veuillez entrer au moins un numéro de téléphone', 'warning');
                    return;
                }
                
                // Parsing des numéros
                const phones = parseManualPhones(numbersText);
                
                if (phones.length === 0) {
                    notificationManager.show('Veuillez entrer au moins un numéro de téléphone valide', 'warning');
                    return;
                }
                
                // Validation: chaque numéro doit contenir au moins 10 chiffres après nettoyage
                const validatedPhones = [];
                const invalidPhones = [];
                const seenPhones = new Set();
                const duplicatePhones = [];
                
                for (const phone of phones) {
                    let cleaned = phone.digits;
                    if (cleaned.length === 11 && cleaned.startsWith('1')) {
                        cleaned = cleaned.substring(1);
                    }

                    if (cleaned.length === 10) {
                        if (seenPhones.has(cleaned)) {
                            duplicatePhones.push(phone.raw);
                            continue;
                        }
                        seenPhones.add(cleaned);
                        validatedPhones.push({ original: phone.raw, cleaned });
                    } else {
                        invalidPhones.push(phone.raw);
                    }
                }
                
                if (invalidPhones.length > 0) {
                    notificationManager.error(`Numéro(s) invalide(s) (min 10 chiffres): ${invalidPhones.join(', ')}`);
                    return;
                }

                if (validatedPhones.length === 0) {
                    notificationManager.show('Aucun numéro valide après nettoyage', 'warning');
                    return;
                }
                
                // Utiliser seulement les numéros validés
                const phonesToSend = validatedPhones;

                // Mettre à jour visuellement la liste nettoyée (un numéro par ligne, sans doublons)
                numbersInput.value = phonesToSend.map(p => p.cleaned).join('\n');
                numberCount.textContent = String(phonesToSend.length);

                if (duplicatePhones.length > 0) {
                    notificationManager.show(`${duplicatePhones.length} doublon(s) retiré(s)`, 'warning');
                }
                
                // Demander confirmation puis ouvrir la fenêtre de rédaction
                const confirmMessage = `Préparer l'envoi à ${phonesToSend.length} numéro(s) dans la fenêtre \"Rédiger un message de masse\" ?`;
                if (!confirm(confirmMessage)) {
                    return;
                }

                try {
                    if (typeof this.openComposeWithPhones === 'function') {
                        this.openComposeWithPhones(phonesToSend.map(phone => phone.cleaned));
                    } else {
                        notificationManager.error('Le module de composition n\'est pas disponible');
                    }
                } catch (error) {
                    console.error('Erreur lors de la préparation des destinataires:', error);
                    notificationManager.error('Erreur lors de la préparation des destinataires: ' + error.message);
                }
        });
    }

    async _setupSchedulingPanel() {
        const listForm = document.querySelector('#distributionListForm');
        const listResetBtn = document.querySelector('#distributionListReset');
        const memberForm = document.querySelector('#distributionMemberForm');
        const scheduledJobForm = document.querySelector('#scheduledJobForm');
        const scheduledDateInput = document.querySelector('#scheduledJobDate');
        const recurrenceTypeInput = document.querySelector('#scheduledJobRecurrenceType');
        const recurrenceIntervalInput = document.querySelector('#scheduledJobRecurrenceInterval');
        const recurrenceUntilInput = document.querySelector('#scheduledJobRecurrenceUntil');

        if (!listForm || !memberForm || !scheduledJobForm) return;

        if (scheduledDateInput && !scheduledDateInput.dataset.pickerBound) {
            scheduledDateInput.dataset.pickerBound = '1';
            const openNativePicker = () => {
                if (typeof scheduledDateInput.showPicker !== 'function') return;
                try {
                    scheduledDateInput.showPicker();
                } catch (_) {}
            };

            scheduledDateInput.addEventListener('click', openNativePicker);
            scheduledDateInput.addEventListener('touchend', openNativePicker, { passive: true });
            scheduledDateInput.addEventListener('focus', () => {
                setTimeout(openNativePicker, 0);
            });
        }

        this._setupScheduledRecipientsInput();
        this._syncScheduledRecurrenceInputs();

        recurrenceTypeInput?.addEventListener('change', () => {
            this._syncScheduledRecurrenceInputs();
        });

        listForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = document.querySelector('#distributionListId')?.value;
            const name = document.querySelector('#distributionListName')?.value?.trim();
            const description = document.querySelector('#distributionListDescription')?.value?.trim();

            if (!name) {
                notificationManager.show('Le nom de la liste est requis', 'warning');
                return;
            }

            try {
                if (id) {
                    await this.api.updateDistributionList(id, { name, description, isActive: true });
                    notificationManager.success('Liste mise à jour');
                } else {
                    await this.api.createDistributionList({ name, description });
                    notificationManager.success('Liste créée');
                }

                listForm.reset();
                const idField = document.querySelector('#distributionListId');
                if (idField) idField.value = '';
                await this._loadDistributionLists();
            } catch (err) {
                notificationManager.error(`Erreur liste: ${err.message}`);
            }
        });

        listResetBtn?.addEventListener('click', () => {
            listForm.reset();
            const idField = document.querySelector('#distributionListId');
            if (idField) idField.value = '';
        });

        memberForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const listId = this.state.selectedDistributionListId;
            const phone = document.querySelector('#distributionMemberPhone')?.value?.trim();
            const displayName = document.querySelector('#distributionMemberName')?.value?.trim();

            if (!listId) {
                notificationManager.show('Sélectionnez une liste avant d’ajouter un membre', 'warning');
                return;
            }

            if (!phone) {
                notificationManager.show('Le téléphone est requis', 'warning');
                return;
            }

            try {
                await this.api.addDistributionMember(listId, { phone, displayName });
                notificationManager.success('Membre ajouté');
                memberForm.reset();
                await this._loadDistributionMembers(listId);
                await this._loadDistributionLists();
            } catch (err) {
                notificationManager.error(`Erreur membre: ${err.message}`);
            }
        });

        scheduledJobForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const title = document.querySelector('#scheduledJobTitle')?.value?.trim();
            const message = document.querySelector('#scheduledJobMessage')?.value?.trim();
            const sendAtLocal = document.querySelector('#scheduledJobDate')?.value;
            const recurrenceType = String(document.querySelector('#scheduledJobRecurrenceType')?.value || 'none').trim();
            const recurrenceIntervalRaw = document.querySelector('#scheduledJobRecurrenceInterval')?.value;
            const recurrenceUntilLocalRaw = document.querySelector('#scheduledJobRecurrenceUntil')?.value;
            const distributionListIdRaw = document.querySelector('#scheduledJobDistributionList')?.value;
            const distributionListId = distributionListIdRaw ? Number(distributionListIdRaw) : null;
            const recurrenceInterval = recurrenceType === 'none'
                ? 1
                : Math.max(1, Number(recurrenceIntervalRaw || 1));
            const recurrenceUntilLocal = recurrenceType === 'none'
                ? null
                : String(recurrenceUntilLocalRaw || '').trim() || null;

            const recipients = this._collectSelectedRecipientsForScheduling();
            if (!message || !sendAtLocal) {
                notificationManager.show('Message et date/heure sont requis', 'warning');
                return;
            }

            if (recipients.length === 0) {
                notificationManager.show('Aucun destinataire valide pour la planification', 'warning');
                return;
            }

            try {
                await this.api.createScheduledJob({
                    title,
                    message,
                    sendAtLocal,
                    recurrenceType,
                    recurrenceInterval,
                    recurrenceUntilLocal,
                    distributionListId,
                    recipients
                });

                notificationManager.success('Envoi planifié créé');
                scheduledJobForm.reset();
                this.state.scheduledRecipients = [];
                this._renderScheduledRecipientsTags();
                const rawRecipients = document.querySelector('#scheduledRecipientsRaw');
                if (rawRecipients) rawRecipients.value = '';
                this._syncScheduledRecurrenceInputs();
                await this._loadScheduledJobs();
            } catch (err) {
                notificationManager.error(`Erreur planification: ${err.message}`);
            }
        });

        await this._loadDistributionLists();
        await this._loadScheduledJobs();
    }

    _syncScheduledRecurrenceInputs() {
        const recurrenceTypeInput = document.querySelector('#scheduledJobRecurrenceType');
        const recurrenceIntervalInput = document.querySelector('#scheduledJobRecurrenceInterval');
        const recurrenceUntilInput = document.querySelector('#scheduledJobRecurrenceUntil');
        const recurrenceIntervalGroup = document.querySelector('#scheduledRecurrenceIntervalGroup');
        const recurrenceUntilGroup = document.querySelector('#scheduledRecurrenceUntilGroup');

        if (!recurrenceTypeInput) return;

        const type = String(recurrenceTypeInput.value || 'none').trim().toLowerCase();
        const isRecurring = type !== 'none';

        if (recurrenceIntervalGroup) {
            recurrenceIntervalGroup.style.display = isRecurring ? '' : 'none';
        }

        if (recurrenceUntilGroup) {
            recurrenceUntilGroup.style.display = isRecurring ? '' : 'none';
        }

        if (recurrenceIntervalInput) {
            recurrenceIntervalInput.disabled = !isRecurring;
            if (!isRecurring) {
                recurrenceIntervalInput.value = '1';
            } else if (!recurrenceIntervalInput.value || Number(recurrenceIntervalInput.value) < 1) {
                recurrenceIntervalInput.value = '1';
            }
        }

        if (recurrenceUntilInput) {
            recurrenceUntilInput.disabled = !isRecurring;
            if (!isRecurring) {
                recurrenceUntilInput.value = '';
            }
        }
    }

    _collectSelectedRecipientsForScheduling() {
        return (this.state.scheduledRecipients || []).map((recipient) => ({
            participantId: recipient.participantId || null,
            displayName: recipient.displayName || null,
            phone: recipient.phone
        }));
    }

    _setupScheduledRecipientsInput() {
        const rawInput = document.querySelector('#scheduledRecipientsRaw');
        const parseBtn = document.querySelector('#scheduledRecipientsParseBtn');
        const searchInput = document.querySelector('#scheduledParticipantsSearch');
        const suggestions = document.querySelector('#scheduledParticipantsSuggestions');

        if (!Array.isArray(this.state.scheduledRecipients)) {
            this.state.scheduledRecipients = [];
        }

        this._renderScheduledRecipientsTags();

        parseBtn?.addEventListener('click', () => {
            const parsed = this._parseAndAddScheduledRecipients(rawInput?.value || '');
            if (rawInput) rawInput.value = '';
            if (parsed > 0) {
                notificationManager.success(`${parsed} numéro(s) ajouté(s)`);
            }
        });

        rawInput?.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                const parsed = this._parseAndAddScheduledRecipients(rawInput?.value || '');
                if (rawInput) rawInput.value = '';
                if (parsed > 0) {
                    notificationManager.success(`${parsed} numéro(s) ajouté(s)`);
                }
            }
        });

        searchInput?.addEventListener('input', () => {
            const query = String(searchInput.value || '').trim();
            const normalizedQuery = this._normalizeSearchText(query);
            const queryDigits = query.replace(/\D/g, '');
            const allParticipants = Array.isArray(this.state.allParticipants) ? this.state.allParticipants : [];

            if (!normalizedQuery && !queryDigits) {
                suggestions.style.display = 'none';
                suggestions.innerHTML = '';
                return;
            }

            const queryWords = normalizedQuery.split(/\s+/).filter(Boolean);
            const matches = allParticipants
                .map((participant) => this._extractParticipantData(participant))
                .filter((participant) => {
                    const byPhone = queryDigits.length > 0
                        ? participant.phoneDigits.includes(queryDigits)
                        : false;
                    const byName = queryWords.length > 0
                        ? queryWords.every((word) => participant.searchName.includes(word))
                        : false;
                    return byPhone || byName;
                })
                .slice(0, 10);

            if (matches.length === 0) {
                suggestions.style.display = 'none';
                suggestions.innerHTML = '';
                return;
            }

            suggestions.innerHTML = matches.map((participant, index) => `
                <button type="button" class="btn btn-sm btn-outline-success w-100 text-start border-0 rounded-0" data-scheduled-match-index="${index}">
                    ${this._escapeHtml(participant.name || 'Sans nom')} - ${this._escapeHtml(participant.phone || '')}
                </button>
            `).join('');
            suggestions.style.display = 'block';

            suggestions.querySelectorAll('button[data-scheduled-match-index]').forEach((btn) => {
                btn.addEventListener('click', () => {
                    const index = Number(btn.getAttribute('data-scheduled-match-index'));
                    const participant = matches[index];
                    if (!participant) return;

                    this._addScheduledRecipient(participant.phone, participant.id, participant.name);
                    searchInput.value = '';
                    suggestions.style.display = 'none';
                    suggestions.innerHTML = '';
                });
            });
        });

        document.addEventListener('click', (event) => {
            if (!event.target.closest('#scheduledParticipantsSearch') && !event.target.closest('#scheduledParticipantsSuggestions')) {
                if (suggestions) {
                    suggestions.style.display = 'none';
                }
            }
        });
    }

    _parseAndAddScheduledRecipients(input) {
        const items = String(input || '')
            .replace(/\b1\s*,\s*(\d{3})\s*,\s*(\d{3})\s*,\s*(\d{4})\b/g, '1$1$2$3')
            .replace(/\b(\d{3})\s*,\s*(\d{3})\s*,\s*(\d{4})\b/g, '$1$2$3')
            .split(/[\n,]+/)
            .map((value) => value.trim())
            .filter(Boolean);

        let added = 0;
        const invalid = [];

        for (const rawItem of items) {
            const normalized = this._normalizePhoneTo10(rawItem);
            if (!normalized) {
                invalid.push(rawItem);
                continue;
            }

            const participant = this._findParticipantByPhone10(normalized);
            const wasAdded = this._addScheduledRecipient(
                normalized,
                participant?.id || null,
                participant?.name || null
            );
            if (wasAdded) added++;
        }

        if (invalid.length > 0) {
            notificationManager.show(`Numéro(s) invalide(s): ${invalid.slice(0, 5).join(', ')}`, 'warning');
        }

        return added;
    }

    _normalizePhoneTo10(phone) {
        let digits = String(phone || '').replace(/\D/g, '');
        if (digits.length === 11 && digits.startsWith('1')) {
            digits = digits.substring(1);
        }
        return digits.length === 10 ? digits : '';
    }

    _findParticipantByPhone10(phone10) {
        const allParticipants = Array.isArray(this.state.allParticipants) ? this.state.allParticipants : [];
        for (const participant of allParticipants) {
            const extracted = this._extractParticipantData(participant);
            if (extracted.phoneDigits === phone10) {
                return extracted;
            }
        }
        return null;
    }

    _normalizeSearchText(value) {
        return String(value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .trim();
    }

    _extractParticipantData(participant) {
        const idRaw = participant?.id ?? participant?.Id ?? participant?.participantId ?? null;
        const firstName = participant?.Prenom ?? participant?.prenom ?? participant?.FirstName ?? '';
        const lastName = participant?.NomDeFamille ?? participant?.nomDeFamille ?? participant?.LastName ?? '';
        const fallbackName = `${firstName} ${lastName}`.trim();

        const name = String(
            (
                participant?.name
                ?? participant?.Name
                ?? participant?.displayName
                ?? participant?.DisplayName
                ?? fallbackName
            ) || ''
        ).trim();

        const phone = String(
            participant?.phone
            ?? participant?.Phone
            ?? participant?.NumeroTel
            ?? participant?.numeroTel
            ?? participant?.PhoneNumber
            ?? ''
        ).trim();

        const phoneDigits = this._normalizePhoneTo10(phone);

        return {
            id: idRaw !== null && idRaw !== undefined ? Number(idRaw) : null,
            name,
            phone,
            phoneDigits,
            searchName: this._normalizeSearchText(name)
        };
    }

    _addScheduledRecipient(rawPhone, participantId = null, participantName = null) {
        const phone10 = this._normalizePhoneTo10(rawPhone);
        if (!phone10) return false;

        const exists = (this.state.scheduledRecipients || []).some((recipient) => recipient.phone === phone10);
        if (exists) return false;

        if (!Array.isArray(this.state.scheduledRecipients)) {
            this.state.scheduledRecipients = [];
        }

        this.state.scheduledRecipients.push({
            key: `scheduled_${phone10}`,
            phone: phone10,
            participantId: participantId || null,
            displayName: participantName || `+1${phone10}`
        });

        this._renderScheduledRecipientsTags();
        return true;
    }

    _removeScheduledRecipient(phone10) {
        this.state.scheduledRecipients = (this.state.scheduledRecipients || []).filter((recipient) => recipient.phone !== phone10);
        this._renderScheduledRecipientsTags();
    }

    _renderScheduledRecipientsTags() {
        const container = document.querySelector('#scheduledRecipientsTags');
        const countEl = document.querySelector('#scheduledRecipientsCount');
        if (!container || !countEl) return;

        const recipients = Array.isArray(this.state.scheduledRecipients) ? this.state.scheduledRecipients : [];
        countEl.textContent = String(recipients.length);

        if (recipients.length === 0) {
            container.innerHTML = '<small class="text-muted">Aucun destinataire ajouté</small>';
            return;
        }

        container.innerHTML = recipients.map((recipient) => `
            <span class="badge bg-success d-inline-flex align-items-center" style="gap: 6px; max-width: 100%; color: #ffffff;">
                <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 220px;">${this._escapeHtml(recipient.displayName || '')} (${this._escapeHtml(recipient.phone)})</span>
                <button type="button" class="btn-close btn-close-white" aria-label="Retirer" data-scheduled-phone="${recipient.phone}" style="font-size: 0.65rem;"></button>
            </span>
        `).join('');

        container.querySelectorAll('button[data-scheduled-phone]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const phone10 = btn.getAttribute('data-scheduled-phone');
                this._removeScheduledRecipient(phone10);
            });
        });
    }

    _setupModalFocusManagement() {
        if (this._modalFocusManagementBound) return;
        this._modalFocusManagementBound = true;

        document.addEventListener('hidden.bs.modal', (event) => {
            const modalEl = event.target;
            if (!modalEl) return;

            const activeEl = document.activeElement;
            if (activeEl && modalEl.contains(activeEl) && typeof activeEl.blur === 'function') {
                activeEl.blur();
            }

            const modalId = modalEl.getAttribute('id');
            if (!modalId) return;

            const trigger = document.querySelector(`[data-bs-target="#${modalId}"]`);
            if (trigger && typeof trigger.focus === 'function') {
                setTimeout(() => trigger.focus(), 0);
            }
        });
    }

    async _loadDistributionLists() {
        const container = document.querySelector('#distributionListsContainer');
        const select = document.querySelector('#scheduledJobDistributionList');
        if (!container || !select) return;

        const lists = await this.api.getDistributionLists();
        this.state.distributionLists = Array.isArray(lists) ? lists : [];

        container.innerHTML = this.state.distributionLists.length === 0
            ? '<p class="text-muted small mb-0">Aucune liste</p>'
            : this.state.distributionLists.map((list) => {
                const isSelected = Number(this.state.selectedDistributionListId) === Number(list.Id);
                return `
                    <div class="border border-secondary rounded p-2 mb-2 ${isSelected ? 'bg-secondary bg-opacity-25' : ''}">
                        <div class="d-flex justify-content-between align-items-start gap-2">
                            <div>
                                <strong class="text-success">${this._escapeHtml(list.Name || '')}</strong>
                                <div class="text-muted small">${this._escapeHtml(list.Description || '')}</div>
                                <div class="text-muted small">Membres: ${Number(list.MembersCount || 0)}</div>
                            </div>
                            <div class="d-flex gap-1">
                                <button class="btn btn-sm btn-outline-light" data-list-action="select" data-list-id="${list.Id}">Ouvrir</button>
                                <button class="btn btn-sm btn-outline-warning" data-list-action="edit" data-list-id="${list.Id}">Éditer</button>
                                <button class="btn btn-sm btn-outline-danger" data-list-action="delete" data-list-id="${list.Id}">Suppr.</button>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');

        select.innerHTML = '<option value="">Aucune liste de notification</option>' + this.state.distributionLists
            .map((list) => `<option value="${list.Id}">${this._escapeHtml(list.Name || '')}</option>`)
            .join('');

        container.querySelectorAll('button[data-list-action]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const action = btn.getAttribute('data-list-action');
                const listId = Number(btn.getAttribute('data-list-id'));
                const targetList = this.state.distributionLists.find((list) => Number(list.Id) === listId);

                if (!targetList) return;

                if (action === 'select') {
                    this.state.selectedDistributionListId = listId;
                    document.querySelector('#distributionMembersTitle').textContent = `Liste active: ${targetList.Name}`;
                    await this._loadDistributionMembers(listId);
                    await this._loadDistributionLists();
                }

                if (action === 'edit') {
                    const idField = document.querySelector('#distributionListId');
                    const nameField = document.querySelector('#distributionListName');
                    const descField = document.querySelector('#distributionListDescription');
                    if (idField) idField.value = targetList.Id;
                    if (nameField) nameField.value = targetList.Name || '';
                    if (descField) descField.value = targetList.Description || '';
                }

                if (action === 'delete') {
                    if (!confirm(`Supprimer la liste "${targetList.Name}" ?`)) return;
                    await this.api.deleteDistributionList(listId);
                    if (Number(this.state.selectedDistributionListId) === listId) {
                        this.state.selectedDistributionListId = null;
                        document.querySelector('#distributionMembersTitle').textContent = 'Sélectionnez une liste';
                        const membersContainer = document.querySelector('#distributionMembersContainer');
                        if (membersContainer) membersContainer.innerHTML = '';
                    }
                    await this._loadDistributionLists();
                    notificationManager.success('Liste supprimée');
                }
            });
        });
    }

    async _loadDistributionMembers(listId) {
        const container = document.querySelector('#distributionMembersContainer');
        if (!container || !listId) return;

        const members = await this.api.getDistributionMembers(listId);
        const rows = Array.isArray(members) ? members : [];

        container.innerHTML = rows.length === 0
            ? '<p class="text-muted small mb-0">Aucun membre</p>'
            : rows.map((member) => `
                <div class="d-flex justify-content-between align-items-center border-bottom border-secondary py-2">
                    <div>
                        <div class="text-light">${this._escapeHtml(member.DisplayName || 'Sans nom')}</div>
                        <div class="text-muted small">${this._escapeHtml(member.PhoneNumber || '')}</div>
                    </div>
                    <button class="btn btn-sm btn-outline-danger" data-member-id="${member.Id}">Suppr.</button>
                </div>
            `).join('');

        container.querySelectorAll('button[data-member-id]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const memberId = Number(btn.getAttribute('data-member-id'));
                if (!memberId || !confirm('Supprimer ce membre ?')) return;

                await this.api.deleteDistributionMember(listId, memberId);
                await this._loadDistributionMembers(listId);
                await this._loadDistributionLists();
                notificationManager.success('Membre supprimé');
            });
        });
    }

    async _loadScheduledJobs() {
        const container = document.querySelector('#scheduledJobsContainer');
        if (!container) return;

        const jobs = await this.api.getScheduledJobs();
        this.state.scheduledJobs = Array.isArray(jobs) ? jobs : [];

        container.innerHTML = this.state.scheduledJobs.length === 0
            ? '<p class="text-muted small mb-0">Aucun job planifié</p>'
            : this.state.scheduledJobs.map((job) => {
                const statusMeta = this._getScheduledJobStatusMeta(job.Status, job);
                const canAct = statusMeta.isPending;
                const sendAtLocal = this._formatScheduledDate(job.SendAtUtc);
                const recurrenceLabel = this._formatScheduledRecurrence(job);
                const recurrenceType = String(job?.RecurrenceType || 'none').trim().toLowerCase();
                const nextRunLabel = recurrenceType !== 'none' ? sendAtLocal : '';
                return `
                    <div class="scheduled-job-card border rounded p-2 mb-2 ${statusMeta.cardClass}">
                        <div class="scheduled-job-header d-flex justify-content-between align-items-start gap-2">
                            <div class="scheduled-job-content">
                                <strong class="text-success">${this._escapeHtml(job.Title || 'Sans titre')}</strong>
                                <div class="scheduled-job-meta text-muted small d-flex flex-wrap align-items-center gap-2">
                                    <span class="scheduled-job-status badge ${statusMeta.badgeClass}">${statusMeta.icon} ${this._escapeHtml(statusMeta.label)}</span>
                                    <span class="scheduled-job-date">Date: ${this._escapeHtml(sendAtLocal)}</span>
                                </div>
                                <div class="scheduled-job-recurrence text-muted small">Récurrence: ${this._escapeHtml(recurrenceLabel)}</div>
                                ${nextRunLabel ? `<div class="scheduled-job-next-run text-muted small">Prochain envoi: ${this._escapeHtml(nextRunLabel)}</div>` : ''}
                                <div class="scheduled-job-stats text-muted small">Destinataires: ${Number(job.RecipientCount || 0)} | Succès: ${Number(job.SuccessCount || 0)} | Échecs: ${Number(job.FailedCount || 0)}</div>
                            </div>
                            <div class="scheduled-job-actions d-flex gap-1">
                                <button class="btn btn-sm btn-outline-warning" data-job-action="run" data-job-id="${job.Id}" ${canAct ? '' : 'disabled'}>Exécuter</button>
                                <button class="btn btn-sm btn-outline-danger" data-job-action="cancel" data-job-id="${job.Id}" ${canAct ? '' : 'disabled'}>Annuler</button>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');

        container.querySelectorAll('button[data-job-action]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const action = btn.getAttribute('data-job-action');
                const jobId = Number(btn.getAttribute('data-job-id'));
                if (!jobId) return;

                try {
                    if (action === 'run') {
                        await this.api.runScheduledJobNow(jobId);
                        notificationManager.success('Job déclenché');
                    } else if (action === 'cancel') {
                        await this.api.cancelScheduledJob(jobId);
                        notificationManager.success('Job annulé');
                    }
                    await this._loadScheduledJobs();
                } catch (err) {
                    notificationManager.error(`Erreur job: ${err.message}`);
                }
            });
        });
    }

    _getScheduledJobStatusMeta(status, job = null) {
        const rawStatus = String(status || '').trim();
        const normalizedStatus = rawStatus.toLowerCase();
        const recurrenceType = String(job?.RecurrenceType || 'none').trim().toLowerCase();
        const isRecurring = recurrenceType && recurrenceType !== 'none';

        const pendingStates = ['pending', 'scheduled', 'planifie', 'planifié', 'en_attente', 'queued'];
        const runningStates = ['running', 'in_progress', 'processing', 'en_cours'];
        const completedStates = ['completed', 'done', 'success', 'termine', 'terminé'];
        const failedStates = ['failed', 'error', 'ko', 'echec', 'échec'];
        const cancelledStates = ['cancelled', 'canceled', 'annule', 'annulé'];

        if (pendingStates.includes(normalizedStatus)) {
            if (isRecurring) {
                return { label: 'Récurrent', icon: '🔁', badgeClass: 'text-bg-info', cardClass: 'border-info', isPending: true };
            }
            return { label: 'En attente', icon: '🕒', badgeClass: 'text-bg-secondary', cardClass: 'border-secondary', isPending: true };
        }

        if (runningStates.includes(normalizedStatus)) {
            return { label: 'En cours', icon: '⏳', badgeClass: 'text-bg-warning', cardClass: 'border-warning', isPending: false };
        }

        if (completedStates.includes(normalizedStatus)) {
            return { label: 'Complété', icon: '✅', badgeClass: 'text-bg-success', cardClass: 'border-success border-2', isPending: false };
        }

        if (failedStates.includes(normalizedStatus)) {
            return { label: 'Échec', icon: '❌', badgeClass: 'text-bg-danger', cardClass: 'border-danger', isPending: false };
        }

        if (cancelledStates.includes(normalizedStatus)) {
            return { label: 'Annulé', icon: '🚫', badgeClass: 'text-bg-dark', cardClass: 'border-dark', isPending: false };
        }

        return {
            label: rawStatus || 'Inconnu',
            icon: 'ℹ️',
            badgeClass: 'text-bg-secondary',
            cardClass: 'border-secondary',
            isPending: false
        };
    }

    _formatScheduledDate(value) {
        if (!value) return '-';

        const raw = String(value).trim();
        if (!raw) return '-';

        let parsed = null;

        if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw)) {
            parsed = new Date(raw.replace(' ', 'T') + 'Z');
        } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(raw)) {
            parsed = new Date(raw + 'Z');
        } else {
            parsed = new Date(raw);
        }

        if (Number.isNaN(parsed.getTime())) {
            return raw;
        }

        return parsed.toLocaleString('fr-CA');
    }

    _formatScheduledRecurrence(job) {
        const type = String(job?.RecurrenceType || 'none').trim().toLowerCase();
        const interval = Math.max(1, Number(job?.RecurrenceInterval || 1));
        const until = job?.RecurrenceUntilUtc ? this._formatScheduledDate(job.RecurrenceUntilUtc) : null;
        const maxCount = job?.RecurrenceCountMax ? Number(job.RecurrenceCountMax) : null;
        const doneCount = Math.max(0, Number(job?.RecurrenceCountDone || 0));

        if (!type || type === 'none') return 'aucune';

        let baseLabel = '';
        if (type === 'minutely') {
            baseLabel = interval === 1 ? 'Chaque minute' : `Toutes les ${interval} minutes`;
        } else if (type === 'hourly') {
            baseLabel = interval === 1 ? 'Chaque heure' : `Toutes les ${interval} heures`;
        } else if (type === 'daily') {
            baseLabel = interval === 1 ? 'Tous les jours' : `Tous les ${interval} jours`;
        } else if (type === 'weekly') {
            baseLabel = interval === 1 ? 'Chaque semaine' : `Toutes les ${interval} semaines`;
        } else if (type === 'monthly') {
            baseLabel = interval === 1 ? 'Chaque mois' : `Tous les ${interval} mois`;
        } else {
            return 'aucune';
        }

        if (until) {
            baseLabel += `, jusqu'au ${until}`;
        }

        if (maxCount && Number.isFinite(maxCount)) {
            baseLabel += ` (${doneCount}/${maxCount})`;
        }

        return baseLabel;
    }

    _escapeHtml(text) {
        return String(text || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    /**
     * Setup burger menu
     */
    _setupBurgerMenu() {
        const toggle = document.querySelector('#burgerToggle');
        const dropdown = document.querySelector('#burgerDropdown');
        const backdrop = document.querySelector('#burgerBackdrop');
        const openScheduledBtn = document.querySelector('#btnOpenScheduledModal');
        const openNotificationRecipientsBtn = document.querySelector('#btnOpenNotificationRecipientsModal');
        
        if (toggle && dropdown) {
            const openMenu = () => {
                dropdown.classList.add('show');
                toggle.classList.add('active');
                toggle.setAttribute('aria-expanded', 'true');
                backdrop?.classList.add('show');
            };

            const closeMenu = () => {
                dropdown.classList.remove('show');
                toggle.classList.remove('active');
                toggle.setAttribute('aria-expanded', 'false');
                backdrop?.classList.remove('show');
            };

            toggle.addEventListener('click', (e) => {
                e.stopPropagation();
                if (dropdown.classList.contains('show')) {
                    closeMenu();
                } else {
                    openMenu();
                }
            });

            backdrop?.addEventListener('click', () => {
                closeMenu();
            });
            
            document.addEventListener('click', (e) => {
                if (!e.target.closest('.burger-menu')) {
                    closeMenu();
                }
            });

            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    closeMenu();
                }
            });

            [openScheduledBtn, openNotificationRecipientsBtn].forEach((menuBtn) => {
                if (!menuBtn) return;
                menuBtn.addEventListener('click', () => {
                    closeMenu();
                });
            });
        }
    }

    /**
     * Check Pixel status
     */
    async _checkPixelStatus() {
        try {
            const response = await this.api.checkPixelStatus();
            const dot = document.querySelector('#pixelStatusDot');
            const text = document.querySelector('#pixelStatusText');
            
            if (dot && text) {
                if (response.connected) {
                    dot.className = 'connected';
                    text.className = 'connected';
                    text.textContent = 'Téléphone: Pixel 2 Connecté';
                } else {
                    dot.className = 'disconnected';
                    text.className = 'disconnected';
                    text.textContent = 'Téléphone: Pixel 2 Déconnecté';
                }
            }
        } catch (err) {
            const dot = document.querySelector('#pixelStatusDot');
            const text = document.querySelector('#pixelStatusText');
            if (dot && text) {
                dot.className = 'disconnected';
                text.className = 'disconnected';
                text.textContent = 'Erreur de connexion';
            }
        }
    }

    /**
     * Initialize WebSocket
     */
    _initializeWebSocket() {
        this.state.socket = io(this.api.baseUrl, {
            auth: { token: this.state.authToken }
        });

        this.state.socket.on('connect', () => {
            try {
                const pendingRaw = sessionStorage.getItem('bulkSendPending');
                if (!pendingRaw) return;

                const pending = JSON.parse(pendingRaw);
                const pendingCallbackId = String(pending?.callbackId || '').trim();
                const startedAt = Number(pending?.startedAt || 0);
                const ageMs = startedAt > 0 ? (Date.now() - startedAt) : 0;

                if (ageMs > 15 * 60 * 1000) {
                    sessionStorage.removeItem('bulkSendPending');
                    return;
                }

                notificationManager.info('Reconnexion détectée: un envoi bulk précédent peut encore être en cours côté serveur.');
                this._scheduleArchiveRefresh(250);

                if (pendingCallbackId) {
                    this.api.call(`/bulk-sms-report/${encodeURIComponent(pendingCallbackId)}`)
                        .then((reportResult) => {
                            if (!reportResult?.success || !reportResult?.found || !reportResult?.report) return;
                            this._handleBulkSMSResponse(reportResult.report);
                        })
                        .catch((err) => {
                            console.warn('Unable to recover bulk report after reconnect:', err);
                        });
                }
            } catch (err) {
                console.warn('Unable to restore pending bulk send state:', err);
            }
        });

        this.state.socket.on('disconnect', (reason) => {
            if (this.state.bulkSendInFlight && reason !== 'io client disconnect') {
                notificationManager.warning('Connexion interrompue: le serveur peut continuer l\'envoi en arrière-plan.');
            }
        });

        this.state.socket.on('progress', (data) => {
            this._handleProgress(data);
        });

        this.state.socket.on('finish', () => {
            this._handleSMSComplete();
        });

        this.state.socket.on('new-sms', (data) => {
            this._handleNewSMS(data);
        });

        this.state.socket.on('sms-sync-complete', (data) => {
            this._handleSmsSyncComplete(data);
        });

        this.state.socket.on('sms-sent', (data) => {
            this._handleSMSSent(data);
        });

        this.state.socket.on('conversation-read-updated', (data) => {
            this._handleConversationReadUpdated(data);
        });

        this.state.socket.on('bulk-sms-response', (data) => {
            this._handleBulkSMSResponse(data);
        });

        this.state.socket.on('monitoring-summary', (data) => {
            this._handleMonitoringSummaryRealtime(data);
        });

        this.state.socket.on('monitoring-log', (data) => {
            this._handleMonitoringLogRealtime(data);
        });

        this.state.socket.on('scheduled-job-updated', () => {
            this._loadScheduledJobs().catch(err => console.error('Error reloading scheduled jobs:', err));
        });

        this.state.socket.on('bulk-queue-status', (data) => {
            this._updateGlobalBulkStatusBar(data);
        });

        this.state.socket.on('bulk-sms-queued', (data) => {
            const position = Number(data?.position || 0);
            if (position > 1) {
                notificationManager.info(`Envoi en attente dans la file (position ${position}).`);
            }
        });
    }

    /**
     * Update the persistent global bulk send status bar (visible across tabs/reloads)
     */
    _updateGlobalBulkStatusBar(snapshot) {
        const bar = document.querySelector('#globalBulkStatusBar');
        const text = document.querySelector('#globalBulkStatusText');
        const fill = document.querySelector('#globalBulkStatusBarFill');
        if (!bar || !text || !fill) return;

        const current = snapshot?.current;
        const queuedCount = Array.isArray(snapshot?.queued) ? snapshot.queued.length : 0;

        if (!snapshot?.processing || !current) {
            bar.style.display = 'none';
            return;
        }

        const total = Number(current.total || 0);
        const done = Number(current.current || 0);
        const percent = total > 0 ? Math.round((done / total) * 100) : 0;

        bar.style.display = 'flex';
        fill.style.width = `${percent}%`;
        const queuedSuffix = queuedCount > 0 ? ` • ${queuedCount} en attente` : '';
        text.textContent = `📤 Envoi de masse en cours (${done}/${total}) • Succès: ${current.successCount || 0} • Erreurs: ${current.failCount || 0}${queuedSuffix}`;
    }

    /**
     * Update participants tags
     */
    _updateParticipantsTags() {
        // Implementation for updating participant tags UI
    }

    /**
     * Handle progress event
     */
    _handleProgress(data) {
        // Implementation
    }

    /**
     * Handle SMS completion
     */
    _handleSMSComplete() {
        // Implementation
    }

    /**
     * Debounced archive refresh
     */
    _scheduleArchiveRefresh(delay = 250) {
        if (this._archiveRefreshTimer) {
            clearTimeout(this._archiveRefreshTimer);
        }

        this._archiveRefreshTimer = setTimeout(() => {
            this.loadArchive().catch(err => console.error('Error refreshing archive:', err));
        }, delay);
    }

    /**
     * Handle new SMS
     */
    _handleNewSMS(data) {
        const senderNumber = data?.SenderNumber || data?.sender || data?.from || data?.phoneNumber || data?.address || data?.NumeroTel || '';
        const messageText = data?.Message ?? data?.message ?? data?.body ?? data?.text ?? data?.content ?? '';
        const normalizedData = {
            ...data,
            SenderNumber: senderNumber,
            Message: messageText
        };

        // Try to add message to open conversation
        const addedToConversation = this.addReceivedMessageToConversation(normalizedData);
        
        // If conversation is not open, reload archive
        if (!addedToConversation) {
            const unreadBadge = document.querySelector('#unreadBadge');
            if (unreadBadge) {
                const currentCount = parseInt(unreadBadge.textContent) || 0;
                unreadBadge.textContent = String(currentCount + 1);
                unreadBadge.style.display = 'inline-block';
            }
        }

        // Always refresh archive shortly after realtime event to keep counters/cards authoritative
        this._scheduleArchiveRefresh(150);
        
        // Show notification
        const senderName = data.Prenom && data.NomDeFamille ? 
            `${data.Prenom} ${data.NomDeFamille}` : 
            (senderNumber || 'Inconnu');
        const messagePreview = String(messageText || '').replace(/\s+/g, ' ').trim();
        const shortPreview = messagePreview.length > 80 ? `${messagePreview.slice(0, 77)}...` : messagePreview;
        const notifText = shortPreview
            ? `Nouveau SMS de ${senderName}: ${shortPreview}`
            : `Nouveau SMS de ${senderName}`;
        notificationManager.info(notifText, 15000);
        
        console.log('📨 Nouveau SMS reçu de:', senderNumber);
    }

    /**
     * Handle SMS sync complete
     */
    _handleSmsSyncComplete(data) {
        const inserted = Number(data?.inserted || 0);
        if (inserted <= 0) return;

        this._scheduleArchiveRefresh();

        if (data?.auto) {
            notificationManager.info(`${inserted} nouveau(x) SMS reçu(s) synchronisé(s)`);
        }

        console.log('🔄 SMS sync completed:', data);
    }

    /**
     * Handle conversation read updates from other connected clients
     */
    _handleConversationReadUpdated(data) {
        if (data?.sourceSocketId && this.state?.socket?.id && data.sourceSocketId === this.state.socket.id) {
            return;
        }

        if (typeof this._applyConversationReadUpdate === 'function') {
            this._applyConversationReadUpdate(data?.contactKey);
        }
        this._scheduleArchiveRefresh(500);
        console.log('👁️ Conversation read state updated:', data);
    }

    /**
     * Handle SMS sent
     */
    _handleSMSSent(data) {
        // For bulk sends, avoid invoking quick-reply callbacks on per-message realtime events
        // (bulk emits sms-sent with callbackId for each sent message)
        if (data?.source === 'bulk') {
            const now = Date.now();
            const minIntervalMs = 20000;
            if (now - Number(this.state.lastBulkArchiveRefreshAt || 0) >= minIntervalMs) {
                this.state.lastBulkArchiveRefreshAt = now;
                this._scheduleArchiveRefresh(250);
            }
            return;
        }

        // Call the callback if it exists
        if (data.callbackId && this.state.smsQuickReplyCallbacks[data.callbackId]) {
            this.state.smsQuickReplyCallbacks[data.callbackId](data);
            return;
        }

        // For REST/manual sends (no callbackId), refresh archive in real time
        this._scheduleArchiveRefresh();
    }

    /**
     * Handle bulk SMS response
     */
    _handleBulkSMSResponse(data) {
        this._persistLastBulkReport(data);

        // Call the callback if it exists
        if (data.callbackId && this.state.smsQuickReplyCallbacks[data.callbackId]) {
            this.state.smsQuickReplyCallbacks[data.callbackId](data);
            delete this.state.smsQuickReplyCallbacks[data.callbackId];
            return;
        }

        const successCount = Number(data?.successCount || 0);
        const failCount = Number(data?.failCount || 0);
        const skippedCount = Number(data?.skippedCount || 0);
        const totalCount = Number(data?.total || 0);

        if (data?.error) {
            notificationManager.error(`Envoi de masse terminé avec erreur: ${data.error}`);
        } else if (totalCount > 0) {
            const message = `${successCount}/${totalCount} envoyés • ${skippedCount} ignorés • ${failCount} erreurs`;
            if (failCount > 0) {
                notificationManager.warning(`Rapport récupéré après reconnexion: ${message}`);
            } else {
                notificationManager.success(`Rapport récupéré après reconnexion: ${message}`);
            }
        }

        this.state.bulkSendInFlight = false;
        this._scheduleArchiveRefresh(250);
        try {
            sessionStorage.removeItem('bulkSendPending');
        } catch (err) {
            console.warn('Unable to clear pending bulk send state after recovered report:', err);
        }
    }

    async _setupMonitoringPanel() {
        const refreshBtn = document.querySelector('#monitoringRefreshBtn');
        if (refreshBtn && !refreshBtn.dataset.bound) {
            refreshBtn.addEventListener('click', () => {
                this._refreshMonitoringPanel(true).catch(err => console.error('Monitoring refresh error:', err));
            });
            refreshBtn.dataset.bound = '1';
        }

        const clearLastBulkBtn = document.querySelector('#monitoringClearLastBulkBtn');
        if (clearLastBulkBtn && !clearLastBulkBtn.dataset.bound) {
            clearLastBulkBtn.addEventListener('click', () => {
                this._clearLastBulkReport();
            });
            clearLastBulkBtn.dataset.bound = '1';
        }

        this._restoreLastBulkReport();
        this._renderLastBulkReport(this.state.monitoring.lastBulkReport);
        this._initializeMonitoringLogsTable();
        this._setupMonitoringLogLevelFilters();

        await this._refreshMonitoringPanel(false);

        if (this.state.monitoring.refreshTimer) {
            clearInterval(this.state.monitoring.refreshTimer);
        }
        this.state.monitoring.refreshTimer = setInterval(() => {
            this._refreshMonitoringPanel(false).catch(err => console.error('Monitoring periodic refresh error:', err));
        }, 10000);
    }

    async _refreshMonitoringPanel(forceLogsReload = false) {
        const summaryResult = await this.api.getMonitoringSummary(this.state.monitoring.windowMinutes || 60);
        if (summaryResult?.success) {
            this.state.monitoring.summary = summaryResult;
            this._renderMonitoringSummary(summaryResult);
        }

        if (forceLogsReload || this.state.monitoring.logs.length === 0) {
            const logsResult = await this.api.getMonitoringLogs(200);
            if (logsResult?.success) {
                this.state.monitoring.logs = Array.isArray(logsResult.logs) ? logsResult.logs : [];
                this._renderMonitoringLogs(this.state.monitoring.logs);
            }
        }
    }

    _renderMonitoringSummary(summary) {
        const totals = summary?.totals || {};

        const setText = (selector, value) => {
            const el = document.querySelector(selector);
            if (el) el.textContent = String(value ?? 0);
        };

        setText('#monitoringIncoming', Number(totals.incoming || 0));
        setText('#monitoringOutgoing', Number(totals.outgoing || 0));
        setText('#monitoringSuccess', Number(totals.success || 0));
        setText('#monitoringErrors', Number(totals.error || 0));
        setText('#monitoringSkipped', Number(totals.skipped || 0));
        setText('#monitoringLogsCount', Number(summary?.logsCount || 0));

        const updatedAtEl = document.querySelector('#monitoringUpdatedAt');
        if (updatedAtEl) {
            const d = summary?.updatedAt ? new Date(summary.updatedAt) : new Date();
            updatedAtEl.textContent = `MAJ: ${d.toLocaleTimeString('fr-CA', { hour12: false })}`;
        }

        this._renderMonitoringChart(summary?.chart || {});
    }

    _renderMonitoringChart(chartData = {}) {
        const svg = document.querySelector('#monitoringChartSvg');
        if (!svg) return;
        const legendContainer = document.querySelector('#monitoringChartLegend');

        const measuredWidth = Math.floor(svg.clientWidth || svg.getBoundingClientRect().width || 800);
        const width = Math.max(320, measuredWidth);
        const height = 220;
        const padding = { top: 18, right: 15, bottom: 34, left: 42 };
        const plotWidth = width - padding.left - padding.right;
        const plotHeight = height - padding.top - padding.bottom;

        svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

        const labels = Array.isArray(chartData.labels) ? chartData.labels : [];
        const series = [
            { key: 'incoming', label: 'Entrants', values: Array.isArray(chartData.incoming) ? chartData.incoming : [], color: 'var(--bs-info)' },
            { key: 'outgoing', label: 'Sortants', values: Array.isArray(chartData.outgoing) ? chartData.outgoing : [], color: 'var(--bs-warning)' },
            { key: 'success', label: 'Succès', values: Array.isArray(chartData.success) ? chartData.success : [], color: 'var(--bs-success)' },
            { key: 'error', label: 'Erreurs', values: Array.isArray(chartData.error) ? chartData.error : [], color: 'var(--bs-danger)' }
        ];

        const maxY = Math.max(1, ...series.flatMap(s => s.values.length > 0 ? s.values : [0]));
        const yStep = Math.max(1, Math.ceil(maxY / 4));
        const displayMaxY = yStep * 4;
        const pointsCount = Math.max(labels.length, 2);
        const stepX = plotWidth / (pointsCount - 1);

        const polylineFromValues = (values = []) => values.map((value, index) => {
            const x = padding.left + (index * stepX);
            const y = padding.top + plotHeight - ((Math.max(0, Number(value || 0)) / displayMaxY) * plotHeight);
            return `${x.toFixed(2)},${y.toFixed(2)}`;
        }).join(' ');

        const yTickValues = [0, yStep, yStep * 2, yStep * 3, yStep * 4];
        const gridLines = yTickValues.map(value => {
            const y = padding.top + plotHeight - ((value / displayMaxY) * plotHeight);
            return `<line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="var(--bs-secondary-color)" stroke-width="1" opacity="0.4" />`;
        }).join('');

        const yAxisLabels = yTickValues.map(value => {
            const y = padding.top + plotHeight - ((value / displayMaxY) * plotHeight);
            return `<text x="${padding.left - 6}" y="${y + 4}" fill="var(--bs-light)" font-size="10" text-anchor="end">${value}</text>`;
        }).join('');

        const xLabelIndexes = Array.from(new Set([
            0,
            Math.max(0, Math.floor((labels.length - 1) / 2)),
            Math.max(0, labels.length - 1)
        ]));
        const xAxisLabels = xLabelIndexes.map(index => {
            const x = padding.left + (index * stepX);
            const label = labels[index] || '';
            return `<text x="${x}" y="${height - 8}" fill="var(--bs-light)" font-size="10" text-anchor="middle">${label}</text>`;
        }).join('');

        if (legendContainer) {
            legendContainer.innerHTML = series.map(s => `
                <span class="d-inline-flex align-items-center gap-1" style="font-size: 0.8rem; color: ${s.color};">
                    <span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${s.color};"></span>
                    <span>${s.label}</span>
                </span>
            `).join('');
        }

        const paths = series.map(s => {
            const points = polylineFromValues(s.values);
            if (!points) return '';
            return `<polyline points="${points}" fill="none" stroke="${s.color}" stroke-width="2" />`;
        }).join('');

        svg.innerHTML = `
            <rect x="0" y="0" width="${width}" height="${height}" fill="#101010"></rect>
            ${gridLines}
            ${yAxisLabels}
            <line x1="${padding.left}" y1="${padding.top + plotHeight}" x2="${width - padding.right}" y2="${padding.top + plotHeight}" stroke="var(--bs-secondary-color)" stroke-width="1" opacity="0.6"></line>
            <line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${padding.top + plotHeight}" stroke="var(--bs-secondary-color)" stroke-width="1" opacity="0.6"></line>
            ${paths}
            ${xAxisLabels}
        `;
    }

    _renderMonitoringLogs(logs = []) {
        const tbody = document.querySelector('#monitoringLogsBody');
        if (!tbody) return;

        const levelColor = (level) => {
            if (level === 'ERROR') return 'var(--bs-danger)';
            if (level === 'WARN') return 'var(--bs-warning)';
            return 'var(--bs-info)';
        };

        const sanitizeHtml = (value) => String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        const dt = this.state?.monitoring?.logsDataTable;
        if (dt) {
            const rows = (Array.isArray(logs) ? logs : []).map(log => {
                const level = String(log?.level || 'INFO');
                const date = String(log?.date || '');
                const message = sanitizeHtml(log?.message || '');
                return [
                    `<span style="color:${levelColor(level)};font-weight:600;">${level}</span>`,
                    date,
                    `<span style="word-break: break-word;">${message}</span>`
                ];
            });

            dt.clear();
            if (rows.length > 0) {
                dt.rows.add(rows);
            }
            dt.draw(false);
            return;
        }

        if (!Array.isArray(logs) || logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" class="text-muted">Aucun log disponible</td></tr>';
            return;
        }

        tbody.innerHTML = logs.map(log => {
            const safeMessage = sanitizeHtml(log?.message || '');
            return `
                <tr>
                    <td><span style="color:${levelColor(log?.level)};font-weight:600;">${String(log?.level || 'INFO')}</span></td>
                    <td>${String(log?.date || '')}</td>
                    <td style="word-break: break-word;">${safeMessage}</td>
                </tr>
            `;
        }).join('');
    }

    _initializeMonitoringLogsTable() {
        const tableEl = document.querySelector('#monitoringLogsTable');
        if (!tableEl || typeof $ === 'undefined' || !$.fn || !$.fn.DataTable) return;

        if ($.fn.DataTable.isDataTable(tableEl)) {
            this.state.monitoring.logsDataTable = $(tableEl).DataTable();
            this._fixMonitoringLogsDateHeaderSortLayout();
            return;
        }

        this.state.monitoring.logsDataTable = $(tableEl).DataTable({
            paging: false,
            lengthChange: false,
            order: [[1, 'desc']],
            autoWidth: false,
            dom: 'ftip',
            columnDefs: [
                { targets: 0, width: '110px' },
                { targets: 1, width: '180px' }
            ],
            language: {
                search: 'Filtrer:',
                zeroRecords: 'Aucun log correspondant',
                info: 'Affichage _START_ à _END_ sur _TOTAL_ logs',
                infoEmpty: 'Affichage 0 à 0 sur 0 logs',
                infoFiltered: '(filtré de _MAX_ logs)'
            }
        });

        $(tableEl).on('draw.dt', () => {
            this._fixMonitoringLogsDateHeaderSortLayout();
        });

        this._applyMonitoringLogLevelFilter();
        this._fixMonitoringLogsDateHeaderSortLayout();
        this._moveMonitoringLogsSearchToHeader();
    }

    _moveMonitoringLogsSearchToHeader() {
        const slot = document.querySelector('#monitoringLogsSearchSlot');
        const wrapper = document.querySelector('#monitoringLogsTable_wrapper');
        if (!slot || !wrapper) return;

        const searchEl = wrapper.querySelector('.dt-search');
        if (!searchEl) return;

        if (searchEl.parentElement !== slot) {
            slot.appendChild(searchEl);
        }

        searchEl.style.marginLeft = '0';
        searchEl.style.marginBottom = '0';
    }

    _fixMonitoringLogsDateHeaderSortLayout() {
        const dateHeader = document.querySelector('#monitoringLogsTable thead th:nth-child(2)');
        if (!dateHeader) return;

        dateHeader.style.textAlign = 'left';
        dateHeader.style.direction = 'ltr';
        dateHeader.style.display = '';
        dateHeader.style.alignItems = '';
        dateHeader.style.justifyContent = '';
        dateHeader.style.gap = '';

        const title = dateHeader.querySelector('.dt-column-title');
        const order = dateHeader.querySelector('.dt-column-order');

        if (title && order) {
            if (order.previousElementSibling !== title) {
                dateHeader.appendChild(title);
                dateHeader.appendChild(order);
            }
            title.style.display = 'inline-block';
            title.style.marginRight = '6px';
            title.style.float = 'left';

            order.style.display = 'inline-block';
            order.style.float = 'right';
            order.style.marginLeft = '6px';
            order.style.marginRight = '0';
            order.style.verticalAlign = 'middle';

            dateHeader.style.overflow = 'hidden';
        }
    }

    _setupMonitoringLogLevelFilters() {
        const container = document.querySelector('#monitoringLogFilters');
        if (!container || container.dataset.bound) return;

        container.addEventListener('click', (event) => {
            const button = event.target?.closest('button[data-level]');
            if (!button) return;

            const level = String(button.dataset.level || 'ALL').toUpperCase();
            this.state.monitoring.logLevelFilter = level;

            container.querySelectorAll('button[data-level]').forEach(btn => {
                btn.classList.remove('active');
            });
            button.classList.add('active');

            this._applyMonitoringLogLevelFilter();
        });

        container.dataset.bound = '1';
    }

    _applyMonitoringLogLevelFilter() {
        const dt = this.state?.monitoring?.logsDataTable;
        const level = String(this.state?.monitoring?.logLevelFilter || 'ALL').toUpperCase();
        if (!dt) return;

        if (level === 'ALL') {
            dt.column(0).search('');
        } else {
            dt.column(0).search(level, false, false);
        }
        dt.draw(false);
    }

    _persistLastBulkReport(data) {
        if (!data || typeof data !== 'object') return;

        const report = {
            callbackId: String(data.callbackId || '').trim(),
            total: Number(data.total || 0),
            successCount: Number(data.successCount || 0),
            skippedCount: Number(data.skippedCount || 0),
            failCount: Number(data.failCount || 0),
            error: data.error ? String(data.error) : '',
            savedAt: new Date().toISOString()
        };

        this.state.monitoring.lastBulkReport = report;
        this._renderLastBulkReport(report);

        try {
            localStorage.setItem('lastBulkReport', JSON.stringify(report));
        } catch (err) {
            console.warn('Unable to persist last bulk report:', err);
        }
    }

    _restoreLastBulkReport() {
        try {
            const raw = localStorage.getItem('lastBulkReport');
            if (!raw) {
                this.state.monitoring.lastBulkReport = null;
                return;
            }

            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') {
                this.state.monitoring.lastBulkReport = null;
                return;
            }

            this.state.monitoring.lastBulkReport = parsed;
        } catch (err) {
            this.state.monitoring.lastBulkReport = null;
            console.warn('Unable to restore last bulk report:', err);
        }
    }

    _renderLastBulkReport(report) {
        const setText = (selector, value) => {
            const el = document.querySelector(selector);
            if (el) el.textContent = String(value ?? '');
        };

        if (!report) {
            setText('#monitoringLastBulkDate', '-');
            setText('#monitoringLastBulkTotal', 0);
            setText('#monitoringLastBulkSuccess', 0);
            setText('#monitoringLastBulkSkipped', 0);
            setText('#monitoringLastBulkFail', 0);
            setText('#monitoringLastBulkMessage', 'Aucun rapport disponible.');
            return;
        }

        const savedAt = report.savedAt ? new Date(report.savedAt) : null;
        const dateText = savedAt && !Number.isNaN(savedAt.getTime())
            ? savedAt.toLocaleString('fr-CA', { hour12: false })
            : '-';

        setText('#monitoringLastBulkDate', dateText);
        setText('#monitoringLastBulkTotal', Number(report.total || 0));
        setText('#monitoringLastBulkSuccess', Number(report.successCount || 0));
        setText('#monitoringLastBulkSkipped', Number(report.skippedCount || 0));
        setText('#monitoringLastBulkFail', Number(report.failCount || 0));

        const message = report.error
            ? `Erreur: ${report.error}`
            : `${Number(report.successCount || 0)}/${Number(report.total || 0)} envoyés • ${Number(report.skippedCount || 0)} ignorés • ${Number(report.failCount || 0)} erreurs`;
        setText('#monitoringLastBulkMessage', message);
    }

    _clearLastBulkReport() {
        if (!confirm('Effacer définitivement le dernier rapport d\'envoi massif ?')) {
            return;
        }

        this.state.monitoring.lastBulkReport = null;
        this._renderLastBulkReport(null);
        try {
            localStorage.removeItem('lastBulkReport');
        } catch (err) {
            console.warn('Unable to clear last bulk report:', err);
        }
        notificationManager.info('Dernier rapport effacé.');
    }

    _handleMonitoringSummaryRealtime(data) {
        if (!data || typeof data !== 'object') return;
        this.state.monitoring.summary = data;
        this._renderMonitoringSummary(data);
    }

    _handleMonitoringLogRealtime(data) {
        if (!data || typeof data !== 'object') return;
        const current = Array.isArray(this.state.monitoring.logs) ? this.state.monitoring.logs : [];
        current.unshift(data);
        this.state.monitoring.logs = current.slice(0, 200);
        this._renderMonitoringLogs(this.state.monitoring.logs);
    }

    /**
     * Logout
     */
    _logout() {
        localStorage.removeItem('authToken');
        localStorage.removeItem('username');
        this.state.authToken = null;
        this.state.user = null;
        this.state.isLoggedIn = false;
        
        if (this.state.socket) {
            this.state.socket.disconnect();
        }

        if (this._archiveRefreshTimer) {
            clearTimeout(this._archiveRefreshTimer);
        }

        if (this.state?.monitoring?.refreshTimer) {
            clearInterval(this.state.monitoring.refreshTimer);
            this.state.monitoring.refreshTimer = null;
        }
        
        location.reload();
    }
}

// Export class
if (typeof module !== 'undefined' && module.exports) {
    module.exports = cpaSmsApp;
}
