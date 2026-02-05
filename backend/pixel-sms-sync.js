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

class PixelSMSSync {
    constructor(pool) {
        this.pool = pool;
        this.pixelUrl = `http://${process.env.PIXEL_IP}:${process.env.PIXEL_PORT}`;
        this.pixelAuth = {
            username: process.env.PIXEL_USER,
            password: process.env.PIXEL_PASS
        };
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
            
            console.log('✅ Pixel 2 connecté via SMS Gateway API');
            return true;
        } catch (error) {
            console.log(`❌ Pixel 2 non accessible: ${error.message}`);
            return false;
        }
    }

    /**
     * Récupère les SMS reçus du Pixel 2
     */
    async fetchReceivedSMS() {
        try {
            // Probe a list of common inbox endpoints and query variants used by SMS Gateway
            const baseEndpoints = ['/messages/inbox', '/messages/received', '/messages/incoming', '/messages'];
            const queryVariants = ['?inbound=true', '?inbound=1', '?direction=in', '?type=1', '?folder=inbox', '?sent=false'];
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
                                            console.log(`📨 ${vitems.length} SMS trouvés via ${ep + q}`);
                                            console.log('🔍 Structure du premier SMS:', JSON.stringify(vitems[0], null, 2));
                                            return { messages: vitems, endpoint: ep + q };
                                        }
                                    }
                                } catch (e) {
                                    // ignore and continue
                                }
                            }
                            console.log(`ℹ️ Endpoint ${ep} returned sent/delivery objects (recipients). Skipping.`);
                            continue;
                        }
                    }

                    console.log(`📨 ${items.length} SMS trouvés via ${ep}`);
                    if (items.length > 0) console.log('🔍 Structure du premier SMS:', JSON.stringify(items[0], null, 2));
                    return { messages: items, endpoint: ep };
                } catch (err) {
                    lastError = err;
                    console.log(`⚠️ Échec ${ep}: ${err.message}`);
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
                            console.log(`📨 ${items.length} SMS trouvés via ${ep}`);
                            console.log('🔍 Structure du premier SMS:', JSON.stringify(items[0], null, 2));
                            return { messages: items, endpoint: ep };
                        }
                    }
                } catch (err) {
                    lastError = err;
                }
            }

            if (lastError) {
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
            console.log('\n📱 Démarrage de la synchronisation des SMS...');
            
            const fetchResult = await this.fetchReceivedSMS();
            const allMessages = Array.isArray(fetchResult) ? fetchResult : (fetchResult.messages || []);
            const endpointUsed = fetchResult.endpoint || null;
            if (endpointUsed) console.log(`ℹ️ Utilisation de l'endpoint: ${endpointUsed}`);
            const phoneMessages = this.filterReceivedMessages(allMessages);
            
            let inserted = 0;
            let skipped = 0;
            let errors = 0;

            for (const sms of phoneMessages) {
                try {
                    // Extraire les champs selon le format de réponse
                    const sender = this.extractSender(sms);
                    const body = this.extractMessageBody(sms);
                    const timestamp = sms.timestamp || sms.date || sms.dateTime || sms.dateTimeStamp;
                    const isRead = !!(sms.read || sms.isRead || sms.seen || sms.status === 'read');

                    if (!sender || !body) {
                        console.log('⚠️  SMS ignoré (données incomplètes)');
                        skipped++;
                        continue;
                    }

                    // Vérifier si le SMS existe déjà
                    const [existing] = await this.pool.query(
                        'SELECT Id FROM ReceivedSMS WHERE SenderNumber = ? AND Message = ? LIMIT 1',
                        [sender, body]
                    );

                    if (existing.length > 0) {
                        console.log(`⏭️  SMS déjà existant: ${sender}`);
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

                    console.log(`✅ SMS importé: ${participantName} (${sender})`);
                    inserted++;

                } catch (error) {
                    console.error(`❌ Erreur lors de l'insertion du SMS:`, error.message);
                    errors++;
                }
            }

            console.log(`\n📊 Résultats: ${inserted} importés, ${skipped} existants, ${errors} erreurs\n`);
            
            return {
                success: true,
                inserted,
                skipped,
                errors,
                total: phoneMessages.length
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
            console.log('\n📱 Synchronisation des SMS non lus...');
            
            const fetchResult = await this.fetchReceivedSMS();
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

            console.log(`\n📊 Résultats: ${inserted} importés, ${skipped} existants\n`);
            
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
