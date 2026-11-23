/**
 * SERVICE DE SYNCHRONISATION DES SMS DEPUIS PIXEL 2
 * Utilise l'API SMS Gateway installée sur le Pixel 2
 * Même API que celle utilisée pour envoyer les SMS
 * 
 * Configuration dans .env:
 * PIXEL_IP=192.168.X.X
 * PIXEL_PORT=8080
 * PIXEL_USER=username
 * PIXEL_PASS=password
 */

const axios = require('axios');

// Fonction utilitaire pour formater la date en Eastern Time
function formatDateEastern(date) {
    const options = {
        timeZone: 'America/New_York',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    };
    const formatter = new Intl.DateTimeFormat('en-US', options);
    const parts = formatter.formatToParts(date);
    const dateParts = {};
    parts.forEach(part => {
        dateParts[part.type] = part.value;
    });
    return `${dateParts.year}-${dateParts.month}-${dateParts.day} ${dateParts.hour}:${dateParts.minute}:${dateParts.second}`;
}

class PixelSMSSync {
    constructor(pool) {
        this.pool = pool;
        this.pixelUrl = `http://${process.env.PIXEL_IP}:${process.env.PIXEL_PORT}`;
        this.pixelAuth = {
            username: process.env.PIXEL_USER,
            password: process.env.PIXEL_PASS
        };
        this.inboxUnsupportedUntil = 0;
        this.inboxUnsupportedRetryMs = parseInt(process.env.PIXEL_INBOX_UNSUPPORTED_RETRY_MS || '300000', 10);
    }

    logJson(level, message) {
        const now = new Date();
        const payload = {
            level,
            timestamp: Math.floor(now.getTime() / 1000),
            date: formatDateEastern(now),
            message
        };

        if (String(level).toUpperCase() === 'ERROR') {
            console.error(JSON.stringify(payload));
            return;
        }

        if (String(level).toUpperCase() === 'WARN') {
            console.warn(JSON.stringify(payload));
            return;
        }

        console.log(JSON.stringify(payload));
    }

    /**
     * Vérifie la connexion à l'API du Pixel 2
     */
    async checkDeviceConnection() {
        try {
            const response = await axios.get(`${this.pixelUrl}/messages`, {
                auth: this.pixelAuth,
                timeout: 5000
            });
            
            this.logJson('INFO', 'Pixel 2 connecté via SMS Gateway API');
            return true;
        } catch (error) {
            this.logJson('ERROR', `Pixel 2 non accessible: ${error.message}`);
            return false;
        }
    }

