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
     * Open compose modal with recipients loaded from phone numbers
     */
    openComposeWithPhones(cleanedPhones) {
        const normalize = (phone) => {
            let digits = String(phone || '').replace(/\D/g, '');
            if (digits.length === 11 && digits.startsWith('1')) {
                digits = digits.substring(1);
            }
            return digits.length === 10 ? digits : '';
        };

        const participantsByPhone = new Map();
        (this.state.allParticipants || []).forEach(participant => {
            const key = normalize(participant.phone);
            if (key && !participantsByPhone.has(key)) {
                participantsByPhone.set(key, participant);
            }
        });

        this.state.selectedParticipants = {};

        (cleanedPhones || []).forEach(phone => {
            const normalized = normalize(phone);
            if (!normalized) return;

            const participant = participantsByPhone.get(normalized);
            if (participant) {
                this.state.selectedParticipants[String(participant.id)] = {
                    name: participant.name,
                    phone: participant.phone
                };
            } else {
                const manualKey = `manual_${normalized}`;
                this.state.selectedParticipants[manualKey] = {
                    name: 'Numéro manuel',
                    phone: `+1${normalized}`
                };
            }
        });

        this._updateParticipantsTags();

        const composeModalEl = document.querySelector('#composeModal');
        if (composeModalEl) {
            const composeModal = bootstrap.Modal.getOrCreateInstance(composeModalEl);
            composeModal.show();
        }
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
            <div class="modal fade" id="composeModal" tabindex="-1" aria-hidden="true" style="overflow: hidden;">
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
                                <button type="button" id="bulkEmojiBtn" class="btn btn-outline-secondary btn-sm mt-2" title="Ajouter un emoji">😊 Emojis</button>
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
        const bulkEmojiBtn = document.querySelector('#bulkEmojiBtn');
        const massEmojis = ['😀','😁','😂','😊','😉','😍','😘','😎','🤔','😢','😭','😡','👍','👎','👏','🙏','❤️','🔥','✅','❌','⚠️','📨','📞','🎉'];
        if (bulkMessage) {
            bulkMessage.addEventListener('keyup', () => {
                const count = bulkMessage.value.length;
                const charCount = document.querySelector('#charCount');
                if (charCount) charCount.textContent = count;
            });
        }

        let bulkEmojiPicker = document.querySelector('#bulkEmojiPickerFloating');
        if (!bulkEmojiPicker) {
            bulkEmojiPicker = document.createElement('div');
            bulkEmojiPicker.id = 'bulkEmojiPickerFloating';
            bulkEmojiPicker.style.cssText = 'display:none; position:fixed; z-index:1065; padding:10px; background-color:#222; border:1px solid #333; border-radius:8px; max-height:180px; overflow-y:auto; box-shadow:0 8px 24px rgba(0,0,0,0.35);';
            document.body.appendChild(bulkEmojiPicker);
        }

        if (bulkEmojiPicker) {
            bulkEmojiPicker.innerHTML = `
                <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                    ${massEmojis.map(emoji => `<button type="button" class="btn btn-sm btn-outline-light" data-emoji="${emoji}" style="font-size: 1.1rem; padding: 4px 8px;">${emoji}</button>`).join('')}
                </div>
            `;

            bulkEmojiPicker.addEventListener('click', (event) => {
                const emojiBtn = event.target.closest('[data-emoji]');
                if (!emojiBtn || !bulkMessage) return;

                bulkMessage.value += emojiBtn.getAttribute('data-emoji');
                bulkMessage.dispatchEvent(new Event('keyup'));
                bulkMessage.focus();
            });
        }

        if (bulkEmojiBtn && bulkEmojiPicker) {
            bulkEmojiBtn.addEventListener('click', (event) => {
                event.stopPropagation();
                const isVisible = bulkEmojiPicker.style.display !== 'none';
                if (isVisible) {
                    bulkEmojiPicker.style.display = 'none';
                    return;
                }

                bulkEmojiPicker.style.display = 'block';
                const rect = bulkEmojiBtn.getBoundingClientRect();
                const pickerHeight = Math.min(180, bulkEmojiPicker.offsetHeight || 180);
                const pickerWidth = Math.min(420, bulkEmojiPicker.offsetWidth || 320);
                const top = Math.max(10, rect.top - pickerHeight - 8);
                const left = Math.max(10, Math.min(window.innerWidth - pickerWidth - 10, rect.left));
                bulkEmojiPicker.style.top = `${top}px`;
                bulkEmojiPicker.style.left = `${left}px`;
            });

            document.addEventListener('click', (event) => {
                if (!bulkEmojiPicker.contains(event.target) && event.target !== bulkEmojiBtn) {
                    bulkEmojiPicker.style.display = 'none';
                }
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
            sendBtn.onclick = () => this._sendBulkMessage();
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
    async _sendBulkMessage(options = {}) {
        if (this.state.bulkSendInFlight) {
            return;
        }

        const retryRecipients = Array.isArray(options?.recipients) ? options.recipients : null;
        const isRetryMode = retryRecipients && retryRecipients.length > 0;

        const ids = isRetryMode ? [] : Object.keys(this.state.selectedParticipants);
        if (!isRetryMode && ids.length === 0) {
            notificationManager.error('Aucun participant sélectionné');
            return;
        }

        const message = String(options?.message || document.querySelector('#bulkMessage')?.value || '').trim();
        if (!message) {
            notificationManager.error('Veuillez entrer un message');
            return;
        }

        const totalTargets = isRetryMode ? retryRecipients.length : ids.length;
        if (totalTargets === 0) {
            notificationManager.error('Aucun destinataire à relancer');
            return;
        }

        // Demander confirmation AVANT d'envoyer (sauf relance déjà confirmée)
        if (!options?.skipConfirm) {
            const confirmMessage = isRetryMode
                ? `Relancer l'envoi pour ${totalTargets} destinataire(s) en échec ?\n\nMessage : ${message}`
                : `Envoyer à ${totalTargets} personne(s) ?\n\nMessage : ${message}`;
            if (!confirm(confirmMessage)) {
                return;
            }
        }

        try {
            const sendBtn = document.querySelector('#sendBulkBtn');
            const progressDiv = document.querySelector('#bulkSendProgress');
            const progressBar = document.querySelector('#progressBar');
            const progressText = document.querySelector('#progressText');

            if (!sendBtn || !progressDiv) {
                notificationManager.error('UI d\'envoi indisponible');
                return;
            }

            this.state.bulkSendInFlight = true;

            sendBtn.disabled = true;
            progressDiv.style.display = 'block';
            if (progressBar) {
                progressBar.style.width = '0%';
                progressBar.textContent = '0%';
            }
            if (progressText) {
                progressText.textContent = isRetryMode
                    ? `Préparation de la relance... (0/${totalTargets})`
                    : `Préparation de l'envoi... (0/${totalTargets})`;
            }

            const socketRecipients = isRetryMode
                ? retryRecipients.map((recipient) => {
                    const parsedId = parseInt(recipient?.participantId, 10);
                    const participantId = Number.isNaN(parsedId) ? null : parsedId;
                    const payload = {
                        name: recipient?.name || null
                    };

                    if (participantId != null) {
                        payload.participantId = participantId;
                    }

                    if (recipient?.phone) {
                        payload.phone = recipient.phone;
                    }

                    return payload;
                })
                : ids.map(id => {
                    const participant = this.state.selectedParticipants[id] || {};
                    if (String(id).startsWith('manual_')) {
                        return {
                            phone: participant.phone || '',
                            name: participant.name || null
                        };
                    }

                    const parsedId = parseInt(id, 10);
                    if (!Number.isNaN(parsedId)) {
                        return {
                            participantId: parsedId,
                            name: participant.name || null
                        };
                    }

                    return {
                        participantId: id,
                        name: participant.name || null
                    };
                });

            // Emit bulk send via WebSocket
            const callbackId = `bulk-${Date.now()}`;
            let onBulkProgress = null;
            let lastProgressUiUpdateAt = 0;

            try {
                sessionStorage.setItem('bulkSendPending', JSON.stringify({
                    callbackId,
                    total: totalTargets,
                    startedAt: Date.now()
                }));
            } catch (err) {
                console.warn('Unable to persist bulk send pending state:', err);
            }

            const cleanupBulkProgressListener = () => {
                if (onBulkProgress && this.state.socket && typeof this.state.socket.off === 'function') {
                    this.state.socket.off('bulk-sms-progress', onBulkProgress);
                    onBulkProgress = null;
                }
            };

            onBulkProgress = (eventData = {}) => {
                if (eventData.callbackId !== callbackId) return;

                const total = Number(eventData.total || totalTargets || 0);
                const current = Math.min(Number(eventData.current || 0), total || 0);
                const success = Number(eventData.successCount || 0);
                const failed = Number(eventData.failCount || 0);
                const skipped = Number(eventData.skippedCount || 0);
                const percent = total > 0 ? Math.round((current / total) * 100) : 0;

                const now = Date.now();
                const forceUpdate = current >= total;
                if (!forceUpdate && (now - lastProgressUiUpdateAt) < 250) {
                    return;
                }
                lastProgressUiUpdateAt = now;

                if (progressBar) {
                    progressBar.style.width = `${percent}%`;
                    progressBar.textContent = `${percent}%`;
                }
                if (progressText) {
                    const prefix = isRetryMode ? 'Relance en cours...' : 'Envoi en cours...';
                    progressText.textContent = `${prefix} (${current}/${total}) • Succès: ${success} • Ignorés: ${skipped} • Erreurs: ${failed}`;
                }
            };

            this.state.socket.on('bulk-sms-progress', onBulkProgress);

            this.state.smsQuickReplyCallbacks[callbackId] = (result) => {
                cleanupBulkProgressListener();
                progressDiv.style.display = 'none';
                sendBtn.disabled = false;
                this.state.bulkSendInFlight = false;
                try {
                    sessionStorage.removeItem('bulkSendPending');
                } catch (err) {
                    console.warn('Unable to clear bulk send pending state:', err);
                }

                const successCount = Number(result.successCount || 0);
                const failCount = Number(result.failCount || 0);
                const skippedCount = Number(result.skippedCount || 0);
                const totalCount = Number(result.total || totalTargets || 0);

                if (skippedCount > 0) {
                    notificationManager.info(`${skippedCount} message(s) ignoré(s) (déjà envoyés récemment).`);
                }

                if (successCount > 0) {
                    if (typeof this._scheduleArchiveRefresh === 'function') {
                        this._scheduleArchiveRefresh();
                    } else {
                        this.loadArchive().catch(err => console.error('Error refreshing archive after websocket bulk send:', err));
                    }
                }

                if (result.success || failCount === 0) {
                    if (skippedCount > 0) {
                        const processedCount = successCount + skippedCount;
                        notificationManager.success(`${processedCount}/${totalCount} traités. ${successCount} envoyés, ${skippedCount} déjà envoyés ignorés.`);
                    } else {
                        notificationManager.success(`${successCount}/${totalCount} messages envoyés avec succès!`);
                    }

                    if (!isRetryMode) {
                        // Reset form and close modal only on initial send
                        document.querySelector('#bulkMessage').value = '';
                        document.querySelector('#charCount').textContent = '0';
                        this.state.selectedParticipants = {};
                        this._updateParticipantsTags();
                        bootstrap.Modal.getInstance(document.querySelector('#composeModal'))?.hide();
                    }
                } else if (failCount > 0) {
                    let msg = `${successCount}/${totalCount} messages envoyés. ${failCount} erreur(s).`;
                    if (skippedCount > 0) {
                        msg += ` ${skippedCount} déjà envoyés ignorés.`;
                    }
                    notificationManager.show(msg, 'warning');

                    const retryableFailed = Array.isArray(result?.failedRecipients)
                        ? result.failedRecipients.filter(r => (r?.participantId != null) || !!r?.phone)
                        : [];

                    if (retryableFailed.length > 0) {
                        if (typeof notificationManager.showAction === 'function') {
                            notificationManager.showAction(
                                `Relance disponible pour ${retryableFailed.length} destinataire(s) en échec.`,
                                'warning',
                                'Relancer',
                                () => {
                                    this._sendBulkMessage({
                                        recipients: retryableFailed,
                                        message,
                                        skipConfirm: true
                                    });
                                },
                                15000,
                                'Ignorer',
                                () => {/* Just close notification, no-op */}
                            );
                        } else {
                            notificationManager.info(`Relance disponible pour ${retryableFailed.length} destinataire(s) en échec.`);
                        }
                    }

                    if (result.errors) {
                        console.warn('Erreurs:', result.errors);
                    }
                } else {
                    notificationManager.error('Erreur lors de l\'envoi');
                }
            };

            this.state.socket.emit('bulk-sms', {
                recipients: socketRecipients,
                message: message,
                callbackId: callbackId
            });

            // Timeout dynamique (envois bulk longs)
            const timeoutMs = Math.max(30000, (totalTargets * 10000) + 30000);
            setTimeout(() => {
                if (this.state.smsQuickReplyCallbacks[callbackId]) {
                    delete this.state.smsQuickReplyCallbacks[callbackId];
                    cleanupBulkProgressListener();
                    progressDiv.style.display = 'none';
                    sendBtn.disabled = false;
                    this.state.bulkSendInFlight = false;
                    notificationManager.warning('Le serveur peut continuer l\'envoi même si cette page n\'attend plus la réponse.');
                    notificationManager.error('Délai d\'attente dépassé');
                }
            }, timeoutMs);

        } catch (err) {
            console.error('Error sending bulk message:', err);
            notificationManager.error('Erreur lors de l\'envoi');
            this.state.bulkSendInFlight = false;
            try {
                sessionStorage.removeItem('bulkSendPending');
            } catch (clearErr) {
                console.warn('Unable to clear bulk send pending state after error:', clearErr);
            }
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
