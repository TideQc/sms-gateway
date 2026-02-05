/**
 * Participants Module - Gestion des participants, filtres et DataTable
 * À inclure après sms-module.js
 */

Object.assign(cpaSmsApp.prototype, {
    /**
     * Load participants and initialize DataTable
     */
    async loadParticipants() {
        try {
            const data = await this.api.getParticipants();
            this.state.allParticipants = data.map(p => ({
                id: p.Id,
                name: `${p.Prenom} ${p.NomDeFamille}`,
                phone: p.NumeroTel
            }));

            // Destroy existing DataTable
            if (this.state.dataTable) {
                this.state.dataTable.destroy();
            }

            // Create table HTML
            let tableHtml = `
                <div class="card p-3">
                    <div class="d-flex align-items-center justify-content-between mb-3">
                        <h5 class="text-secondary mb-0">Participants Actifs</h5>
                        <div class="d-flex gap-2">
                            <button id="refreshParticipantsBtn" class="btn btn-icon-only" title="Rafraîchir les données">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#31a651" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <polyline points="23 4 23 10 17 10"></polyline>
                                    <polyline points="1 20 1 14 7 14"></polyline>
                                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36M20.49 15a9 9 0 0 1-14.85 3.36"></path>
                                </svg>
                            </button>
                            <button id="toggleFilters" class="btn btn-icon-only" title="Filtres" data-bs-toggle="modal" data-bs-target="#filtersModal">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#31a651" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
                                </svg>
                            </button>
                            <button id="uploadExcelBtn" class="btn btn-icon-only" title="Importer Excel">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#31a651" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                    <polyline points="7 10 12 15 17 10"></polyline>
                                    <line x1="12" y1="15" x2="12" y2="3"></line>
                                </svg>
                            </button>
                        </div>
                    </div>
                    <div id="activeFiltersTags" class="active-filters-container mb-3"></div>
                    <input type="text" id="customSearch" name="customSearch" class="form-control mb-3" placeholder="Recherche globale (Nom, téléphone...)">
                    
                    <table id="participantsTable" class="table table-hover w-100">
                        <thead>
                            <tr>
                                <th><input type="checkbox" id="selectAll"></th>
                                <th>Nom</th>
                                <th>Téléphone</th>
                                <th>Parc</th>
                                <th>Type Entrainement</th>
                                <th>Date Inscription</th>
                                <th>Coach</th>
                            </tr>
                        </thead>
                        <tbody id="participantList">
            `;

            let rows = '';
            data.forEach(p => {
                const formattedPhone = formatPhoneForDisplay(p.NumeroTel);
                rows += `<tr class="align-middle" data-row-id="${p.Id}">
                    <td><input type="checkbox" id="checkbox-${p.Id}" name="participant-${p.Id}" class="user-check" value="${p.Id}" data-participant-id="${p.Id}" data-name="${p.Prenom} ${p.NomDeFamille}" data-phone="${p.NumeroTel}"></td>
                    <td><strong>${p.Prenom} ${p.NomDeFamille}</strong></td>
                    <td class="phone-number font-monospace">${formattedPhone}</td>
                    <td><span class="badge bg-dark border border-secondary">${p.Parc}</span></td>
                    <td>${p.TypeEntrainement}</td>
                    <td><small>${p.JourInscrit} ${p.HeureInscrit}</small></td>
                    <td>${p.NomEntraineur}</td>
                </tr>`;
            });

            tableHtml += rows + `
                        </tbody>
                    </table>
                </div>
            `;

            const dbPanel = document.querySelector('#mass-panel #db-panel');
            if (dbPanel) dbPanel.innerHTML = tableHtml;

            // Initialize DataTable
            this.state.dataTable = $('#participantsTable').DataTable({
                pageLength: window.innerWidth < 768 ? 20 : 25,
                scrollY: window.innerWidth < 768 ? 'calc(100vh - 550px)' : 'calc(100vh - 400px)',
                scrollCollapse: true,
                dom: 'tip',
                columnDefs: [
                    { orderable: false, targets: 0 },
                    { type: 'string', targets: 2 }
                ],
                language: {
                    info: "Affichage de _START_ à _END_ sur _TOTAL_ participant(e)s",
                    infoEmpty: "Affichage de 0 à 0 sur 0 participant(e)",
                    infoFiltered: "(filtré de _MAX_ participant(e)s au total)",
                    lengthMenu: "Afficher _MENU_ participant(e)s",
                    search: "Rechercher:",
                    zeroRecords: "Aucun(e) participant(e) correspondant(e) trouvé(e)",
                    paginate: {
                        next: ">>",
                        previous: "<<"
                    }
                }
            });

            // Apply styling to DataTable scroll container
            const dtScrollContainer = document.querySelector('.dt-scroll-body');
            if (dtScrollContainer) {
                dtScrollContainer.style.position = 'relative';
                dtScrollContainer.style.overflow = 'auto';
                dtScrollContainer.style.maxHeight = 'calc(-550px + 115vh)';
            }

            this._generateFilters(data);
            this._setupCheckboxHandlers();
            this._createComposeModal();
            
            // Initialize active filters container as hidden
            const activeFiltersContainer = document.querySelector('#activeFiltersTags');
            if (activeFiltersContainer) {
                activeFiltersContainer.style.display = 'none';
            }

            return data;
        } catch (err) {
            console.error('Error loading participants:', err);
            throw err;
        }
    },

    /**
     * Update participants tags in modal
     */
    _updateParticipantsTags() {
        let tagsHtml = '';
        const ids = Object.keys(this.state.selectedParticipants);
        
        if (ids.length === 0) {
            tagsHtml = '<small class="text-muted">Aucun participant sélectionné</small>';
        } else {
            ids.forEach(id => {
                const data = this.state.selectedParticipants[id];
                const formattedPhone = formatPhoneForDisplay(data.phone);
                tagsHtml += `<span class="badge bg-success" style="padding: 8px 10px; font-size: 0.85rem; display: flex; align-items: center; gap: 6px;">
                    <span>${data.name}<br><small style="font-size: 0.7rem; color: #c0c0c0;">${formattedPhone}</small></span>
                    <button type="button" class="btn-close btn-close-white" onclick="app._removeParticipantTag('${id}')" style="font-size: 0.7rem; padding: 0; width: 16px; height: 16px;"></button>
                </span>`;
            });
        }
        
        const tagsContainer = document.querySelector('#participantsTags');
        if (tagsContainer) tagsContainer.innerHTML = tagsHtml;
        
        const selectedCountEl = document.querySelector('#selectedCount');
        if (selectedCountEl) selectedCountEl.textContent = ids.length;
        
        // Update destinataires count in modal
        const destinatairesCountEl = document.querySelector('#destinatairesCount');
        if (destinatairesCountEl) destinatairesCountEl.textContent = ids.length;
        
        // Show/hide compose button
        const composeAction = document.querySelector('#composeAction');
        if (composeAction) {
            if (ids.length > 0) {
                composeAction.classList.remove('d-none');
            } else {
                composeAction.classList.add('d-none');
            }
        }
    },

    /**
     * Remove participant tag
     */
    _removeParticipantTag(participantId) {
        delete this.state.selectedParticipants[participantId];
        const checkbox = document.querySelector(`input.user-check[data-participant-id="${participantId}"]`);
        if (checkbox) {
            checkbox.checked = false;
            // Trigger the change event to update row styling
            checkbox.dispatchEvent(new Event('change', { bubbles: true }));
        }
        this._updateParticipantsTags();
    },

    /**
     * Generate filters from participant data
     */
    _generateFilters(data) {
        // Create modal if it doesn't exist
        if (!document.querySelector('#filtersModal')) {
            this._createFiltersModal();
        }
        
        const setup = (id, key, col) => {
            const vals = [...new Set(data.map(p => p[key]))].filter(Boolean).sort();
            let h = `<button class="btn btn-outline-success btn-sm filter-btn" data-col="${col}" data-val="">Tous</button>`;
            vals.forEach(v => h += `<button class="btn btn-outline-success btn-sm filter-btn" data-col="${col}" data-val="${v}">${v}</button>`);
            const el = document.querySelector(`#${id}`);
            if (el) el.innerHTML = h;
        };
        setup('parcFilters', 'Parc', 3);
        setup('typeFilters', 'TypeEntrainement', 4);
        setup('coachFilters', 'NomEntraineur', 6);
        
        // Setup filter handlers
        this._setupFilterHandlers();
    },

    /**
     * Create filters modal
     */
    _createFiltersModal() {
        const modalsContainer = document.querySelector('#modalsContainer');
        if (!modalsContainer) return;
        
        const modalHtml = `
            <div class="modal fade" id="filtersModal" tabindex="-1" aria-hidden="true">
                <div class="modal-dialog modal-dialog-centered modal-lg">
                    <div class="modal-content" style="background-color: #1a1a1a; border: 1px solid #333;">
                        <div class="modal-header">
                            <h5 class="modal-title" style="color: #31a651;">🔍 Filtres</h5>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body" style="color: #fff;">
                            <div class="mb-3">
                                <span style="color: #31a651; font-weight: 600;">Parc</span>
                                <div id="parcFilters" class="d-flex flex-wrap gap-2" style="margin-top: 10px;"></div>
                            </div>
                            <div class="mb-3">
                                <span style="color: #31a651; font-weight: 600;">Type Entraînement</span>
                                <div id="typeFilters" class="d-flex flex-wrap gap-2" style="margin-top: 10px;"></div>
                            </div>
                            <div class="mb-3">
                                <span style="color: #31a651; font-weight: 600;">Coach</span>
                                <div id="coachFilters" class="d-flex flex-wrap gap-2" style="margin-top: 10px;"></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        modalsContainer.insertAdjacentHTML('beforeend', modalHtml);
    },

    /**
     * Setup filter button handlers
     */
    _setupFilterHandlers() {
        document.querySelectorAll('.filter-btn').forEach(btn => {
            // Clone to remove old listeners
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);
            
            // Add new listener with proper context binding
            newBtn.addEventListener('click', (e) => {
                e.target.classList.toggle('active');
                const isActive = e.target.classList.contains('active');
                e.target.style.backgroundColor = isActive ? '#31a651' : 'transparent';
                e.target.style.color = isActive ? '#0a0a0a' : '#31a651';
                
                // Apply filters
                this._applyTableFilters();
            });
        });
    },

    /**
     * Create compose message modal
     */
    _createComposeModal() {
        const modalsContainer = document.querySelector('#modalsContainer');
        if (!modalsContainer) return;
        
        if (document.querySelector('#composeModal')) {
            return; // Already exists
        }
        
        const modalHtml = `
            <div class="modal fade" id="composeModal" tabindex="-1" aria-hidden="true">
                <div class="modal-dialog modal-dialog-scrollable modal-dialog-centered modal-lg">
                    <div class="modal-content" style="background-color: #1a1a1a; border: 1px solid #333;">
                        <div class="modal-header">
                            <h5 class="modal-title" style="color: #31a651;">✉️ Rédiger un message de masse</h5>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body" style="color: #fff;">
                            <div class="mb-3">
                                <label class="form-label mb-2 ms-2" for="participantsSearch">Destinataires (<span id="destinatairesCount">0</span>)</label>
                                <div id="participantsTags" class="mb-2 p-2" style="background-color: #1a1a1a; border: 1px solid #333; border-radius: 6px; min-height: 40px; max-height: 120px; overflow-y: auto; display: flex; flex-wrap: wrap; align-items: flex-start; gap: 6px; align-content: flex-start;"></div>
                                <input type="text" id="participantsSearch" name="participantsSearch" class="form-control" placeholder="Rechercher et ajouter des participants..." style="background-color: #1a1a1a; border: 1px solid #333;">
                                <div id="participantsSuggestions" class="mt-2" style="background-color: #222; border: 1px solid #333; border-radius: 6px; max-height: 150px; overflow-y: auto; display: none; position: absolute; width: calc(100% - 40px); z-index: 1000;"></div>
                            </div>
                            <div class="mb-3">
                                <label for="bulkMessage" class="form-label" style="color: #31a651; font-weight: 600;">Message:</label>
                                <textarea id="bulkMessage" class="form-control" rows="6" style="background-color: #0a0a0a; border: 1px solid #333; color: #fff;" placeholder="Entrez votre message..."></textarea>
                                <small class="text-muted d-block mt-2">Caractères: <span id="charCount">0</span>/160</small>
                            </div>
                            <div class="d-flex justify-content-between">
                                <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Annuler</button>
                                <button type="button" id="sendBulkBtn" class="btn btn-success">📤 Envoyer</button>
                            </div>
                            <div id="bulkSendProgress" class="mt-3" style="display: none;">
                                <div class="progress" style="height: 25px;">
                                    <div id="progressBar" class="progress-bar" role="progressbar" style="background-color: #31a651; width: 0%">0%</div>
                                </div>
                                <small class="text-muted d-block mt-2" id="progressText">Envoi en cours...</small>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        modalsContainer.insertAdjacentHTML('beforeend', modalHtml);
        
        // Setup event listeners
        this._setupComposeModalHandlers();
    },

    /**
     * Setup compose modal event handlers
     */
    _setupComposeModalHandlers() {
        // Character counter
        const bulkMessage = document.querySelector('#bulkMessage');
        if (bulkMessage) {
            bulkMessage.addEventListener('keyup', () => {
                const count = bulkMessage.value.length;
                const charCount = document.querySelector('#charCount');
                if (charCount) charCount.textContent = count;
            });
        }
        
        // Participants search field
        const participantsSearch = document.querySelector('#participantsSearch');
        if (participantsSearch) {
            participantsSearch.addEventListener('keyup', debounce((e) => {
                this._handleParticipantsSearch(e.target.value);
            }, 300));
        }
        
        // Send button
        const sendBtn = document.querySelector('#sendBulkBtn');
        if (sendBtn) {
            sendBtn.addEventListener('click', () => this._sendBulkMessage());
        }
    },

    /**
     * Handle participants search and suggestions
     */
    _handleParticipantsSearch(query) {
        const suggestionsDiv = document.querySelector('#participantsSuggestions');
        if (!suggestionsDiv) return;
        
        if (query.trim().length === 0) {
            suggestionsDiv.style.display = 'none';
            return;
        }
        
        // Filter participants by name or phone
        const normalizedQuery = this._normalizeString(query.toLowerCase());
        const matches = this.state.allParticipants.filter(p => {
            const nameMatch = this._normalizeString(p.name.toLowerCase()).includes(normalizedQuery);
            const phoneMatch = p.phone.includes(query);
            return (nameMatch || phoneMatch) && !(p.id in this.state.selectedParticipants);
        });
        
        if (matches.length === 0) {
            suggestionsDiv.innerHTML = '<div class="p-2 text-muted">Aucun participant trouvé</div>';
            suggestionsDiv.style.display = 'block';
            return;
        }
        
        let html = '';
        matches.slice(0, 10).forEach(p => {
            html += `<div class="p-2 border-bottom" style="cursor: pointer; hover: background-color: #333;" onclick="app._addParticipantFromSearch('${p.id}', '${p.name}', '${p.phone}')">
                <strong>${p.name}</strong><br>
                <small class="text-muted">${p.phone}</small>
            </div>`;
        });
        
        suggestionsDiv.innerHTML = html;
        suggestionsDiv.style.display = 'block';
    },

    /**
     * Add participant from search suggestions
     */
    _addParticipantFromSearch(participantId, name, phone) {
        this.state.selectedParticipants[participantId] = { name, phone };
        this._updateParticipantsTags();
        
        // Clear search
        const participantsSearch = document.querySelector('#participantsSearch');
        if (participantsSearch) {
            participantsSearch.value = '';
        }
        const suggestionsDiv = document.querySelector('#participantsSuggestions');
        if (suggestionsDiv) {
            suggestionsDiv.style.display = 'none';
        }
    },

    /**
     * Send bulk message
     */
    async _sendBulkMessage() {
        const ids = Object.keys(this.state.selectedParticipants);
        if (ids.length === 0) {
            notificationManager.error('Aucun participant sélectionné');
            return;
        }
        
        const message = document.querySelector('#bulkMessage')?.value?.trim();
        if (!message) {
            notificationManager.error('Veuillez entrer un message');
            return;
        }
        
        // Demander confirmation AVANT d'envoyer
        const confirmMessage = `Envoyer à ${ids.length} personne(s) ?\n\nMessage : ${message}`;
        if (!confirm(confirmMessage)) {
            return;
        }
        
        try {
            const sendBtn = document.querySelector('#sendBulkBtn');
            const progressDiv = document.querySelector('#bulkSendProgress');
            
            sendBtn.disabled = true;
            progressDiv.style.display = 'block';
            
            // Emit bulk send via WebSocket
            const callbackId = `bulk-${Date.now()}`;
            this.state.smsQuickReplyCallbacks[callbackId] = (result) => {
                progressDiv.style.display = 'none';
                sendBtn.disabled = false;
                
                if (result.success || result.failCount === 0) {
                    notificationManager.success(`${result.successCount}/${result.total} messages envoyés avec succès!`);
                    // Reset form and close modal
                    document.querySelector('#bulkMessage').value = '';
                    document.querySelector('#charCount').textContent = '0';
                    this.state.selectedParticipants = {};
                    this._updateParticipantsTags();
                    bootstrap.Modal.getInstance(document.querySelector('#composeModal'))?.hide();
                } else if (result.failCount > 0) {
                    const msg = `${result.successCount}/${result.total} messages envoyés. ${result.failCount} erreur(s).`;
                    notificationManager.warning(msg);
                    if (result.errors) {
                        console.warn('Erreurs:', result.errors);
                    }
                } else {
                    notificationManager.error('Erreur lors de l\'envoi');
                }
            };
            
            this.state.socket.emit('bulk-sms', {
                recipients: ids,
                message: message,
                callbackId: callbackId
            });
            
            // Timeout after 30s
            setTimeout(() => {
                if (this.state.smsQuickReplyCallbacks[callbackId]) {
                    delete this.state.smsQuickReplyCallbacks[callbackId];
                    progressDiv.style.display = 'none';
                    sendBtn.disabled = false;
                    notificationManager.error('Délai d\'attente dépassé');
                }
            }, 30000);
            
        } catch (err) {
            console.error('Error sending bulk message:', err);
            notificationManager.error('Erreur lors de l\'envoi');
            document.querySelector('#sendBulkBtn').disabled = false;
            document.querySelector('#bulkSendProgress').style.display = 'none';
        }
    },

    /**
     * Normalize string for accent-insensitive comparison
     */
    _normalizeString(str) {
        return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    },

    /**
     * Apply active filters to DataTable
     */
    _applyTableFilters() {
        if (!this.state.dataTable) return;
        
        // Get active filters by column
        const filters = {
            3: [],  // Parc
            4: [],  // Type
            6: []   // Coach
        };
        
        document.querySelectorAll('.filter-btn.active').forEach(btn => {
            const col = parseInt(btn.getAttribute('data-col'));
            const val = btn.getAttribute('data-val');
            if (val) filters[col].push(this._normalizeString(val));
        });
        
        // Custom search function
        $.fn.dataTable.ext.search.pop();
        $.fn.dataTable.ext.search.push((settings, data) => {
            if (filters[3].length === 0 && filters[4].length === 0 && filters[6].length === 0) return true;
            
            const parc = filters[3].length === 0 || filters[3].includes(this._normalizeString(data[3]));
            const type = filters[4].length === 0 || filters[4].includes(this._normalizeString(data[4]));
            const coach = filters[6].length === 0 || filters[6].includes(this._normalizeString(data[6]));
            
            return parc && type && coach;
        });
        
        this.state.dataTable.draw();
        
        // Update active filter tags display
        this._updateActiveFilterTags();
    },
    
    /**
     * Update active filter tags display
     */
    _updateActiveFilterTags() {
        const activeFiltersContainer = document.querySelector('#activeFiltersTags');
        if (!activeFiltersContainer) return;
        
        let tagsHtml = '';
        const filterLabels = {
            3: 'Parc',
            4: 'Type',
            6: 'Coach'
        };
        
        document.querySelectorAll('.filter-btn.active').forEach(btn => {
            const col = parseInt(btn.getAttribute('data-col'));
            const val = btn.getAttribute('data-val');
            if (val && col !== 0) {  // Skip empty filter (Tous)
                const label = filterLabels[col] || 'Filtre';
                tagsHtml += `<span class="badge bg-success">${label}: ${val}</span>`;
            }
        });
        
        // Adjust dt-scroll-body height based on activeFiltersTags visibility
        const dtScrollContainer = document.querySelector('.dt-scroll-body');
        if (tagsHtml === '') {
            activeFiltersContainer.innerHTML = '';
            activeFiltersContainer.style.display = 'none';
            // Restore original height when no filters
            if (dtScrollContainer) {
                dtScrollContainer.style.maxHeight = 'calc(-550px + 115vh)';
            }
        } else {
            activeFiltersContainer.innerHTML = tagsHtml;
            activeFiltersContainer.style.display = 'flex';
            // Reduce dt-scroll-body height by the height of activeFiltersTags
            if (dtScrollContainer) {
                // Use a small timeout to allow the DOM to update and get accurate height
                setTimeout(() => {
                    const tagsHeight = activeFiltersContainer.offsetHeight;
                    dtScrollContainer.style.maxHeight = `calc(-550px + 115vh - ${tagsHeight + 20}px)`;
                }, 0);
            }
        }
    },

    /**
     * Setup checkbox event handlers
     */
    _setupCheckboxHandlers() {
        // Refresh button
        const refreshBtn = document.querySelector('#refreshParticipantsBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', async () => {
                refreshBtn.disabled = true;
                refreshBtn.classList.add('spinning');
                try {
                    await this.loadParticipants();
                    notificationManager.success('Participants rafraîchis');
                } catch (err) {
                    console.error('Error refreshing participants:', err);
                    notificationManager.error('Erreur lors du rafraîchissement');
                } finally {
                    refreshBtn.disabled = false;
                    refreshBtn.classList.remove('spinning');
                }
            });
        }
        
        // Attach listeners to visible checkboxes
        this._attachCheckboxListeners();

        // Select all checkbox - select filtered participants or ALL if no filters
        const selectAllCheckbox = document.querySelector('#selectAll');
        if (selectAllCheckbox) {
            selectAllCheckbox.addEventListener('change', async (e) => {
                try {
                    if (e.target.checked) {
                        // Check if filters are active
                        const filters = {
                            3: [],  // Parc
                            4: [],  // Type
                            6: []   // Coach
                        };
                        
                        document.querySelectorAll('.filter-btn.active').forEach(btn => {
                            const col = parseInt(btn.getAttribute('data-col'));
                            const val = btn.getAttribute('data-val');
                            if (val) filters[col].push(this._normalizeString(val));
                        });
                        
                        const hasActiveFilters = filters[3].length > 0 || filters[4].length > 0 || filters[6].length > 0;
                        
                        if (hasActiveFilters) {
                            // Get all raw data from the table to filter (includes all pages)
                            const allRows = this.state.dataTable.settings()[0].aoData || [];
                            allRows.forEach((rowData) => {
                                // Each row data is an array: [checkbox, name, phone, parc, type, date, coach]
                                const data = rowData._aData;
                                if (!Array.isArray(data)) return;
                                
                                // Check if this row matches the filters
                                const parc = filters[3].length === 0 || filters[3].includes(this._normalizeString(data[3]));
                                const type = filters[4].length === 0 || filters[4].includes(this._normalizeString(data[4]));
                                const coach = filters[6].length === 0 || filters[6].includes(this._normalizeString(data[6]));
                                
                                if (parc && type && coach) {
                                    // Find the row element to get the participant ID
                                    const rowNode = rowData.nTr;
                                    if (rowNode) {
                                        const participantId = rowNode.getAttribute('data-row-id');
                                        const checkbox = rowNode.querySelector('input.user-check');
                                        if (checkbox && participantId) {
                                            const name = checkbox.getAttribute('data-name');
                                            const phone = checkbox.getAttribute('data-phone');
                                            this.state.selectedParticipants[participantId] = { name, phone };
                                        }
                                    }
                                }
                            });
                        } else {
                            // No filters - select ALL participants from database
                            const data = await this.api.getParticipants();
                            data.forEach(p => {
                                this.state.selectedParticipants[p.Id] = {
                                    name: `${p.Prenom} ${p.NomDeFamille}`,
                                    phone: p.NumeroTel
                                };
                            });
                        }
                    } else {
                        // Unselect all
                        this.state.selectedParticipants = {};
                    }
                    // Update visible checkboxes
                    document.querySelectorAll('input.user-check').forEach(checkbox => {
                        checkbox.checked = e.target.checked;
                    });
                    this._updateParticipantsTags();
                } catch (err) {
                    console.error('Error in selectAll:', err);
                    notificationManager.error('Erreur lors de la sélection');
                }
            });
        }

        // Global search handler
        const customSearch = document.querySelector('#customSearch');
        if (customSearch && this.state.dataTable) {
            customSearch.addEventListener('keyup', debounce(() => {
                this.state.dataTable.search(customSearch.value).draw();
            }, 300));
        }

        // Compose button handler
        const btnCompose = document.querySelector('#btnCompose');
        if (btnCompose) {
            btnCompose.addEventListener('click', () => {
                const composeModal = bootstrap.Modal.getOrCreateInstance(document.querySelector('#composeModal'));
                composeModal.show();
            });
        }

        // Resync checkboxes when DataTable redraws (page change, filter, search, etc.)
        if (this.state.dataTable) {
            $(this.state.dataTable.table().container()).on('draw.dt', () => {
                // Resync checkbox states
                document.querySelectorAll('input.user-check').forEach(checkbox => {
                    const participantId = checkbox.getAttribute('data-participant-id');
                    checkbox.checked = participantId in this.state.selectedParticipants;
                });
                // Reattach event listeners to newly created checkboxes
                this._attachCheckboxListeners();
            });
        }
    },

    /**
     * Attach change listeners to checkboxes (called after DOM changes)
     */
    _attachCheckboxListeners() {
        // Attach listeners to checkboxes
        document.querySelectorAll('input.user-check').forEach(checkbox => {
            // Remove old listeners by cloning
            const newCheckbox = checkbox.cloneNode(true);
            checkbox.parentNode.replaceChild(newCheckbox, checkbox);
            
            // Add new listener
            newCheckbox.addEventListener('change', (e) => {
                const participantId = e.target.getAttribute('data-participant-id');
                const name = e.target.getAttribute('data-name');
                const phone = e.target.getAttribute('data-phone');
                const row = e.target.closest('tr');

                if (e.target.checked) {
                    this.state.selectedParticipants[participantId] = { name, phone };
                    // Add selected class to row
                    if (row) row.classList.add('selected');
                } else {
                    delete this.state.selectedParticipants[participantId];
                    // Remove selected class from row
                    if (row) row.classList.remove('selected');
                }
                this._updateParticipantsTags();
            });
        });
        
        // Attach listeners to table rows to toggle checkbox on click
        document.querySelectorAll('#participantList tr').forEach(row => {
            row.addEventListener('click', (e) => {
                // Don't toggle if clicking on the checkbox itself
                if (e.target.type === 'checkbox') return;
                
                // Find the checkbox in this row
                const checkbox = row.querySelector('input.user-check');
                if (checkbox) {
                    checkbox.checked = !checkbox.checked;
                    // Trigger the change event manually
                    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
                }
            });
        });
    }
});