    /**
     * Récupère les SMS reçus du Pixel 2
     */
    async fetchReceivedSMS() {
        try {
            if (this.inboxUnsupportedUntil && Date.now() < this.inboxUnsupportedUntil) {
                return {
                    messages: [],
                    endpoint: null,
                    unsupported: true,
                    reason: 'inbox-endpoint-unavailable-cached'
                };
            }

            // Probe a list of common inbox endpoints and query variants used by SMS Gateway
            const baseEndpoints = ['/messages/inbox', '/messages/received', '/messages/incoming', '/messages'];
            const queryVariants = ['?inbound=true', '?inbound=1', '?direction=in', '?type=1', '?folder=inbox', '?sent=false'];
            let lastError = null;
            let allErrorsAre404 = true;
            let foundMessagesSentOnly = false;

            const tryEndpoint = async (ep) => {
                const url = `${this.pixelUrl}${ep}`;
                const response = await axios.get(url, { auth: this.pixelAuth, timeout: 15000 });
                let items = response.data.messages || response.data.items || response.data || [];
                if (!Array.isArray(items)) items = [];
                return items;
            };

            for (const ep of baseEndpoints) {
                try {
                    let items = await tryEndpoint(ep);

                    // If the endpoint looks like it returns sent records (has recipients but no body), try query variants for /messages
                    if (items.length > 0) {
                        const first = items[0];
                        const looksLikeSent = ('recipients' in first) && !('body' in first || 'message' in first || 'text' in first || 'content' in first || 'parts' in first);
                        if (looksLikeSent && ep === '/messages') {
                            // try variants on /messages
                            for (const q of queryVariants) {
                                try {
                                    const vitems = await tryEndpoint(ep + q);
                                    if (Array.isArray(vitems) && vitems.length > 0) {
                                        const vf = vitems[0];
                                        const vfHasBody = ('body' in vf || 'message' in vf || 'text' in vf || 'content' in vf || 'parts' in vf);
                                        if (vfHasBody) {
                                            this.logJson('INFO', `SMS trouvés via ${ep + q}: ${vitems.length}`);
                                            this.logJson('DEBUG', `Structure du premier SMS: ${JSON.stringify(vitems[0], null, 2)}`);
                                            return { messages: vitems, endpoint: ep + q };
                                        }
                                    }
                                } catch (e) {
                                    const status = e?.response?.status;
                                    if (status !== 404) allErrorsAre404 = false;
                                    // ignore and continue
                                }
                            }
                            foundMessagesSentOnly = true;
                            this.logJson('INFO', `Endpoint ${ep} returned sent/delivery objects (recipients). Skipping.`);
                            continue;
                        }
                    }

                    this.logJson('INFO', `SMS trouvés via ${ep}: ${items.length}`);
                    if (items.length > 0) this.logJson('DEBUG', `Structure du premier SMS: ${JSON.stringify(items[0], null, 2)}`);
                    return { messages: items, endpoint: ep };
                } catch (err) {
                    lastError = err;
                    const status = err?.response?.status;
                    if (status !== 404) allErrorsAre404 = false;
                    if (status !== 404) {
                        this.logJson('WARN', `Échec ${ep}: ${err.message}`);
                    }
                }
            }

            // As a last attempt, try /messages with each query variant even if base '/messages' wasn't hit
            for (const q of queryVariants) {
                try {
                    const ep = '/messages' + q;
                    const items = await tryEndpoint(ep);
                    if (Array.isArray(items) && items.length > 0) {
                        const first = items[0];
                        const hasBody = ('body' in first || 'message' in first || 'text' in first || 'content' in first || 'parts' in first);
                        if (hasBody) {
                            this.logJson('INFO', `SMS trouvés via ${ep}: ${items.length}`);
                            this.logJson('DEBUG', `Structure du premier SMS: ${JSON.stringify(items[0], null, 2)}`);
                            return { messages: items, endpoint: ep };
                        }
                    }
                } catch (err) {
                    lastError = err;
                    const status = err?.response?.status;
                    if (status !== 404) allErrorsAre404 = false;
                }
            }

            if (lastError) {
                // Device is reachable for send, but inbox endpoints may not be supported on this gateway build
                if (allErrorsAre404 || foundMessagesSentOnly) {
                    this.inboxUnsupportedUntil = Date.now() + this.inboxUnsupportedRetryMs;
                    this.logJson('WARN', `Aucun endpoint inbox exploitable. Nouvelle tentative dans ${Math.round(this.inboxUnsupportedRetryMs / 1000)}s.`);
                    return {
                        messages: [],
                        endpoint: null,
                        unsupported: true,
                        reason: allErrorsAre404 ? 'all-inbox-endpoints-404' : 'messages-endpoint-sent-only'
                    };
                }
                console.error('❌ Aucun endpoint valide trouvé pour récupérer les SMS:', lastError.message);
                throw lastError;
            }

            return { messages: [], endpoint: null };
        } catch (error) {
            console.error('❌ Erreur lors de la récupération des SMS:', error.message);
            throw error;
        }
    }

