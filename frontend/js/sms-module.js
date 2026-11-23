/**
 * SMS Module - Gestion complète des SMS (archive, réception, envoi rapide)
 * À inclure après main.js
 */

// Extension de cpaSmsApp pour les fonctions SMS
Object.assign(cpaSmsApp.prototype, {
    _getArchiveFavoriteKeys() {
        try {
            const raw = localStorage.getItem('archive.favoriteContactKeys');
            const parsed = raw ? JSON.parse(raw) : [];
            return Array.isArray(parsed) ? new Set(parsed.map(String)) : new Set();
        } catch {
            return new Set();
        }
    },

    _saveArchiveFavoriteKeys(favoritesSet) {
        localStorage.setItem('archive.favoriteContactKeys', JSON.stringify(Array.from(favoritesSet || [])));
    },

    _toggleFavoriteConversation(contactKey) {
        const key = String(contactKey || '');
        if (!key) return;

        const favorites = this._getArchiveFavoriteKeys();
        let isNowFavorite = false;
        if (favorites.has(key)) {
            favorites.delete(key);
            isNowFavorite = false;
        } else {
            favorites.add(key);
            isNowFavorite = true;
        }

        this._saveArchiveFavoriteKeys(favorites);
        if (isNowFavorite) {
            notificationManager.success('Conversation ajoutée aux favoris');
        } else {
            notificationManager.info('Conversation retirée des favoris');
        }
        this.loadArchive().catch(err => console.error('Error reloading archive after favorite toggle:', err));
    },

    _getQuickReplyTemplates() {
        return [
            'Bonjour! Merci pour votre message, je vous reviens sous peu.',
            'Parfait, c\'est noté ✅',
            'Merci! Votre demande est prise en charge.',
            'Pouvez-vous me confirmer votre disponibilité?'
        ];
    },

    _applyQuickTemplate(safeId, encodedTemplate) {
        const textarea = document.querySelector(`#reply-${safeId}`);
        if (!textarea) return;

        const decoded = decodeURIComponent(String(encodedTemplate || ''));
        if (!decoded) return;

        const current = String(textarea.value || '').trim();
        textarea.value = current ? `${current}\n${decoded}` : decoded;
        textarea.focus();
    },

    _toggleQuickTemplates(safeId) {
        const panel = document.querySelector(`#quick-templates-${safeId}`);
        const chevron = document.querySelector(`#quick-templates-chevron-${safeId}`);
        if (!panel) return;

        const isOpen = panel.dataset.open === '1';
        if (isOpen) {
            panel.dataset.open = '0';
            panel.style.maxHeight = '0px';
            panel.style.opacity = '0';
            panel.style.marginTop = '0px';
            if (chevron) chevron.textContent = '▾';
            return;
        }

        panel.dataset.open = '1';
        panel.style.opacity = '1';
        panel.style.marginTop = '8px';
        panel.style.maxHeight = `${panel.scrollHeight + 20}px`;
        if (chevron) chevron.textContent = '▴';
    },

    _suggestOldConversationsCleanup(days = 90) {
        this._ensureArchiveSelectionState();

        const thresholdMs = Date.now() - (Number(days) * 24 * 60 * 60 * 1000);
        const cards = Array.from(document.querySelectorAll('#archiveContactsList > .card'));

        if (!cards.length) {
            notificationManager.warning('Aucune conversation à analyser');
            return;
        }

        if (!this._conversationDeleteMode) {
            this._conversationDeleteMode = true;
            this._selectedConversationKeys.clear();
            this.loadArchive().then(() => this._suggestOldConversationsCleanup(days));
            return;
        }

        this._selectedConversationKeys.clear();
        cards.forEach(card => {
            const lastTs = Number(card.getAttribute('data-last-ts') || 0);
            const key = String(card.getAttribute('data-contact-key') || '');
            if (key && lastTs > 0 && lastTs < thresholdMs) {
                this._selectedConversationKeys.add(key);
            }
        });

        document.querySelectorAll('#archiveContactsList .archive-select-checkbox').forEach(cb => {
            const key = String(cb.getAttribute('data-contact-key') || '');
            cb.checked = this._selectedConversationKeys.has(key);
        });

        this._updateArchiveSelectionUI();

        const count = this._selectedConversationKeys.size;
        if (count > 0) {
            notificationManager.success(`${count} conversation(s) ancienne(s) suggérée(s) pour suppression (> ${days} jours)`);
        } else {
            notificationManager.warning(`Aucune conversation plus vieille que ${days} jours`);
        }
    },

    /**
     * Apply read-state update to one conversation instantly (multi-client sync)
     */
    _applyConversationReadUpdate(contactKey) {
        const key = String(contactKey || '');
        if (!key) return;

        const card = document.querySelector(`#archiveContactsList > .card[data-contact-key="${key}"]`);
        if (!card) return;

        const unreadMessageBadges = card.querySelectorAll('.badge-unread');
        const unreadCount = unreadMessageBadges.length;

        unreadMessageBadges.forEach(badge => {
            badge.classList.remove('bg-warning', 'text-dark', 'badge-unread');
            badge.classList.add('bg-success');
            badge.textContent = '✓ Lu';
        });

        card.querySelectorAll('[id^="msg-"] p').forEach(p => {
            p.style.backgroundColor = '#1a3a4a';
        });

        const cardUnreadCorner = card.querySelector('.archive-unread-corner');
        if (cardUnreadCorner) {
            cardUnreadCorner.remove();
        }

        const globalUnreadBadge = document.querySelector('#unreadBadge');
        if (globalUnreadBadge && unreadCount > 0) {
            const current = parseInt(globalUnreadBadge.textContent) || 0;
            const next = Math.max(0, current - unreadCount);
            if (next > 0) {
                globalUnreadBadge.textContent = String(next);
                globalUnreadBadge.style.display = 'inline-block';
            } else {
                globalUnreadBadge.style.display = 'none';
            }
        }
    },

    _ensureArchiveSelectionState() {
        if (!this._selectedConversationKeys) {
            this._selectedConversationKeys = new Set();
        }
        if (typeof this._conversationDeleteMode !== 'boolean') {
            this._conversationDeleteMode = false;
        }
    },

    _updateArchiveSelectionUI() {
        this._ensureArchiveSelectionState();

        const deleteControls = document.querySelector('#archiveDeleteControls');
        if (deleteControls) {
            deleteControls.style.display = this._conversationDeleteMode ? '' : 'none';
        }

        const toggleDeleteModeBtn = document.querySelector('#archiveToggleDeleteMode');
        if (toggleDeleteModeBtn) {
            toggleDeleteModeBtn.textContent = this._conversationDeleteMode
                ? '✅ Désactiver suppression'
                : '🗑️ Activer suppression';
            toggleDeleteModeBtn.className = this._conversationDeleteMode
                ? 'btn btn-sm btn-warning w-100 mb-2'
                : 'btn btn-sm btn-outline-warning w-100 mb-2';
        }

        const deleteBtn = document.querySelector('#archiveDeleteSelected');
        if (deleteBtn) {
            const selectedCount = this._selectedConversationKeys.size;
            deleteBtn.disabled = !this._conversationDeleteMode || selectedCount === 0;
            deleteBtn.textContent = selectedCount > 0
                ? `🗑️ Supprimer sélection (${selectedCount})`
                : '🗑️ Supprimer sélection';
        }

        const selectAll = document.querySelector('#archiveSelectAll');
        if (selectAll) {
            selectAll.disabled = !this._conversationDeleteMode;
            const visibleCheckboxes = Array.from(document.querySelectorAll('#archiveContactsList .archive-select-checkbox'))
                .filter(cb => cb.closest('.card')?.style.display !== 'none');
            const checkedVisible = visibleCheckboxes.filter(cb => cb.checked);
            selectAll.checked = visibleCheckboxes.length > 0 && checkedVisible.length === visibleCheckboxes.length;
            selectAll.indeterminate = checkedVisible.length > 0 && checkedVisible.length < visibleCheckboxes.length;
        }
    },

    _toggleArchiveDeleteMode() {
        this._ensureArchiveSelectionState();
        this._conversationDeleteMode = !this._conversationDeleteMode;

        if (!this._conversationDeleteMode) {
            this._selectedConversationKeys.clear();
        }

        this.loadArchive().catch(err => console.error('Error reloading archive after delete mode toggle:', err));
    },

    _applyArchiveSearchFilter() {
        const searchInput = document.querySelector('#archiveSearch');
        const query = String(searchInput?.value || '').toLowerCase().trim();
        const filter = document.querySelector('#archiveFilter')?.value || 'all';
        const dateFromInput = document.querySelector('#archiveSearchDateFrom');
        const dateToInput = document.querySelector('#archiveSearchDateTo');

        const fromTs = dateFromInput?.value ? new Date(`${dateFromInput.value}T00:00:00`).getTime() : null;
        const toTs = dateToInput?.value ? new Date(`${dateToInput.value}T23:59:59`).getTime() : null;

        document.querySelectorAll('#archiveContactsList > .card').forEach(card => {
            const searchText = String(card.getAttribute('data-search-text') || card.textContent || '').toLowerCase();
            const lastTs = parseInt(card.getAttribute('data-last-ts') || '0', 10) || 0;

            const textMatch = !query || searchText.includes(query);
            const fromMatch = fromTs == null || (lastTs >= fromTs);
            const toMatch = toTs == null || (lastTs <= toTs);
            const filterMatch = filter === 'all'
                || (filter === 'unread' && Number(card.dataset.unreadCount) > 0)
                || (filter === 'favorites' && card.dataset.favorite === '1');

            card.style.display = textMatch && fromMatch && toMatch && filterMatch ? '' : 'none';
        });

        this._updateArchiveSelectionUI();
    },

    _sortArchiveContacts() {
        const list = document.querySelector('#archiveContactsList');
        if (!list) return;
        const order = document.querySelector('#archiveSort')?.value || 'newest';
        const cards = Array.from(list.querySelectorAll(':scope > .card'));
        cards.sort((left, right) => {
            const dateOrder = Number(right.dataset.lastTs || 0) - Number(left.dataset.lastTs || 0);
            if (order === 'oldest') return -dateOrder;
            if (order === 'name') return (left.dataset.name || '').localeCompare(right.dataset.name || '', 'fr', { sensitivity: 'base' }) || dateOrder;
            if (order === 'unread') return Number(right.dataset.unreadCount || 0) - Number(left.dataset.unreadCount || 0) || dateOrder;
            if (order === 'favorites') return Number(right.dataset.favorite || 0) - Number(left.dataset.favorite || 0) || dateOrder;
            return dateOrder;
        });
        cards.forEach(card => list.appendChild(card));
    },

    async _markAllArchiveRead() {
        if (!confirm('Marquer tous les SMS reçus comme lus, y compris ceux masqués par les filtres ?')) return;
        const button = document.querySelector('#archiveMarkAllRead');
        if (button) button.disabled = true;
        try {
            const result = await this.api.markAllSmsRead();
            await this.loadArchive();
            notificationManager.success(`${result.affectedRows || 0} SMS marqué(s) comme lus`);
        } catch (err) {
            console.error('Error marking all SMS as read:', err);
            notificationManager.error('Impossible de marquer tous les SMS comme lus');
        } finally {
            if (button) button.disabled = false;
        }
    },

    _toggleConversationSelection(contactKey, isSelected) {
        this._ensureArchiveSelectionState();

        if (isSelected) {
            this._selectedConversationKeys.add(contactKey);
        } else {
            this._selectedConversationKeys.delete(contactKey);
        }

        this._updateArchiveSelectionUI();
    },

    _toggleSelectAllConversations(isChecked) {
        this._ensureArchiveSelectionState();

        const visibleCheckboxes = Array.from(document.querySelectorAll('#archiveContactsList .archive-select-checkbox'))
            .filter(cb => cb.closest('.card')?.style.display !== 'none');

        visibleCheckboxes.forEach(cb => {
            cb.checked = isChecked;
            const key = cb.getAttribute('data-contact-key');
            if (isChecked) {
                this._selectedConversationKeys.add(key);
            } else {
                this._selectedConversationKeys.delete(key);
            }
        });

        this._updateArchiveSelectionUI();
    },

    async _deleteSelectedConversations() {
        this._ensureArchiveSelectionState();

        const keys = Array.from(this._selectedConversationKeys);
        if (keys.length === 0) {
            notificationManager.warning('Aucune conversation sélectionnée');
            return;
        }

        const confirmed = confirm(`Supprimer définitivement ${keys.length} conversation(s) de la base de données ?`);
        if (!confirmed) return;

        try {
            const result = await this.api.deleteConversations(keys);
            if (!result?.success) {
                throw new Error(result?.error || 'Suppression impossible');
            }

            this._selectedConversationKeys.clear();
            notificationManager.success(`${result.deletedConversations || keys.length} conversation(s) supprimée(s)`);
            await this.loadArchive();
        } catch (err) {
            console.error('Delete conversations error:', err);
            notificationManager.error(`Erreur suppression: ${err.message}`);
        }
    },

    /**
     * Load received SMS from API and render
     */
    async loadReceivedSMS() {
        try {
            const data = await this.api.getUnreadSMS();
            let unreadCount = data.filter(s => !s.ReadDate).length;
            
            const badge = document.querySelector('#unreadBadge');
            if (badge) {
                if (unreadCount > 0) {
                    badge.textContent = unreadCount;
                    badge.style.display = 'inline-block';
                } else {
                    badge.style.display = 'none';
                }
            }

            // Hide received section if no unread SMS
            const receivedSection = document.querySelector('#receivedSMSSection');
            if (receivedSection) {
                receivedSection.style.display = data.length > 0 ? 'block' : 'none';
            }

            if (data.length === 0) {
                const receivedList = document.querySelector('#receivedSMSList');
                if (receivedList) receivedList.innerHTML = '<p class="text-muted text-center">Aucun SMS reçu</p>';
                return data;
            }

            let html = '';
            data.forEach(sms => {
                const date = formatDateEST(sms.ReceivedDate);
                const senderPhone = formatPhoneForDisplay(sms.SenderNumber || sms.NumeroTel);
                html += `
                    <div class="sms-message-card ${sms.ReadDate ? 'read' : ''}" data-sms-id="${sms.Id}">
                        <div class="sms-sender">👤 ${sms.Prenom} ${sms.NomDeFamille}</div>
                        <div class="sms-sender" style="font-size: 0.85rem; color: #888;">📞 ${senderPhone}</div>
                        <div class="sms-message-text">${escapeHtml(sms.Message)}</div>
                        <div class="sms-date">📅 ${date}</div>
                        ${!sms.ReadDate ? `<div class="sms-actions">
                            <button class="btn btn-sm btn-success mark-read-btn" data-sms-id="${sms.Id}">✓ Marquer comme lu</button>
                            <button class="btn btn-sm btn-info reply-sms-btn" data-sms-id="${sms.Id}" data-sender="${sms.SenderNumber || sms.NumeroTel}" data-name="${sms.Prenom} ${sms.NomDeFamille}">💬 Répondre</button>
                        </div>` : ''}
                    </div>
                `;
            });
            
            const receivedList = document.querySelector('#receivedSMSList');
            if (receivedList) receivedList.innerHTML = html;

            return data;
        } catch (err) {
            console.error('Error loading received SMS:', err);
            throw err;
        }
    },

    /**
     * Load archive and render grouped by contact
     */
    async loadArchive() {
        try {
            const data = await this.api.getArchive();
            return this._renderArchive(data);
        } catch (err) {
            console.error('Error loading archive:', err);
            throw err;
        }
    },

    /**
     * Render archive with grouping by contact
     */
    _renderArchive(data) {
        this._ensureArchiveSelectionState();

        // Group messages by contact
        const grouped = {};
        
        data.forEach(msg => {
            let contactKey, displayName, phone;
            
            if (msg.ParticipantId) {
                // For known participants, group by ParticipantId
                contactKey = `participant_${msg.ParticipantId}`;
                displayName = msg.Prenom && msg.NomDeFamille ? 
                    `${msg.Prenom} ${msg.NomDeFamille}` : 
                    (msg.NumeroTel || 'Inconnu');
                phone = formatPhoneForDisplay(msg.NumeroTel);
            } else {
                // For unknown senders, normalize the phone number
                const phoneNumber = msg.type === 'sent' ? msg.RecipientNumber : msg.SenderNumber;
                const normalizedPhone = normalizePhone(phoneNumber);
                contactKey = `unknown_${normalizedPhone}`;
                displayName = 'Inconnu';
                phone = formatPhoneForDisplay(phoneNumber);
            }

            if (!grouped[contactKey]) {
                grouped[contactKey] = {
                    displayName: displayName,
                    phone: phone,
                    messages: [],
                    unreadCount: 0
                };
            }
            grouped[contactKey].messages.push(msg);
            if (msg.type === 'received' && !msg.IsRead) {
                grouped[contactKey].unreadCount++;
            }
        });

        const favoriteKeys = this._getArchiveFavoriteKeys();
        const sortedContacts = Object.keys(grouped)
            .sort((a, b) => {
                const aDate = new Date(Math.max(...grouped[a].messages.map(m => new Date(m.createdAt).getTime())));
                const bDate = new Date(Math.max(...grouped[b].messages.map(m => new Date(m.createdAt).getTime())));
                return bDate - aDate;
            });

        // Update unread badge
        const totalUnread = sortedContacts.reduce((sum, key) => sum + grouped[key].unreadCount, 0);
        const badge = document.querySelector('#unreadBadge');
        if (badge) {
            if (totalUnread > 0) {
                badge.textContent = totalUnread;
                badge.style.display = 'inline-block';
            } else {
                badge.style.display = 'none';
            }
        }

        let html = '';
        sortedContacts.forEach(contactKey => {
            const contact = grouped[contactKey];
            const count = contact.messages.length;
            const latestTimestamp = Math.max(...contact.messages.map(m => new Date(m.createdAt).getTime()));
            const lastMessage = [...contact.messages].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))[count - 1] || null;
            const lastMessageType = lastMessage?.type === 'sent' ? 'sent' : 'received';
            const lastMessageIcon = lastMessageType === 'sent'
                ? '<span title="Message sortant" aria-label="Message sortant" style="display:inline-flex; vertical-align:middle; margin-right:6px;"><svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 10L10 2" stroke="#7d8a96" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 2H10V8" stroke="#7d8a96" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span>'
                : '<span title="Message entrant" aria-label="Message entrant" style="display:inline-flex; vertical-align:middle; margin-right:6px;"><svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10 2L2 10" stroke="#7d8a96" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 10H2V4" stroke="#7d8a96" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span>';
            const rawLastMessageText = String(lastMessage?.Message || '').replace(/\s+/g, ' ').trim();
            const lastMessagePreview = rawLastMessageText.length > 68
                ? `${rawLastMessageText.slice(0, 68)}…`
                : rawLastMessageText;
            const searchBlob = [
                contact.displayName,
                contact.phone,
                ...contact.messages.map(m => m?.Message || '')
            ].join(' ').toLowerCase().replace(/"/g, '&quot;');
            const lastDateTime = formatDateEST(new Date(latestTimestamp));
            const dateParts = String(lastDateTime).split(' ');
            const lastDate = dateParts[0] || '';
            const lastTime = dateParts[1] || '';
            const safeId = getSafeId(contactKey);
            const isFavorite = favoriteKeys.has(contactKey);
            
            let unreadBadge = '';
            if (contact.unreadCount > 0) {
                unreadBadge = `<span class="badge bg-danger archive-unread-corner">${contact.unreadCount}</span>`;
            }

            const isSelected = this._selectedConversationKeys.has(contactKey);
            
            html += `
                <div class="card mb-3" data-contact-key="${contactKey}" data-last-ts="${latestTimestamp}" data-unread-count="${contact.unreadCount}" data-favorite="${isFavorite ? '1' : '0'}" data-name="${escapeHtml(contact.displayName)}" data-search-text="${searchBlob}" style="background-color: #151515; border: 1px solid ${isFavorite ? '#7a5d1a' : '#222'};">
                    <div class="card-header" style="background-color: #1a1a1a; cursor: pointer; position: relative;" onclick="app._toggleArchiveMessages('${safeId}', '${contactKey}')">
                        ${unreadBadge}
                        <div class="d-flex justify-content-between align-items-center">
                            <div style="display: flex; align-items: center; gap: 8px; min-width: 0;">
                                ${this._conversationDeleteMode ? `<input type="checkbox" class="form-check-input archive-select-checkbox m-0" data-contact-key="${contactKey}" ${isSelected ? 'checked' : ''} onclick="event.stopPropagation();" onchange="app._toggleConversationSelection('${contactKey}', this.checked)">` : ''}
                                <div style="min-width: 0;">
                                <strong style="color: #31a651;">${escapeHtml(contact.displayName)}</strong>
                                <br>
                                <small class="text-muted">📞 ${escapeHtml(contact.phone)}</small>
                                ${lastMessagePreview ? `<br><small class="text-muted" title="${escapeHtml(rawLastMessageText)}">${lastMessageIcon}${escapeHtml(lastMessagePreview)}</small>` : ''}
                                </div>
                            </div>
                            <div class="text-end" style="display:flex; flex-direction:column; align-items:flex-end; gap:2px;">
                                <button type="button" title="Favori" onclick="event.stopPropagation(); app._toggleFavoriteConversation('${contactKey}')" style="border:none; background:transparent; color:${isFavorite ? '#f5c542' : '#777'}; font-size: 1.35rem; line-height:1; padding:0;">${isFavorite ? '★' : '☆'}</button>
                                <small class="text-muted d-block archive-total-count">${count} message${count > 1 ? 's' : ''}</small>
                                <small class="text-muted d-block archive-last-datetime" title="Dernier message: ${lastDateTime}">${lastDate} ${lastTime}</small>
                            </div>
                        </div>
                    </div>
                    <div class="card-body" id="archive-${safeId}" style="display: none; padding: 0;">
                        <div id="messages-${safeId}" style="max-height: 500px; overflow-y: auto;">
            `;
            
            const sortedMessages = [...contact.messages].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
            const currentUsername = String(localStorage.getItem('username') || this.state?.user || 'Utilisateur').trim();
            
            sortedMessages.forEach(msg => {
                const date = formatDateEST(msg.createdAt);
                let badge = '', backgroundColor = '', retryButton = '';
                let sentBy = '';
                
                if (msg.type === 'sent') {
                    if (msg.Statut === 'succès') {
                        badge = '<span class="badge bg-success">✓ Envoyé</span>';
                    } else {
                        badge = '<span class="badge bg-danger">✗ Erreur</span>';
                        // Add retry button for failed messages
                        const recipientPhone = msg.RecipientNumber || msg.NumeroTel || '';
                        retryButton = `<span class="retry-icon retry-btn-archive" data-message="${escapeHtml(msg.Message)}" data-phone="${escapeHtml(recipientPhone)}" data-participant-id="${msg.ParticipantId || ''}" title="Renvoi"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2-8.83"></path></svg></span>`;
                    }
                    backgroundColor = '#1f4620';
                    sentBy = `<small class="text-muted me-2">👤 ${escapeHtml(currentUsername)}</small>`;
                } else {
                    badge = !msg.IsRead ? 
                        '<span class="badge badge-unread bg-warning text-dark">📨 Non lu</span>' :
                        '<span class="badge bg-info">📨 Reçu</span>';
                    backgroundColor = !msg.IsRead ? '#3a3a1a' : '#1a3a4a';
                }
                
                html += `
                    <div style="border-bottom: 1px solid #222; padding: 12px; color: #e0e0e0; text-align: ${msg.type === 'sent' ? 'right' : 'left'};">
                        <div class="d-flex justify-content-${msg.type === 'sent' ? 'end' : 'start'} align-items-start mb-2">
                            ${sentBy}
                            <small class="text-muted me-2">${date}</small>
                            <div style="display: flex; align-items: center; gap: 8px;">
                                ${badge}
                                ${retryButton}
                            </div>
                        </div>
                        <p style="margin: 0; font-size: 0.95rem; padding: 8px 12px; background-color: ${backgroundColor}; border-radius: 8px; display: inline-block; max-width: 80%;">
                            ${escapeHtml(msg.Message)}
                        </p>
                    </div>
                `;
            });
            
            html += `
                        </div>
                        <div style="position: fixed; bottom: 0; left: 0; right: 0; z-index: 1100; background-color: #1a1a1a; border-top: 1px solid #222;">
                            <div style="margin-bottom: 8px; padding-top: 3px; box-shadow: 0 -20px 36px -14px rgba(0, 0, 0, 0.95);">
                                <button type="button" onclick="app._toggleQuickTemplates('${safeId}')" title="Afficher/masquer les messages prédéfinis" style="width: 100%; border: none; background: transparent; padding: 0; color: #a8a8a8; display: flex; flex-direction: column; align-items: center; gap: 4px; cursor: pointer;">
                                    <span style="display: block; width: 42px; height: 4px; border-radius: 999px; background: #5b5b5b;"></span>
                                    <span style="font-size: 0.75rem; line-height: 1; letter-spacing: 0.02em;">Messages prédéfinis <span id="quick-templates-chevron-${safeId}">▾</span></span>
                                </button>
                                <div id="quick-templates-${safeId}" data-open="0" style="max-height: 0; opacity: 0; overflow: hidden; margin-top: 0; transition: max-height 0.25s ease, opacity 0.2s ease, margin-top 0.2s ease;">
                                    <div class="d-flex flex-wrap gap-1">
                                        ${this._getQuickReplyTemplates().map(template => `<button type="button" class="btn btn-sm btn-outline-success" onclick="app._applyQuickTemplate('${safeId}', '${encodeURIComponent(template).replace(/'/g, '%27')}')" title="Insérer message prédéfini">${escapeHtml(template).slice(0, 24)}${template.length > 24 ? '…' : ''}</button>`).join('')}
                                    </div>
                                </div>
                            </div>
                            <div class="d-flex gap-2 align-items-stretch">
                                <button type="button" class="btn btn-outline-secondary" onclick="app._toggleEmojiPicker('${safeId}')" title="Ajouter un emoji" style="padding: 0.375rem 0.75rem;">😊</button>
                                <textarea id="reply-${safeId}" name="reply-${safeId}" class="form-control" rows="2" placeholder="Répondre..." style="resize: none; flex: 1;"></textarea>
                                <button type="button" class="btn btn-success" onclick="app._sendQuickReply('${safeId}', '${escapeHtml(contact.phone)}')" title="Envoyer" style="padding: 0.375rem 0.75rem;">
                                    <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                                        <path d="M15.854.146a.5.5 0 0 1 .11.54l-5.819 14.547a.75.75 0 0 1-1.329.124l-3.178-4.995L.643 7.184a.75.75 0 0 1 .124-1.33L15.314.037a.5.5 0 0 1 .54.11ZM6.636 10.07l2.761 4.338L14.13 2.576 6.636 10.07Zm6.787-8.201L1.591 6.602l4.339 2.76 7.494-7.493Z"/>
                                    </svg>
                                </button>
                            </div>
                            <div id="emoji-picker-${safeId}" style="display: none; margin-top: 10px; padding: 10px; background-color: #222; border-radius: 8px; max-height: 300px; overflow-y: auto;">
                                <div style="display: flex; flex-wrap: wrap; gap: 5px;">
                                    ${['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩','😘','😗','😚','😙','🥲','😋','😛','😜','🤪','😌','😔','😑','😐','😶','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🤮','🤢','🤮','🤮','🤮','😵','🤯','🤠','🥳','😎','🤓','🧐','😕','😟','🙁','☹️','😲','😞','😖','😢','😭','😤','😠','😡','🤬','😈','👿','💀','🤡','👹','👺','💩','👻','👽','👾','🤖','😺','😸','😹','😻','😼','😽','🙀','😿','😾','❤️','🧡','💛','💚','💙','💜','🤍','🤎','🖤','💔','💕','💞','💓','💗','💖','💘','💝','💟','👋','🤚','🖐️','✋','🖖','👌','🤌','🤏','✌️','🤞','🫰','🤟','🤘','🤙','👍','👎','☝️','👆','👇','👈','👉','👊','👏','🙌','👐','🤲','🤝','🤜','🤛','🦵','🦶','👂','👃','🧠','🦷','🦴','🎂','🍰','🧁','🍪','🍩','🍫','🍬','🍭','🍮','🍯','🍼','🥛','☕','🍵','🍶','🍾','🍷','🍸','🍹','🍺','🍻','🥂','🥃','🍽️','🍴','🥄','🔪','🏺','🌾','🍷','🍶','🍺','🍻','🥂','🥃','🍸','🍹','🍾','🥄','⚽','🏀','🏈','⚾','🥎','🎾','🏐','🏉','🥏','🎳','🏓','🏸','🏒','🏑','🥍','🏏','🥅','⛳','⛸️','🎣','🎽','🎿','⛷️','🏂','🪂','🏋️','🤼','🤸','⛹️','🏌️','🏇','🧘','🏄','🏊','🤽','🚣','🧗','🚴','🚵','🤹','🎯','🪃','🪁','🎮','🎲','🧩','🚗','🚕','🚙','🚌','🚎','🏎️','🚓','🚑','🚒','🚐','🛻','🚚','🚛','🚜','🏍️','🏎️','🛵','🦯','🦽','🦼','🛺','🚲','🛴','🛹','🛼','🚏','⛽','🚨','🚔','🚍','🚘','🚖','🚡','🚠','🚟','🚃','🚋','🚞','🚝','🚄','🚅','🚈','🚂','🚆','🚇','🚊','🚉','✈️','🛫','🛬','🛰️','💺','🛶','⛵','🚤','🛳️','⛴️','🛥️','🎢','🎡','🎠','⛲','⛺','🏕️','⛰️','⛰️','🌋','⛰️','🏔️','🗻','🏕️','⛺','🏠','🏡','🏘️','🏚️','🏗️','🏭','🏢','🏬','🏣','🏤','🏥','🏦','🏨','🏪','🏫','🏩','💒','🏛️','⛪','🕌','🕍','🛕','🕋','⛩️','🛤️','🛣️','🗾','🎑','🏞️','🌅','🌄','🌠','🎇','🎆','🌇','🌆','🏙️','🌃','🌌','🌉','🌁','⌚','📱','📲','💻','⌨️','🖥️','🖨️','🖱️','🖲️','🕹️','🗜️','💽','💾','💿','📀','📼','📷','📸','📹','🎥','🎬','📽️','🎞️','📞','☎️','📟','📠','📺','📻','🎙️','🎚️','🎛️','🧭','⏱️','⏲️','⏰','🕰️','⌛','⏳','📡','🔋','🔌','💡','🔦','🕯️','🪔','🧯','🛢️','💸','💵','💴','💶','💷','💰','💳','🧾','✉️','📩','📨','📤','📥','📦','🏷️','🧧','📪','📫','📬','📭','📮','✏️','✒️','🖋️','🖊️','🖌️','🖍️','📝','📁','📂','📅','📆','🗒️','🗓️','📇','📈','📉','📊','📋','📌','📍','📎','🖇️','📏','📐','✂️','🧷','🧹','🧺','🧻','🔒','🔓','🔏','🔐','🔑','🗝️','🚪','🪑','🚽','🚿','🛁','🛀','🧼','🪒','🧴','🛎️','🔔','🔕','🧹','🧺','🧻','🧼','🧽','🧯','🛒','🚬','⚰️','⚱️','🏺','🔮','📿','💈','⚗️','🔭','🔬','🕯️','💡','🔦','🏮','📔','📕','📖','📗','📘','📙','📚','📓','📒','📑','🧷','🧹','📰','🗞️','📄','📃','📑','🧾','📜','📋','📊','📈','📉','🗳️','🗂️','🗞️','📰','📓','📔','📒','📕','📖','📗','📘','📙','📚','📓','📒','📑','📊','📈','📉','📇','📈','📉','📌','📍','📎','🖇️','📐','📏','✂️','✏️','✒️','🖋️','🖊️','🖌️','🖍️','📝'].map(e => `<button type="button" class="btn btn-sm btn-outline-light" onclick="app._addEmoji('${safeId}', '${e}')" style="font-size: 1.2rem; padding: 4px 8px;">${e}</button>`).join('')}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        });
        
        const archiveList = document.querySelector('#archiveContactsList');
        if (archiveList) archiveList.innerHTML = html || '<p class="text-muted text-center">Aucune conversation</p>';

        // Setup retry buttons with event delegation
        setTimeout(() => {
            const archiveList = document.querySelector('#archiveContactsList');
            if (archiveList) {
                archiveList.addEventListener('click', (e) => {
                    const btn = e.target.closest('.retry-btn-archive');
                    if (btn) {
                        const message = btn.getAttribute('data-message');
                        const phone = btn.getAttribute('data-phone');
                        const participantId = btn.getAttribute('data-participant-id');
                        
                        // Add spinning animation
                        btn.classList.add('spinning');
                        
                        // Find the safeId from the parent structure
                        const parent = btn.closest('[id^="archive-"]');
                        if (parent) {
                            const archiveId = parent.id;
                            const safeId = archiveId.replace('archive-', '');
                            
                            // Extract ParticipantId from safeId if not provided
                            let finalParticipantId = participantId;
                            if (!finalParticipantId && safeId.startsWith('participant_')) {
                                finalParticipantId = safeId.replace('participant_', '');
                            }
                            // Call retry with ParticipantId
                            app._retryQuickReply(safeId, phone, message, finalParticipantId);
                            
                            // Remove animation after request is sent
                            setTimeout(() => {
                                btn.classList.remove('spinning');
                            }, 500);
                        } else {
                            console.error('Could not find parent with archive- id');
                            btn.classList.remove('spinning');
                        }
                    }
                });
            }
        }, 100);

        // Setup Enter key listeners for all reply textareas
        document.querySelectorAll('[id^="reply-"]').forEach(textarea => {
            textarea.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    const safeIdMatch = textarea.id.match(/reply-(.+)/);
                    if (safeIdMatch) {
                        const safeId = safeIdMatch[1];
                        // Find the phone from the onclick attribute
                        const sendBtn = textarea.closest('.d-flex').querySelector('button[onclick*="_sendQuickReply"]');
                        const phoneMatch = sendBtn?.getAttribute('onclick')?.match(/'([^']+)'\)/);
                        if (phoneMatch) {
                            this._sendQuickReply(safeId, phoneMatch[1]);
                        }
                    }
                }
            });
        });

        const archiveSearch = document.querySelector('#archiveSearch');
        if (archiveSearch && !archiveSearch.dataset.bound) {
            archiveSearch.addEventListener('input', () => this._applyArchiveSearchFilter());
            archiveSearch.dataset.bound = '1';
        }

        const archiveSearchDateFrom = document.querySelector('#archiveSearchDateFrom');
        if (archiveSearchDateFrom && !archiveSearchDateFrom.dataset.bound) {
            archiveSearchDateFrom.addEventListener('change', () => this._applyArchiveSearchFilter());
            archiveSearchDateFrom.dataset.bound = '1';
        }

        const archiveSearchDateTo = document.querySelector('#archiveSearchDateTo');
        if (archiveSearchDateTo && !archiveSearchDateTo.dataset.bound) {
            archiveSearchDateTo.addEventListener('change', () => this._applyArchiveSearchFilter());
            archiveSearchDateTo.dataset.bound = '1';
        }

        const archiveSearchReset = document.querySelector('#archiveSearchReset');
        if (archiveSearchReset && !archiveSearchReset.dataset.bound) {
            archiveSearchReset.addEventListener('click', () => {
                if (archiveSearch) archiveSearch.value = '';
                if (archiveSearchDateFrom) archiveSearchDateFrom.value = '';
                if (archiveSearchDateTo) archiveSearchDateTo.value = '';
                const archiveFilter = document.querySelector('#archiveFilter');
                if (archiveFilter) archiveFilter.value = 'all';
                this._applyArchiveSearchFilter();
            });
            archiveSearchReset.dataset.bound = '1';
        }

        const archiveFilter = document.querySelector('#archiveFilter');
        if (archiveFilter && !archiveFilter.dataset.bound) {
            archiveFilter.addEventListener('change', () => this._applyArchiveSearchFilter());
            archiveFilter.dataset.bound = '1';
        }

        const archiveSort = document.querySelector('#archiveSort');
        if (archiveSort && !archiveSort.dataset.bound) {
            archiveSort.addEventListener('change', () => this._sortArchiveContacts());
            archiveSort.dataset.bound = '1';
        }

        const markAllRead = document.querySelector('#archiveMarkAllRead');
        if (markAllRead && !markAllRead.dataset.bound) {
            markAllRead.addEventListener('click', () => this._markAllArchiveRead());
            markAllRead.dataset.bound = '1';
        }

        const selectAll = document.querySelector('#archiveSelectAll');
        if (selectAll && !selectAll.dataset.bound) {
            selectAll.addEventListener('change', (e) => this._toggleSelectAllConversations(e.target.checked));
            selectAll.dataset.bound = '1';
        }

        const deleteBtn = document.querySelector('#archiveDeleteSelected');
        if (deleteBtn && !deleteBtn.dataset.bound) {
            deleteBtn.addEventListener('click', () => this._deleteSelectedConversations());
            deleteBtn.dataset.bound = '1';
        }

        const toggleDeleteModeBtn = document.querySelector('#archiveToggleDeleteMode');
        if (toggleDeleteModeBtn && !toggleDeleteModeBtn.dataset.bound) {
            toggleDeleteModeBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this._toggleArchiveDeleteMode();
            });
            toggleDeleteModeBtn.dataset.bound = '1';
        }

        const suggestCleanupBtn = document.querySelector('#archiveSuggestOldCleanup');
        if (suggestCleanupBtn && !suggestCleanupBtn.dataset.bound) {
            suggestCleanupBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this._suggestOldConversationsCleanup(90);
            });
            suggestCleanupBtn.dataset.bound = '1';
        }

        const menuBtn = document.querySelector('#archiveActionsMenuBtn');
        const menu = document.querySelector('#archiveActionsMenu');
        if (menuBtn && menu && !menuBtn.dataset.bound) {
            const placeMenu = () => {
                menu.style.position = 'fixed';
                menu.style.zIndex = '2147483647';
                menu.style.maxWidth = 'min(360px, calc(100vw - 16px))';

                const btnRect = menuBtn.getBoundingClientRect();
                const menuRect = menu.getBoundingClientRect();
                const menuWidth = menuRect.width || 320;
                const menuHeight = menuRect.height || 220;

                const top = Math.min(window.innerHeight - menuHeight - 8, btnRect.bottom + 6);
                const left = Math.max(8, Math.min(window.innerWidth - menuWidth - 8, btnRect.right - menuWidth));

                menu.style.top = `${Math.max(8, top)}px`;
                menu.style.left = `${left}px`;
                menu.style.right = 'auto';
            };

            menuBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const isHidden = menu.style.display === 'none' || !menu.style.display;
                if (isHidden) {
                    menu.style.display = 'block';
                    placeMenu();
                } else {
                    menu.style.display = 'none';
                }
            });

            window.addEventListener('resize', () => {
                if (menu.style.display !== 'none') placeMenu();
            });

            window.addEventListener('scroll', () => {
                if (menu.style.display !== 'none') placeMenu();
            }, true);

            document.addEventListener('click', (e) => {
                if (!menu.contains(e.target) && e.target !== menuBtn) {
                    menu.style.display = 'none';
                }
            });

            menuBtn.dataset.bound = '1';
        }

        this._sortArchiveContacts();
        this._applyArchiveSearchFilter();
        this._updateArchiveSelectionUI();

        return data;
    },

    /**
     * Add received message to open conversation
     */
    addReceivedMessageToConversation(message) {
        // Find the conversation matching this sender's phone
        const senderRaw = message?.SenderNumber || message?.sender || message?.from || message?.phoneNumber || message?.address || '';
        const messageBody = message?.Message ?? message?.message ?? message?.body ?? message?.text ?? message?.content ?? '';
        const senderPhone = normalizePhone(senderRaw);
        const senderLast10 = senderPhone.length >= 10 ? senderPhone.slice(-10) : senderPhone;
        let foundSafeId = null;
        let foundCard = null;
        
        document.querySelectorAll('#archiveContactsList > .card').forEach(card => {
            const phoneElement = card.querySelector('.card-header small');
            const cardPhone = normalizePhone(phoneElement ? phoneElement.textContent : '');
            const cardLast10 = cardPhone.length >= 10 ? cardPhone.slice(-10) : cardPhone;
            const cardTextDigits = String(card.textContent || '').replace(/\D/g, '');

            if ((senderPhone && cardPhone && senderPhone === cardPhone) ||
                (senderLast10 && cardLast10 && senderLast10 === cardLast10) ||
                (senderLast10 && cardTextDigits.includes(senderLast10))) {
                // Found the matching conversation
                const header = card.querySelector('.card-header');
                const onclickAttr = header?.getAttribute('onclick');
                const match = onclickAttr?.match(/toggleArchiveMessages\('([^']+)'/);
                if (match) {
                    foundSafeId = match[1];
                    foundCard = card;
                }
            }
        });
        
        if (foundSafeId && foundCard) {
            const messagesDiv = document.querySelector(`#messages-${foundSafeId}`);
            if (messagesDiv) {
                const archiveContainer = document.querySelector(`#archive-${foundSafeId}`);
                const isOpen = !!archiveContainer && window.getComputedStyle(archiveContainer).display !== 'none';
                const date = formatDateEST(message.ReceivedDate || new Date());
                const messageId = `msg-${message.Id}`;
                const messageHtml = `
                    <div id="${messageId}" class="new-received-message" style="border-bottom: 1px solid #222; padding: 12px; color: #e0e0e0; text-align: left; cursor: pointer;" data-message-id="${message.Id}">
                        <div class="d-flex justify-content-start align-items-start mb-2">
                            <small class="text-muted me-2">${date}</small>
                            <span class="badge badge-unread bg-warning text-dark">📨 Non lu</span>
                        </div>
                        <p style="margin: 0; font-size: 0.95rem; padding: 8px 12px; background-color: #3a3a1a; border-radius: 8px; display: inline-block; max-width: 80%;">
                            ${escapeHtml(messageBody)}
                        </p>
                    </div>
                `;
                messagesDiv.insertAdjacentHTML('beforeend', messageHtml);
                
                // Add click handler using addEventListener
                const newMessageEl = messagesDiv.querySelector(`#${messageId}`);
                if (newMessageEl) {
                    const clickHandler = () => {
                        // Extract message ID from the element ID (msg-123 -> 123)
                        const actualMsgId = messageId.replace('msg-', '');
                        this._markMessageAsRead(newMessageEl, actualMsgId);
                    };
                    newMessageEl.addEventListener('click', clickHandler);
                    newMessageEl.setAttribute('data-handler-attached', 'true');
                }
                
                if (isOpen) {
                    messagesDiv.scrollTop = messagesDiv.scrollHeight;
                    
                    // Auto-mark as read after 10 seconds if conversation is open
                    setTimeout(() => {
                        const msgEl = messagesDiv.querySelector(`#${messageId}`);
                        if (msgEl && msgEl.querySelector('.badge-unread')) {
                            this._markMessageAsRead(msgEl, message.Id);
                        }
                    }, 10000);
                }
                
                // Update unread badge if conversation is closed
                if (!isOpen) {
                    const headerRoot = foundCard.querySelector('.card-header');
                    if (headerRoot) {
                        const existingBadge = headerRoot.querySelector('.archive-unread-corner');
                        if (existingBadge) {
                            const currentCount = parseInt(existingBadge.textContent) || 0;
                            existingBadge.textContent = String(currentCount + 1);
                        } else {
                            const newBadge = document.createElement('span');
                            newBadge.className = 'badge bg-danger archive-unread-corner';
                            newBadge.textContent = '1';
                            headerRoot.appendChild(newBadge);
                        }
                    }

                    // Update global unread badge
                    const unreadBadge = document.querySelector('#unreadBadge');
                    if (unreadBadge) {
                        const currentCount = parseInt(unreadBadge.textContent) || 0;
                        const newCount = currentCount + 1;
                        unreadBadge.textContent = newCount;
                        unreadBadge.style.display = 'inline-block';
                    }
                    
                    foundCard.querySelector('.card-header').style.backgroundColor = '#1a3a3a';
                }
                
                return true;
            }
        }
        
        return false;
    },

    /**
     * Mark a single received message as read
     */
    _markMessageAsRead(messageEl, messageId) {
        // Check if already marked as read
        if (!messageEl.querySelector('.badge-unread')) {
            return;
        }
        
        // Update the badge
        const badge = messageEl.querySelector('.badge-unread');
        if (badge) {
            badge.classList.remove('bg-warning', 'text-dark', 'badge-unread');
            badge.classList.add('bg-success');
            badge.textContent = '✓ Lu';
        }
        
        // Update message background color
        const p = messageEl.querySelector('p');
        if (p) {
            p.style.backgroundColor = '#1a3a4a';
        }
        
        // Remove click cursor but keep element clickable for safety
        messageEl.style.cursor = 'default';
        
        // Update global unread badge count
        const unreadBadge = document.querySelector('#unreadBadge');
        if (unreadBadge) {
            const currentCount = parseInt(unreadBadge.textContent) || 0;
            if (currentCount > 1) {
                unreadBadge.textContent = currentCount - 1;
            } else {
                unreadBadge.style.display = 'none';
            }
        }
        
        // Call backend to mark as read
        if (this.api && this.api.markSmsAsRead) {
            this.api.markSmsAsRead(messageId).catch(err => {
                console.error('Error marking message as read:', err);
            });
        }
    },

    /**
     * Toggle archive messages visibility
     */
    _toggleArchiveMessages(safeId, contactKey) {
        const element = $(`#archive-${safeId}`);
        const isOpening = !element.is(':visible');
        const currentCard = element.closest('.card');
        const allCards = $('#archiveContactsList').find('> .card');
        const archiveHeaderRow = $('#archiveHeaderRow');
        const actionsMenu = $('#archiveActionsMenu');
        const smsPanelEl = document.querySelector('#sms-panel');

        if (isOpening) {
            this._archiveScrollBeforeOpen = {
                panelTop: smsPanelEl ? smsPanelEl.scrollTop : null,
                windowTop: window.scrollY || window.pageYOffset || 0,
                contactKey: String(contactKey || ''),
                safeId: String(safeId || '')
            };
        }

        const restoreScrollPosition = () => {
            const saved = this._archiveScrollBeforeOpen;
            if (!saved) return;

            if (smsPanelEl && saved.panelTop !== null && saved.panelTop !== undefined) {
                smsPanelEl.scrollTop = saved.panelTop;
            }
            window.scrollTo({ top: saved.windowTop || 0, left: 0, behavior: 'auto' });
            this._archiveScrollBeforeOpen = null;
        };

        if (isOpening) {
            currentCard.addClass('archive-opened');
            // Open: fadeOut other cards and title
            allCards.not(currentCard).fadeOut(300, function() {
                $(this).css('display', 'none');
            });
            if (actionsMenu && actionsMenu.is(':visible')) {
                actionsMenu.hide();
            }
            archiveHeaderRow.stop(true, true).fadeTo(200, 0, function() {
                $(this).addClass('archive-header-hidden');
            });
        } else {
            currentCard.removeClass('archive-opened');
            // Close: fadeIn other cards and title
            allCards.not(currentCard).fadeIn(300, function() {
                $(this).css('display', 'block');
            });
            archiveHeaderRow.removeClass('archive-header-hidden').stop(true, true).css('opacity', 0).fadeTo(200, 1);
        }
        
        // Toggle the conversation with slide animation
        element.slideToggle(300, () => {
            const messagesDiv = document.querySelector(`#messages-${safeId}`);
            if (isOpening && messagesDiv) {
                messagesDiv.scrollTop = messagesDiv.scrollHeight;
            }

            // Scroll the textarea into view after animation
            if (isOpening) {
                const textarea = document.querySelector(`#reply-${safeId}`);
                if (textarea) {
                    setTimeout(() => textarea.scrollIntoView({behavior: 'smooth', block: 'nearest'}), 100);
                }
            } else {
                setTimeout(restoreScrollPosition, 0);
            }
        });

        if (!isOpening) {
            setTimeout(restoreScrollPosition, 320);
        }

        // Mark as read when opening (only if there are unread messages)
        if (contactKey && contactKey !== 'undefined' && contactKey !== 'Inconnu' && isOpening) {
            // Count unread messages in this conversation
            const unreadMessagesCount = document.querySelectorAll(`#messages-${safeId} .badge-unread`).length;
            
            if (unreadMessagesCount > 0) {
                console.log(`Marking conversation as read - contactKey: ${contactKey}, unreadCount: ${unreadMessagesCount}`);
                
                this.api.markConversationRead(contactKey, this.state?.socket?.id || null).then((response) => {
                    
                    // After 10 seconds, update the UI
                    setTimeout(() => {
                        // Update badges from "Non lu" to "Lu"
                        document.querySelectorAll(`#messages-${safeId} .badge-unread`).forEach(badge => {
                            badge.classList.remove('bg-warning', 'text-dark', 'badge-unread');
                            badge.classList.add('bg-success');
                            badge.textContent = '✓ Lu';
                        });
                        
                        // Update message backgrounds
                        document.querySelectorAll(`#messages-${safeId} [id^="msg-"]`).forEach(msgDiv => {
                            const p = msgDiv.querySelector('p');
                            if (p) {
                                p.style.backgroundColor = '#1a3a4a';
                            }
                        });
                        
                        // Update card badge
                        const cardBadge = currentCard.find('.card-header .badge.bg-danger');
                        if (cardBadge && cardBadge.length > 0) {
                            cardBadge.remove();
                        }
                        
                        // Update tab unread badge
                        const unreadBadge = document.querySelector('#unreadBadge');
                        if (unreadBadge) {
                            const currentCount = parseInt(unreadBadge.textContent) || 0;
                            const newCount = currentCount - unreadMessagesCount;
                            if (newCount > 0) {
                                unreadBadge.textContent = newCount;
                            } else {
                                unreadBadge.style.display = 'none';
                            }
                        }
                    }, 10000);
                }).catch(err => {
                    console.error('Mark read error:', err);
                    notificationManager.error('Erreur lors du marquage des messages comme lus');
                });
            }
        }
    },

    /**
     * Toggle emoji picker
     */
    _toggleEmojiPicker(safeId) {
        const picker = document.querySelector(`#emoji-picker-${safeId}`);
        if (!picker) return;

        const isVisible = picker.style.display !== 'none';
        
        // Hide all other pickers
        document.querySelectorAll('[id^="emoji-picker-"]').forEach(p => {
            if (p.id !== `emoji-picker-${safeId}`) {
                p.style.display = 'none';
            }
        });

        if (isVisible) {
            picker.style.display = 'none';
        } else {
            picker.style.display = 'block';
            
            // Close picker when clicking outside
            const closeHandler = (e) => {
                if (!picker.contains(e.target) && !e.target.closest(`button[onclick*="_toggleEmojiPicker('${safeId}')"]`)) {
                    picker.style.display = 'none';
                    document.removeEventListener('click', closeHandler);
                }
            };
            
            // Add delay to prevent immediate close
            setTimeout(() => {
                document.addEventListener('click', closeHandler);
            }, 100);
        }
    },

    /**
     * Add emoji to reply textarea
     */
    _addEmoji(safeId, emoji) {
        const textarea = document.querySelector(`#reply-${safeId}`);
        if (textarea) {
            textarea.value += emoji;
            textarea.focus();
        }

        const picker = document.querySelector(`#emoji-picker-${safeId}`);
        if (picker) {
            picker.style.display = 'none';
        }
    },

    /**
     * Send quick reply via WebSocket
     */
    _sendQuickReply(safeId, phone) {
        const textarea = document.querySelector(`#reply-${safeId}`);
        if (!textarea) return;

        const message = textarea.value.trim();
        if (!message) return;

        // Disable button
        const sendBtn = textarea.closest('.d-flex').querySelector('button[onclick*="_sendQuickReply"]');
        if (sendBtn) {
            sendBtn.disabled = true;
            sendBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
        }

        this._sendMessage(safeId, phone, message, sendBtn, textarea);
    },

    _sendMessage(safeId, phone, message, sendBtn = null, textarea = null, participantId = null, isRetry = false) {
        if (!safeId || !phone || !message) {
            if (sendBtn) {
                sendBtn.disabled = false;
                sendBtn.innerHTML = `
                    <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                        <path d="M15.854.146a.5.5 0 0 1 .11.54l-5.819 14.547a.75.75 0 0 1-1.329.124l-3.178-4.995L.643 7.184a.75.75 0 0 1 .124-1.33L15.314.037a.5.5 0 0 1 .54.11ZM6.636 10.07l2.761 4.338L14.13 2.576 6.636 10.07Zm6.787-8.201L1.591 6.602l4.339 2.76 7.494-7.493Z"/>
                    </svg>
                `;
            }
            return;
        }

        const resetSendButton = () => {
            if (!sendBtn) return;
            sendBtn.disabled = false;
            sendBtn.innerHTML = `
                <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                    <path d="M15.854.146a.5.5 0 0 1 .11.54l-5.819 14.547a.75.75 0 0 1-1.329.124l-3.178-4.995L.643 7.184a.75.75 0 0 1 .124-1.33L15.314.037a.5.5 0 0 1 .54.11ZM6.636 10.07l2.761 4.338L14.13 2.576 6.636 10.07Zm6.787-8.201L1.591 6.602l4.339 2.76 7.494-7.493Z"/>
                </svg>
            `;
        };

        // Add message to conversation with spinner
        const messagesDiv = document.querySelector(`#messages-${safeId}`);
        const tempMessageId = `msg-temp-${Date.now()}`;
        if (messagesDiv) {
            const retryTag = isRetry
                ? '<small class="text-muted" style="font-size: 0.75rem; color: #888;">(Renvoi)</small>'
                : '';
            const messageHtml = `
                <div id="${tempMessageId}" style="border-bottom: 1px solid #222; padding: 12px; color: #e0e0e0; text-align: right;">
                    <div class="d-flex justify-content-between align-items-start mb-2">
                        <div></div>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <small class="text-muted">${formatDateEST(new Date())}</small>
                            ${retryTag}
                            <span class="spinner-border spinner-border-sm text-warning" style="width: 0.9rem; height: 0.9rem;"></span>
                        </div>
                    </div>
                    <p style="margin: 0; font-size: 0.95rem; padding: 8px 12px; background-color: #1f4620; border-radius: 8px; display: inline-block; max-width: 80%;">
                        ${escapeHtml(message)}
                    </p>
                    <div id="status-${tempMessageId}" style="display: none; color: #ff6b6b; font-size: 0.85rem; margin-top: 6px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                        <span id="error-text-${tempMessageId}"></span>
                    </div>
                </div>
            `;
            messagesDiv.insertAdjacentHTML('beforeend', messageHtml);

            // Scroll to bottom to show the new message
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
        }

        // Setup callback
        const callbackId = `${phone}-${Date.now()}`;
        let responseReceived = false;
        const timeoutId = setTimeout(() => {
            if (!responseReceived) {
                delete this.state.smsQuickReplyCallbacks[callbackId];
                if (document.querySelector(`#${tempMessageId}`)) {
                    document.querySelector(`#${tempMessageId}`).remove();
                }
                resetSendButton();
                notificationManager.error('Délai d\'attente dépassé');
            }
        }, 30000);

        this.state.smsQuickReplyCallbacks[callbackId] = async (data) => {
            responseReceived = true;
            clearTimeout(timeoutId);
            delete this.state.smsQuickReplyCallbacks[callbackId];

            const tempMsg = document.querySelector(`#${tempMessageId}`);
            if (data.success) {
                if (tempMsg) {
                    // Update spinner to success badge
                    const spinner = tempMsg.querySelector('.spinner-border');
                    if (spinner) {
                        spinner.outerHTML = '<span class="badge bg-success">✓ Envoyé</span>';
                    }
                }
                if (textarea) {
                    textarea.value = '';
                }
                notificationManager.success('Message envoyé');
            } else {
                if (tempMsg) {
                    // Update message with error
                    const spinner = tempMsg.querySelector('.spinner-border');
                    if (spinner) spinner.remove();
                    const statusDiv = tempMsg.querySelector(`#status-${tempMessageId}`);
                    if (statusDiv) {
                        statusDiv.style.display = 'flex';
                        const errorText = tempMsg.querySelector(`#error-text-${tempMessageId}`);
                        if (errorText) {
                            errorText.innerHTML = `❌ ${escapeHtml(data.error || 'Erreur inconnue')}`;
                        }
                    }
                }
                notificationManager.error(data.error || 'Erreur inconnue');
            }

            resetSendButton();
        };

        // Send via WebSocket
        if (this.state.socket) {
            this.state.socket.emit('send-sms-quick', {
                message: message,
                phone: phone,
                safeId: safeId,
                callbackId: callbackId,
                participantId: participantId
            });
        } else {
            clearTimeout(timeoutId);
            delete this.state.smsQuickReplyCallbacks[callbackId];
            if (document.querySelector(`#${tempMessageId}`)) {
                document.querySelector(`#${tempMessageId}`).remove();
            }
            resetSendButton();
            notificationManager.error('Connexion WebSocket indisponible');
        }
    },

    /**
     * Retry sending a message (with message already provided)
     */
    _retryQuickReply(safeId, phone, message, participantId) {
        this._sendMessage(safeId, phone, message, null, null, participantId, true);
    }
});
