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
            openConversation: null
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
            markConversationRead: async (contactKey) => {
                return await this.api.call('/mark-conversation-read', {
                    method: 'POST',
                    body: { contactKey }
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
                                        <input type="password" id="loginPassword" name="loginPassword" class="form-control" placeholder="Entrez votre mot de passe" required>
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
                                    <button class="burger-icon" id="burgerToggle">
                                        <span></span>
                                        <span></span>
                                        <span></span>
                                    </button>
                                    <div class="burger-dropdown" id="burgerDropdown">
                                        <div id="pixelStatusContainer" class="burger-dropdown-item" style="justify-content: flex-start;">
                                            <div id="pixelStatusDot" style="width: 8px; height: 8px; border-radius: 50%; background-color: #888; transition: all 0.3s ease; margin-right: 8px;"></div>
                                            <span id="pixelStatusText" style="color: #888; font-size: 0.85rem;">Vérification...</span>
                                        </div>
                                        <div class="burger-dropdown-item">
                                            <span class="user-info">Connecté : <strong id="loggedUsername"></strong></span>
                                        </div>
                                        <div class="burger-dropdown-item">
                                            <button id="btnLogout" class="btn btn-logout btn-sm">Déconnexion</button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="container-fluid" style="height: calc(100vh - 64px); display: flex; flex-direction: column; padding: 0;">
                            <div class="col-12" id="tabsContainer" style="flex: 1; display: flex; flex-direction: column; overflow: hidden;">
                                <ul class="nav nav-tabs mb-3" id="sendTab">
                                    <li class="nav-item"><button class="nav-link active" id="mass-tab" data-bs-toggle="tab" data-bs-target="#mass-panel">Saisie de masse</button></li>
                                    <li class="nav-item"><button class="nav-link" id="sms-tab" data-bs-toggle="tab" data-bs-target="#sms-panel">SMS <span id="unreadBadge" class="badge bg-danger ms-2" style="display: none;">0</span></button></li>
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
                                                    <h6>Importer depuis la base de données</h6>
                                                    <p class="text-muted">Fonctionnalité à implémenter</p>
                                                </div>
                                            </div>
                                            <div class="tab-pane fade" id="manual-panel">
                                                <div style="padding: 15px;">
                                                    <h6>Saisie Manuelle</h6>
                                                    <form id="manualSmsForm" style="max-width: 600px;">
                                                        <div class="mb-3">
                                                            <label for="manualNumbers" class="form-label">Numéros de téléphone (séparés par des virgules) *</label>
                                                            <textarea class="form-control" id="manualNumbers" rows="4" placeholder="+15141234567, +15149876543, ..." required style="resize: none; font-family: monospace;"></textarea>
                                                            <small class="text-muted d-block mt-1"><span id="numberCount">0</span> numéro(s) détecté(s)</small>
                                                        </div>
                                                        <div class="mb-3">
                                                            <label for="manualMessage" class="form-label">Message *</label>
                                                            <textarea class="form-control" id="manualMessage" rows="4" placeholder="Votre message..." required style="resize: none;"></textarea>
                                                            <small class="text-muted d-block mt-1"><span id="charCount">0</span>/160 caractères</small>
                                                        </div>
                                                        <button type="submit" class="btn btn-primary" style="background-color: #31a651; border-color: #31a651;">
                                                            📤 Envoyer SMS
                                                        </button>
                                                    </form>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="tab-pane fade" id="sms-panel">
                                        <div id="smsTabContent" style="padding: 15px;">
                                            <div id="archiveSection">
                                                <h5 class="text-secondary">Conversations</h5>
                                                <div id="archiveContactsList"></div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- MODALS -->
                        <div id="modalsContainer"></div>
                        
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
            
            // Setup manual SMS form
            this._setupManualSmsForm();
            
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
        const messageInput = document.querySelector('#manualMessage');
        const numbersInput = document.querySelector('#manualNumbers');
        const charCount = document.querySelector('#charCount');
        const numberCount = document.querySelector('#numberCount');
        const submitBtn = form.querySelector('button[type="submit"]');
        
        // Mise à jour du compteur de caractères
        if (messageInput) {
            messageInput.addEventListener('input', () => {
                charCount.textContent = messageInput.value.length;
            });
        }
        
        // Mise à jour du compteur de numéros
        if (numbersInput) {
            numbersInput.addEventListener('input', () => {
                const phones = numbersInput.value
                    .split(',')
                    .map(p => p.trim())
                    .filter(p => p && p.length > 0);
                numberCount.textContent = phones.length;
            });
        }
        
        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                
                const message = messageInput.value.trim();
                const numbersText = numbersInput.value.trim();
                
                if (!message) {
                    notificationManager.warning('Veuillez entrer un message');
                    return;
                }
                
                if (!numbersText) {
                    notificationManager.warning('Veuillez entrer au moins un numéro de téléphone');
                    return;
                }
                
                // Parsing des numéros
                const phones = numbersText
                    .split(',')
                    .map(p => p.trim())
                    .filter(p => p && p.length > 0);
                
                if (phones.length === 0) {
                    notificationManager.warning('Veuillez entrer au moins un numéro de téléphone valide');
                    return;
                }
                
                // Validation: chaque numéro doit contenir au moins 10 chiffres après nettoyage
                const validatedPhones = [];
                const invalidPhones = [];
                
                for (const phone of phones) {
                    // Nettoyer le numéro: enlever tout sauf les chiffres et le +
                    const cleaned = phone.replace(/[^\d+]/g, '');
                    // Compter les chiffres
                    const digitCount = cleaned.replace(/\D/g, '').length;
                    
                    if (digitCount >= 10 && cleaned.length >= 10) {
                        validatedPhones.push(phone); // Garder le format original pour l'envoi
                    } else {
                        invalidPhones.push(phone);
                    }
                }
                
                if (invalidPhones.length > 0) {
                    notificationManager.error(`Numéro(s) invalide(s) (min 10 chiffres): ${invalidPhones.join(', ')}`);
                    return;
                }
                
                // Utiliser seulement les numéros validés
                const phonesToSend = validatedPhones;
                
                // Demander confirmation AVANT d'envoyer
                const confirmMessage = `Envoyer à ${phonesToSend.length} numéro(s) ?\n\nMessage : ${message}`;
                if (!confirm(confirmMessage)) {
                    return;
                }
                
                // Désactivation du bouton et affichage du spinner
                submitBtn.disabled = true;
                const originalText = submitBtn.innerHTML;
                submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Envoi en cours...';
                
                let successCount = 0;
                let failCount = 0;
                const errors = [];
                
                try {
                    // Envoi à chaque numéro validé
                    for (const phone of phonesToSend) {
                        try {
                            const response = await this.api.sendSms({
                                phone: phone,
                                message: message,
                                name: null
                            });
                            
                            if (response && response.success) {
                                successCount++;
                            } else {
                                failCount++;
                                errors.push(`${phone}: ${response?.error || 'Erreur inconnue'}`);
                            }
                        } catch (error) {
                            console.error(`Erreur lors de l'envoi à ${phone}:`, error);
                            failCount++;
                            errors.push(`${phone}: ${error.message}`);
                        }
                    }
                    
                    // Affichage du résultat
                    if (successCount > 0 && failCount === 0) {
                        const msgResult = phonesToSend.length === 1 
                            ? 'SMS envoyé avec succès!' 
                            : `SMS envoyé à ${successCount}/${phonesToSend.length} numéro(s)`;
                        notificationManager.success(msgResult);
                        form.reset();
                        numberCount.textContent = '0';
                        charCount.textContent = '0';
                    } else if (successCount === 0) {
                        notificationManager.error('Erreur: Aucun SMS n\'a pu être envoyé');
                        if (errors.length > 0) {
                            console.error('Détails des erreurs:', errors);
                        }
                    } else {
                        const msgResult = `SMS envoyé à ${successCount}/${phonesToSend.length} numéro(s)`;
                        notificationManager.warning(msgResult);
                        if (errors.length > 0) {
                            console.warn('Erreurs partielles:', errors);
                        }
                    }
                } catch (error) {
                    console.error('Erreur lors de l\'envoi des SMS:', error);
                    notificationManager.error('Erreur lors de l\'envoi des SMS: ' + error.message);
                } finally {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = originalText;
                }
            });
        }
    }

    /**
     * Setup burger menu
     */
    _setupBurgerMenu() {
        const toggle = document.querySelector('#burgerToggle');
        const dropdown = document.querySelector('#burgerDropdown');
        
        if (toggle && dropdown) {
            toggle.addEventListener('click', (e) => {
                e.stopPropagation();
                dropdown.classList.toggle('show');
                toggle.classList.toggle('active');
            });
            
            document.addEventListener('click', (e) => {
                if (!e.target.closest('.burger-menu')) {
                    dropdown.classList.remove('show');
                    toggle.classList.remove('active');
                }
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

        this.state.socket.on('progress', (data) => {
            this._handleProgress(data);
        });

        this.state.socket.on('finish', () => {
            this._handleSMSComplete();
        });

        this.state.socket.on('new-sms', (data) => {
            this._handleNewSMS(data);
        });

        this.state.socket.on('sms-sent', (data) => {
            this._handleSMSSent(data);
        });

        this.state.socket.on('bulk-sms-response', (data) => {
            this._handleBulkSMSResponse(data);
        });
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
     * Handle new SMS
     */
    _handleNewSMS(data) {
        // Try to add message to open conversation
        const addedToConversation = this.addReceivedMessageToConversation(data);
        
        // If conversation is not open, reload archive
        if (!addedToConversation) {
            this.loadArchive();
        }
        
        // Show notification
        const senderName = data.Prenom && data.NomDeFamille ? 
            `${data.Prenom} ${data.NomDeFamille}` : 
            (data.SenderNumber || 'Inconnu');
        notificationManager.info(`Nouveau SMS de ${senderName}`);
        
        console.log('📨 Nouveau SMS reçu de:', data.SenderNumber);
    }

    /**
     * Handle SMS sent
     */
    _handleSMSSent(data) {
        // Call the callback if it exists
        if (data.callbackId && this.state.smsQuickReplyCallbacks[data.callbackId]) {
            this.state.smsQuickReplyCallbacks[data.callbackId](data);
        }
    }

    /**
     * Handle bulk SMS response
     */
    _handleBulkSMSResponse(data) {
        // Call the callback if it exists
        if (data.callbackId && this.state.smsQuickReplyCallbacks[data.callbackId]) {
            this.state.smsQuickReplyCallbacks[data.callbackId](data);
            delete this.state.smsQuickReplyCallbacks[data.callbackId];
        }
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
        
        location.reload();
    }
}

// Export class
if (typeof module !== 'undefined' && module.exports) {
    module.exports = cpaSmsApp;
}