    /**
     * Récupère les SMS envoyés du Pixel 2
     */
    async fetchSentSMS() {
        try {
            const baseEndpoints = ['/messages/sent', '/messages/outbox', '/messages/outgoing', '/messages'];
            const queryVariants = ['?sent=true', '?outbound=true', '?outbound=1', '?direction=out', '?type=2', '?folder=sent'];
            let lastError = null;

            const tryEndpoint = async (ep) => {
                const url = `${this.pixelUrl}${ep}`;
                const response = await axios.get(url, { auth: this.pixelAuth, timeout: 15000 });
                let items = response.data.messages || response.data.items || response.data || [];
                if (!Array.isArray(items)) items = [];
                return items;
            };

            for (const ep of baseEndpoints) {
                try {
                    let items = await tryEndpoint(ep);

                    if (ep === '/messages' && items.length > 0) {
                        const first = items[0];
                        const likelyIncomingOnly = ('body' in first || 'message' in first || 'text' in first || 'content' in first || 'parts' in first) && !('recipients' in first);
                        if (likelyIncomingOnly) {
                            for (const q of queryVariants) {
                                try {
                                    const vitems = await tryEndpoint(ep + q);
                                    if (Array.isArray(vitems) && vitems.length > 0) {
                                        this.logJson('INFO', `SMS envoyés trouvés via ${ep + q}: ${vitems.length}`);
                                        return { messages: vitems, endpoint: ep + q };
                                    }
                                } catch {
                                    // continue probing
                                }
                            }
                        }
                    }

                    this.logJson('INFO', `SMS envoyés trouvés via ${ep}: ${items.length}`);
                    return { messages: items, endpoint: ep };
                } catch (err) {
                    lastError = err;
                }
            }

            for (const q of queryVariants) {
                try {
                    const ep = '/messages' + q;
                    const items = await tryEndpoint(ep);
                    if (Array.isArray(items)) {
                        this.logJson('INFO', `SMS envoyés trouvés via ${ep}: ${items.length}`);
                        return { messages: items, endpoint: ep };
                    }
                } catch (err) {
                    lastError = err;
                }
            }

            if (lastError) {
                const status = lastError?.response?.status;
                if (status === 404) {
                    return { messages: [], endpoint: null, unsupported: true, reason: 'sent-endpoint-404' };
                }
                throw lastError;
            }

            return { messages: [], endpoint: null };
        } catch (error) {
            console.error('❌ Erreur lors de la récupération des SMS envoyés:', error.message);
            throw error;
        }
    }

    /**
     * Filtre uniquement les SMS reçus (pas envoyés)
     */
    filterReceivedMessages(messages) {
        // Type: 1 = Inbox (reçu), 2 = Sent (envoyé)
        return messages.filter(msg =>
            msg.type === 1 ||
            msg.direction === 'in' ||
            msg.inbound === true ||
            (msg.folder && String(msg.folder).toLowerCase().includes('inbox')) ||
            // fallback: if message has a body/text field but not recipients-only structure
            (('body' in msg || 'message' in msg || 'text' in msg || 'content' in msg || 'parts' in msg) && !('recipients' in msg))
        );
    }

    /**
     * Filtre uniquement les SMS non lus
     */
    filterUnreadMessages(messages) {
        return messages.filter(msg => {
            const isInbox = (msg.type === 1 || msg.direction === 'in' || msg.inbound === true || (msg.folder && String(msg.folder).toLowerCase().includes('inbox')));
            const notRead = !(msg.read || msg.isRead || msg.seen || msg.status === 'read');
            return isInbox && notRead;
        });
    }

    /**
     * Filtre uniquement les SMS envoyés
     */
    filterSentMessages(messages) {
        return messages.filter(msg =>
            msg.type === 2 ||
            msg.direction === 'out' ||
            msg.outbound === true ||
            msg.sent === true ||
            (msg.folder && String(msg.folder).toLowerCase().includes('sent')) ||
            Array.isArray(msg.recipients)
        );
    }

    // Helper: extract sender flexibly
    extractSender(msg) {
        if (!msg) return null;
        if (msg.sender) return msg.sender;
        if (msg.from) return msg.from;
        if (msg.address) return msg.address;
        // Some APIs present 'phoneNumber' directly or inside a nested object
        if (msg.phoneNumber) return msg.phoneNumber;
        if (msg.participant) return msg.participant;
        // As a last resort, try recipients[0].phoneNumber (but that's usually sent records)
        if (Array.isArray(msg.recipients) && msg.recipients.length > 0 && msg.recipients[0].phoneNumber) return msg.recipients[0].phoneNumber;
        return null;
    }

    // Helper: extract message body flexibly
    extractMessageBody(msg) {
        if (!msg) return '';
        if (typeof msg.body === 'string' && msg.body.trim()) return msg.body.trim();
        if (typeof msg.message === 'string' && msg.message.trim()) return msg.message.trim();
        if (typeof msg.text === 'string' && msg.text.trim()) return msg.text.trim();
        if (typeof msg.content === 'string' && msg.content.trim()) return msg.content.trim();

        // If message is nested as an object
        if (msg.message && typeof msg.message === 'object') {
            return msg.message.body || msg.message.text || JSON.stringify(msg.message);
        }

        // If multipart
        if (Array.isArray(msg.parts)) {
            const joined = msg.parts.map(p => p.body || p.text || p.message || '').filter(Boolean).join('');
            if (joined) return joined;
        }

        // Some gateways wrap payload
        if (msg.payload && typeof msg.payload === 'string') return msg.payload;

        return '';
    }

