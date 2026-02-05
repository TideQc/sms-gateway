/**
 * SMS Module - Gestion complète des SMS (archive, réception, envoi rapide)
 * À inclure après main.js
 */

// Extension de cpaSmsApp pour les fonctions SMS
Object.assign(cpaSmsApp.prototype, {
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
        if (data.length === 0) {
            const archiveList = document.querySelector('#archiveContactsList');
            if (archiveList) archiveList.innerHTML = '<p class="text-muted text-center">Aucune conversation</p>';
            return data;
        }

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

        // Sort contacts: unread first, then by date
        const sortedContacts = Object.keys(grouped)
            .sort((a, b) => {
                const aUnread = grouped[a].unreadCount;
                const bUnread = grouped[b].unreadCount;
                if (aUnread !== bUnread) return bUnread - aUnread;
                const aDate = new Date(grouped[a].messages[0].createdAt);
                const bDate = new Date(grouped[b].messages[0].createdAt);
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
            const lastDate = formatDateEST(contact.messages[0].createdAt).split(' ')[0];
            const safeId = getSafeId(contactKey);
            
            let unreadBadge = '';
            if (contact.unreadCount > 0) {
                unreadBadge = `<span class="badge bg-danger ms-2">${contact.unreadCount}</span>`;
            }
            
            html += `
                <div class="card mb-3" style="background-color: #151515; border: 1px solid #222;">
                    <div class="card-header" style="background-color: #1a1a1a; cursor: pointer;" onclick="app._toggleArchiveMessages('${safeId}', '${contactKey}')">
                        <div class="d-flex justify-content-between align-items-center">
                            <div>
                                <strong style="color: #31a651;">${escapeHtml(contact.displayName)}</strong>
                                <br>
                                <small class="text-muted">📞 ${escapeHtml(contact.phone)}</small>
                            </div>
                            <div class="text-end">
                                ${unreadBadge}
                                <small class="text-muted d-block">${count} message${count > 1 ? 's' : ''} | ${lastDate}</small>
                            </div>
                        </div>
                    </div>
                    <div class="card-body" id="archive-${safeId}" style="display: none; padding: 0;">
                        <div id="messages-${safeId}" style="max-height: 500px; overflow-y: auto;">
            `;
            
            const sortedMessages = [...contact.messages].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            
            sortedMessages.forEach(msg => {
                const date = formatDateEST(msg.createdAt);
                let badge = '', backgroundColor = '', retryButton = '';
                
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
                } else {
                    badge = !msg.IsRead ? 
                        '<span class="badge badge-unread bg-warning text-dark">📨 Non lu</span>' :
                        '<span class="badge bg-info">📨 Reçu</span>';
                    backgroundColor = !msg.IsRead ? '#3a3a1a' : '#1a3a4a';
                }
                
                html += `
                    <div style="border-bottom: 1px solid #222; padding: 12px; color: #e0e0e0; text-align: ${msg.type === 'sent' ? 'right' : 'left'};">
                        <div class="d-flex justify-content-${msg.type === 'sent' ? 'end' : 'start'} align-items-start mb-2">
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
                        <div style="padding: 15px; background-color: #1a1a1a; border-top: 1px solid #222;">
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
        if (archiveList) archiveList.innerHTML = html;

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

        return data;
    },

    /**
     * Add received message to open conversation
     */
    addReceivedMessageToConversation(message) {
        // Find the conversation matching this sender's phone
        const senderPhone = String(message.SenderNumber || '').replace(/\D/g, '');
        let foundSafeId = null;
        let foundCard = null;
        
        document.querySelectorAll('#archiveContactsList > .card').forEach(card => {
            const cardText = card.textContent;
            if (cardText.includes(senderPhone.slice(-10)) || cardText.includes(message.SenderNumber)) {
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
                const isOpen = messagesDiv.style.display !== 'none';
                const date = formatDateEST(message.ReceivedDate || new Date());
                const messageId = `msg-${message.Id}`;
                const messageHtml = `
                    <div id="${messageId}" class="new-received-message" style="border-bottom: 1px solid #222; padding: 12px; color: #e0e0e0; text-align: left; cursor: pointer;" data-message-id="${message.Id}">
                        <div class="d-flex justify-content-start align-items-start mb-2">
                            <small class="text-muted me-2">${date}</small>
                            <span class="badge badge-unread bg-warning text-dark">📨 Non lu</span>
                        </div>
                        <p style="margin: 0; font-size: 0.95rem; padding: 8px 12px; background-color: #3a3a1a; border-radius: 8px; display: inline-block; max-width: 80%;">
                            ${escapeHtml(message.Message)}
                        </p>
                    </div>
                `;
                messagesDiv.insertAdjacentHTML('afterbegin', messageHtml);
                
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
                    messagesDiv.scrollTop = 0;
                    
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
                    const cardHeader = foundCard.querySelector('.card-header .d-flex .text-end');
                    if (cardHeader) {
                        const existingBadge = cardHeader.querySelector('.badge.bg-danger');
                        if (existingBadge) {
                            const currentCount = parseInt(existingBadge.textContent) || 0;
                            existingBadge.textContent = currentCount + 1;
                        } else {
                            const newBadge = document.createElement('span');
                            newBadge.className = 'badge bg-danger ms-2';
                            newBadge.textContent = '1';
                            cardHeader.insertBefore(newBadge, cardHeader.firstChild);
                        }
                        
                        // Update global unread badge
                        const unreadBadge = document.querySelector('#unreadBadge');
                        if (unreadBadge) {
                            const currentCount = parseInt(unreadBadge.textContent) || 0;
                            const newCount = currentCount + 1;
                            unreadBadge.textContent = newCount;
                            unreadBadge.style.display = 'inline-block';
                        }
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
        const archiveSearch = $('#archiveSearch')?.closest('.mb-3');
        const conversationsTitle = $('#archiveSection').find('> h5'); // Get the title

        if (isOpening) {
            // Open: fadeOut other cards and title
            allCards.not(currentCard).fadeOut(300, function() {
                $(this).css('display', 'none');
            });
            if (archiveSearch) archiveSearch.fadeOut(200);
            conversationsTitle.fadeOut(200); // Hide title
        } else {
            // Close: fadeIn other cards and title
            allCards.not(currentCard).fadeIn(300, function() {
                $(this).css('display', 'block');
            });
            if (archiveSearch) archiveSearch.fadeIn(200);
            conversationsTitle.fadeIn(200); // Show title
        }
        
        // Toggle the conversation with slide animation
        element.slideToggle(300, () => {
            // Scroll the textarea into view after animation
            if (isOpening) {
                const textarea = document.querySelector(`#reply-${safeId}`);
                if (textarea) {
                    setTimeout(() => textarea.scrollIntoView({behavior: 'smooth', block: 'nearest'}), 100);
                }
            }
        });

        // Mark as read when opening (only if there are unread messages)
        if (contactKey && contactKey !== 'undefined' && contactKey !== 'Inconnu' && isOpening) {
            // Count unread messages in this conversation
            const unreadMessagesCount = document.querySelectorAll(`#messages-${safeId} .badge-unread`).length;
            
            if (unreadMessagesCount > 0) {
                console.log(`Marking conversation as read - contactKey: ${contactKey}, unreadCount: ${unreadMessagesCount}`);
                
                this.api.markConversationRead(contactKey).then((response) => {
                    
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

    /**
     * Retry sending a message (with message already provided)
     */
    _retryQuickReply(safeId, phone, message, participantId) {
        if (!safeId || !phone || !message) {
            return;
        }
        
        // Add message to conversation with spinner
        const messagesDiv = document.querySelector(`#messages-${safeId}`);
        const tempMessageId = `msg-temp-${Date.now()}`;
        if (messagesDiv) {
            const messageHtml = `
                <div id="${tempMessageId}" style="border-bottom: 1px solid #222; padding: 12px; color: #e0e0e0; text-align: right;">
                    <div class="d-flex justify-content-between align-items-start mb-2">
                        <div></div>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <small class="text-muted">${formatDateEST(new Date())}</small>
                            <small class="text-muted" style="font-size: 0.75rem; color: #888;">(Renvoi)</small>
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
            messagesDiv.insertAdjacentHTML('afterbegin', messageHtml);
            
            // Scroll to top to show the new message
            messagesDiv.scrollTop = 0;
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
        }
    }
});