    extractRecipient(msg) {
        if (!msg) return null;
        if (msg.recipient) return msg.recipient;
        if (msg.to) return msg.to;
        if (msg.address && (msg.type === 2 || msg.direction === 'out' || msg.outbound === true)) return msg.address;

        if (Array.isArray(msg.recipients) && msg.recipients.length > 0) {
            const first = msg.recipients[0];
            if (typeof first === 'string') return first;
            if (first?.phoneNumber) return first.phoneNumber;
            if (first?.address) return first.address;
            if (first?.to) return first.to;
        }

        return null;
    }

    resolveSentStatus(msg) {
        const rawStatus = String(msg?.status || msg?.state || '').toLowerCase();
        if (!rawStatus) return 'succès';
        if (['error', 'erreur', 'failed', 'failure', 'ko', 'undelivered'].includes(rawStatus)) {
            return 'erreur';
        }
        return 'succès';
    }

    /**
     * Nettoie un numéro de téléphone pour la comparaison
     */
    cleanPhoneNumber(phone) {
        return phone.replace(/\D/g, '').slice(-10);
    }

    /**
     * Trouve un participant par numéro de téléphone
     */
    async findParticipantByPhone(phoneNumber) {
        try {
            const cleanedPhone = this.cleanPhoneNumber(phoneNumber);
            
            const [rows] = await this.pool.query(
                'SELECT Id, Prenom, NomDeFamille FROM Participants WHERE NumeroTel LIKE ? LIMIT 1',
                [`%${cleanedPhone}%`]
            );

            return rows.length > 0 ? rows[0] : null;
        } catch (error) {
            console.error('Erreur lors de la recherche du participant:', error);
            return null;
        }
    }

    /**
     * Synchronise les SMS du Pixel 2 avec la base de données
     */
    async syncSMSToDatabase() {
        try {
            this.logJson('INFO', 'Démarrage de la synchronisation des SMS...');
            
            const fetchResult = await this.fetchReceivedSMS();
            const allMessages = Array.isArray(fetchResult) ? fetchResult : (fetchResult.messages || []);
            const endpointUsed = fetchResult.endpoint || null;
            if (endpointUsed) this.logJson('INFO', `Utilisation de l'endpoint: ${endpointUsed}`);
            const phoneMessages = this.filterReceivedMessages(allMessages);

            const sentFetchResult = await this.fetchSentSMS();
            const sentAllMessages = Array.isArray(sentFetchResult) ? sentFetchResult : (sentFetchResult.messages || []);
            const sentEndpointUsed = sentFetchResult.endpoint || null;
            if (sentEndpointUsed) this.logJson('INFO', `Utilisation de l'endpoint sent: ${sentEndpointUsed}`);
            const sentMessages = this.filterSentMessages(sentAllMessages);
            
            let inserted = 0;
            let insertedSent = 0;
            let skipped = 0;
            let skippedSent = 0;
            let errors = 0;

            for (const sms of phoneMessages) {
                try {
                    // Extraire les champs selon le format de réponse
                    const sender = this.extractSender(sms);
                    const body = this.extractMessageBody(sms);
                    const timestamp = sms.timestamp || sms.date || sms.dateTime || sms.dateTimeStamp;
                    const isRead = !!(sms.read || sms.isRead || sms.seen || sms.status === 'read');

                    if (!sender || !body) {
                        this.logJson('WARN', 'SMS ignoré (données incomplètes)');
                        skipped++;
                        continue;
                    }

                    // Vérifier si le SMS existe déjà
                    const [existing] = await this.pool.query(
                        'SELECT Id FROM ReceivedSMS WHERE SenderNumber = ? AND Message = ? LIMIT 1',
                        [sender, body]
                    );

                    if (existing.length > 0) {
                        this.logJson('INFO', `SMS déjà existant: ${sender}`);
                        skipped++;
                        continue;
                    }

                    // Trouver le participant
                    const participant = await this.findParticipantByPhone(sender || '');
                    const participantId = participant?.Id || null;
                    const participantName = participant 
                        ? `${participant.Prenom} ${participant.NomDeFamille}` 
                        : 'Inconnu';

                    // Insérer le SMS dans la base de données
                    const smsDate = timestamp ? new Date(timestamp) : new Date();
                    await this.pool.query(
                        'INSERT INTO ReceivedSMS (ParticipantId, Message, SenderNumber, IsRead, ReceivedDate) VALUES (?, ?, ?, ?, ?)',
                        [participantId, body, sender || null, isRead ? 1 : 0, smsDate]
                    );

                    this.logJson('INFO', `SMS importé: ${participantName} (${sender})`);
                    inserted++;

                } catch (error) {
                    console.error(`❌ Erreur lors de l'insertion du SMS:`, error.message);
                    errors++;
                }
            }

            for (const sms of sentMessages) {
                try {
                    const recipient = this.extractRecipient(sms);
                    const body = this.extractMessageBody(sms);
                    const timestamp = sms.timestamp || sms.date || sms.dateTime || sms.dateTimeStamp;
                    const statut = this.resolveSentStatus(sms);

                    if (!recipient || !body) {
                        skippedSent++;
                        continue;
                    }

                    const participant = await this.findParticipantByPhone(recipient || '');
                    const participantId = participant?.Id || null;
                    const smsDate = timestamp ? new Date(timestamp) : new Date();

                    const [existing] = await this.pool.query(
                        `SELECT Id
                         FROM SentSMS
                         WHERE RecipientNumber = ?
                           AND Message = ?
                           AND ABS(TIMESTAMPDIFF(SECOND, SentDate, ?)) <= 120
                         LIMIT 1`,
                        [recipient, body, smsDate]
                    );

                    if (existing.length > 0) {
                        skippedSent++;
                        continue;
                    }

                    await this.pool.query(
                        'INSERT INTO SentSMS (ParticipantId, Message, RecipientNumber, Statut, SentDate) VALUES (?, ?, ?, ?, ?)',
                        [participantId, body, recipient || null, statut, smsDate]
                    );

                    insertedSent++;
                } catch (error) {
                    console.error('❌ Erreur lors de l\'insertion du SMS envoyé:', error.message);
                    errors++;
                }
            }

            this.logJson('INFO', `Résultats: reçus ${inserted} importés/${skipped} existants, envoyés ${insertedSent} importés/${skippedSent} existants, ${errors} erreurs`);
            
            return {
                success: true,
                inserted,
                skipped,
                insertedSent,
                skippedSent,
                errors,
                total: phoneMessages.length,
                totalSent: sentMessages.length
            };

        } catch (error) {
            console.error('❌ Erreur lors de la synchronisation:', error.message);
            throw error;
        }
    }

    /**
     * Récupère uniquement les SMS non lus
     */
    async syncUnreadOnly() {
        try {
            const fetchResult = await this.fetchReceivedSMS();
            if (fetchResult?.unsupported) {
                return {
                    success: true,
                    inserted: 0,
                    skipped: 0,
                    total: 0,
                    unsupported: true,
                    reason: fetchResult.reason || 'inbox-endpoint-unavailable'
                };
            }

            this.logJson('INFO', 'Synchronisation des SMS non lus...');

            const allMessages = Array.isArray(fetchResult) ? fetchResult : (fetchResult.messages || []);
            const unreadMessages = this.filterUnreadMessages(allMessages);
            
            let inserted = 0;
            let skipped = 0;

            for (const sms of unreadMessages) {
                try {
                    const sender = this.extractSender(sms);
                    const body = this.extractMessageBody(sms);
                    const timestamp = sms.timestamp || sms.date || sms.dateTime || sms.dateTimeStamp;

                    if (!sender || !body) continue;

                    const [existing] = await this.pool.query(
                        'SELECT Id FROM ReceivedSMS WHERE SenderNumber = ? AND Message = ? LIMIT 1',
                        [sender, body]
                    );

                    if (existing.length === 0) {
                        const participant = await this.findParticipantByPhone(sender);
                        const smsDate = timestamp ? new Date(timestamp) : new Date();
                        
                        await this.pool.query(
                            'INSERT INTO ReceivedSMS (ParticipantId, Message, SenderNumber, IsRead, ReceivedDate) VALUES (?, ?, ?, 0, ?)',
                            [participant?.Id || null, body, sender || null, smsDate]
                        );
                        inserted++;
                    } else {
                        skipped++;
                    }
                } catch (error) {
                    console.error('Erreur:', error.message);
                }
            }

            this.logJson('INFO', `Résultats: ${inserted} importés, ${skipped} existants`);
            
            return {
                success: true,
                inserted,
                skipped,
                total: unreadMessages.length
            };

        } catch (error) {
            console.error('❌ Erreur:', error.message);
            throw error;
        }
    }
}

module.exports = PixelSMSSync;
