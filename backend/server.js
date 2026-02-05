require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const mysql = require('mysql2/promise');
const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const XLSX = require('xlsx');
const PixelSMSSync = require('./pixel-sms-sync');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());

/**
 * Format date in Eastern Time (readable format)
 */
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

/**
 * Format data for log message
 */
function formatLogData(data) {
    return Object.entries(data)
        .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
        .join(', ');
}

/**
 * JSON Logger for monitoring
 */
const logger = {
    info: (message, data = {}) => {
        const now = new Date();
        const fullMessage = Object.keys(data).length > 0 
            ? `${message} - ${formatLogData(data)}`
            : message;
        console.log(JSON.stringify({
            level: 'INFO',
            timestamp: Math.floor(now.getTime() / 1000),
            date: formatDateEastern(now),
            message: fullMessage
        }));
    },
    error: (message, data = {}) => {
        const now = new Date();
        const fullMessage = Object.keys(data).length > 0 
            ? `${message} - ${formatLogData(data)}`
            : message;
        console.error(JSON.stringify({
            level: 'ERROR',
            timestamp: Math.floor(now.getTime() / 1000),
            date: formatDateEastern(now),
            message: fullMessage
        }));
    },
    warn: (message, data = {}) => {
        const now = new Date();
        const fullMessage = Object.keys(data).length > 0 
            ? `${message} - ${formatLogData(data)}`
            : message;
        console.warn(JSON.stringify({
            level: 'WARN',
            timestamp: Math.floor(now.getTime() / 1000),
            date: formatDateEastern(now),
            message: fullMessage
        }));
    }
};

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10
});

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';

/**
 * Normalize phone number for comparison (10 digits only)
 */
function normalizePhone(phone) {
    if (!phone) return '';
    let cleaned = String(phone).replace(/\D/g, '');
    if (cleaned.length === 11 && cleaned.startsWith('1')) {
        cleaned = cleaned.substring(1);
    }
    return cleaned;
}

/**
 * Format phone number for display (+1XXXXXXXXXX)
 */
function formatPhoneForDisplay(phone) {
    if (!phone) return 'Inconnu';
    const normalized = normalizePhone(phone);
    if (!normalized || normalized.length !== 10) return String(phone);
    return '+1' + normalized;
}

// Middleware d'authentification
const verifyToken = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Token manquant' });
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.userId = decoded.userId;
        req.username = decoded.username;
        next();
    } catch (err) {
        res.status(401).json({ error: 'Token invalide' });
    }
};

const waitRandom = (min, max) => {
    const ms = Math.floor(Math.random() * (max - min + 1) + min) * 1000;
    return new Promise(resolve => setTimeout(resolve, ms));
};

let statsEnvoi = { total: 0, actuel: 0, enCours: false, details: {} };

// LOGIN ENDPOINT
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ error: 'Username et password requis' });
    }
    
    try {
        const [rows] = await pool.query('SELECT Id, Username, Password FROM Utilisateurs WHERE Username = ?', [username]);
        
        if (rows.length === 0) {
            return res.status(401).json({ error: 'Identifiants invalides' });
        }
        
        const user = rows[0];
        const isPasswordValid = await bcrypt.compare(password, user.Password);
        
        if (!isPasswordValid) {
            return res.status(401).json({ error: 'Identifiants invalides' });
        }
        
        // Update LastLoginDate
        await pool.query('UPDATE Utilisateurs SET LastLoginDate = ? WHERE Id = ?', [Math.floor(Date.now() / 1000), user.Id]);
        
        // Generate JWT token
        const token = jwt.sign(
            { userId: user.Id, username: user.Username },
            JWT_SECRET,
            { expiresIn: '24h' }
        );
        
        res.json({ 
            success: true, 
            token, 
            username: user.Username,
            message: 'Connecté avec succès'
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// LOGOUT ENDPOINT
app.post('/logout', verifyToken, (req, res) => {
    res.json({ success: true, message: 'Déconnecté avec succès' });
});

// VERIFY TOKEN ENDPOINT
app.get('/verify-token', verifyToken, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT Id, Username, Email FROM Utilisateurs WHERE Id = ?', [req.userId]);
        if (rows.length === 0) {
            return res.status(401).json({ error: 'Utilisateur non trouvé' });
        }
        res.json({ success: true, user: rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Protected endpoints
app.get('/participants', verifyToken, async (req, res) => {
    try {
        // Désactiver le cache HTTP
        res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');
        
        const [rows] = await pool.query(`
            SELECT SQL_NO_CACHE p.*, 
                   COUNT(CASE WHEN r.IsRead = 0 THEN 1 END) as UnreadSMS
            FROM Participants p
            LEFT JOIN ReceivedSMS r ON p.Id = r.ParticipantId
            GROUP BY p.Id
            ORDER BY p.Prenom ASC
        `);
        const cleanRows = rows.map(p => ({ ...p, NumeroTel: formatPhoneForDisplay(p.NumeroTel) }));
        res.json(cleanRows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// EXCEL IMPORT ENDPOINT
app.post('/api/participants/import-excel', verifyToken, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Aucun fichier fourni' });
        }

        // Vérifier l'extension du fichier
        const allowedMimes = ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'];
        if (!allowedMimes.includes(req.file.mimetype)) {
            return res.status(400).json({ error: 'Format de fichier non valide. Utilisez .xlsx ou .xls' });
        }

        // Lire le fichier Excel
        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(worksheet);

        if (data.length === 0) {
            return res.status(400).json({ error: 'Le fichier Excel est vide' });
        }

        let successCount = 0;
        let errorCount = 0;
        const errors = [];

        for (const row of data) {
            try {
                // Mapper les colonnes (adapter selon les noms de colonnes de votre Excel)
                const prenom = row.Prenom || row.prenom || row.FirstName || '';
                const nomDeFamille = row.NomDeFamille || row['Nom de Famille'] || row.LastName || '';
                const numeroTel = row.NumeroTel || row['Numéro Tel'] || row.Phone || '';
                const park = row.Park || row.parc || '';
                const type = row.Type || row.type || '';
                const coach = row.Coach || row.coach || '';
                const dateInscription = row['Date Inscription'] || row.DateInscription || new Date().toISOString().split('T')[0];

                if (!numeroTel || !numeroTel.toString().trim()) {
                    errorCount++;
                    errors.push(`Ligne avec ${prenom} ${nomDeFamille}: numéro de téléphone manquant`);
                    continue;
                }

                // Formater le numéro de téléphone
                let telBrut = numeroTel.toString().trim();
                let chiffres = telBrut.replace(/\D/g, '');
                let finalTel = telBrut;
                if (chiffres.length === 10) finalTel = '+1' + chiffres;
                else if (chiffres.length === 11 && chiffres.startsWith('1')) finalTel = '+' + chiffres;
                else if (chiffres.length > 11) finalTel = '+' + chiffres;

                // Vérifier si le participant existe déjà (par numéro de téléphone)
                const [existing] = await pool.query(
                    'SELECT Id FROM Participants WHERE NumeroTel = ?',
                    [finalTel]
                );

                if (existing.length > 0) {
                    // Mise à jour du participant existant
                    await pool.query(
                        `UPDATE Participants 
                         SET Prenom = ?, NomDeFamille = ?, Park = ?, Type = ?, Coach = ? 
                         WHERE NumeroTel = ?`,
                        [prenom, nomDeFamille, park, type, coach, finalTel]
                    );
                } else {
                    // Insertion du nouveau participant
                    await pool.query(
                        `INSERT INTO Participants (Prenom, NomDeFamille, NumeroTel, Park, Type, Coach, DateInscription) 
                         VALUES (?, ?, ?, ?, ?, ?, ?)`,
                        [prenom, nomDeFamille, finalTel, park, type, coach, dateInscription]
                    );
                }

                successCount++;
            } catch (err) {
                errorCount++;
                errors.push(`Ligne avec ${row.Prenom || 'N/A'}: ${err.message}`);
            }
        }

        const message = `Import terminé: ${successCount} participant(s) importé(s)${errorCount > 0 ? `, ${errorCount} erreur(s)` : ''}`;
        logger.info('Excel import completed', { successCount, errorCount, username: req.username });
        
        res.json({
            success: true,
            message: message,
            successCount: successCount,
            errorCount: errorCount,
            errors: errors.length > 0 ? errors : undefined
        });
    } catch (err) {
        logger.error('Excel import failed', { error: err.message, username: req.username });
        res.status(500).json({ error: 'Erreur lors de l\'import: ' + err.message });
    }
});

app.get('/send-status', verifyToken, (req, res) => res.json(statsEnvoi));

// PIXEL CONNECTION STATUS ENDPOINT
app.get('/pixel-status', verifyToken, async (req, res) => {
    try {
        const pixelUrl = `http://${process.env.PIXEL_IP}:${process.env.PIXEL_PORT}/health`;
        const response = await axios.get(pixelUrl, {
            auth: {
                username: process.env.PIXEL_USER,
                password: process.env.PIXEL_PASS
            },
            timeout: 5000
        });
        
        // Si on reçoit une réponse 200, Pixel est connecté
        logger.info('Pixel health check successful', { status: 'connected' });
        res.json({ connected: true, status: response.data });
    } catch (err) {
        // Si la requête échoue, Pixel est déconnecté
        logger.warn('Pixel health check failed', { error: err.message });
        res.json({ connected: false, error: err.message });
    }
});

app.get('/participant-history/:id', verifyToken, async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT Message, Statut, SentDate as createdAt FROM SentSMS WHERE ParticipantId = ? ORDER BY SentDate DESC', 
            [req.params.id]
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/send-bulk', verifyToken, async (req, res) => {
    const { ids, phones, message } = req.body;
    let listeCible = [];

    try {
        if (ids) {
            const [rows] = await pool.query('SELECT Id, NumeroTel FROM Participants WHERE Id IN (?)', [ids]);
            listeCible = rows.map(r => ({ id: r.Id, tel: r.NumeroTel }));
        } else if (phones) {
            listeCible = phones.map(p => ({ id: `manual-${p.replace(/\D/g,'')}`, tel: p }));
        }

        statsEnvoi = { total: listeCible.length, actuel: 0, enCours: true, details: {} };
        io.emit('progress', statsEnvoi);
        res.json({ status: "Démarré" });

        const targetUrl = `http://${process.env.PIXEL_IP}:${process.env.PIXEL_PORT}/messages`;

        for (const item of listeCible) {
            let statut = 'succès';
            let erreur = null;
            let finalPhone = (item.tel || "").trim();
            if (!finalPhone.startsWith('+')) finalPhone = '+1' + finalPhone.replace(/\D/g, '');

            try {
                // 1. APPEL PIXEL (Format strict validé)
                await axios.post(targetUrl, {
                    phoneNumbers: [finalPhone],
                    textMessage: { text: message }
                }, { 
                    auth: { username: process.env.PIXEL_USER, password: process.env.PIXEL_PASS },
                    timeout: 15000 
                });
                logger.info('Bulk SMS sent', { phone: finalPhone, participantId: item.id, status: statut });
            } catch (e) {
                statut = 'échec';
                erreur = e.message;
                logger.error('Bulk SMS failed', { phone: finalPhone, participantId: item.id, error: erreur });
            }

            // 2. SIGNAL IMMÉDIAT AU FRONTEND 🚀
            statsEnvoi.details[item.id] = statut;
            statsEnvoi.actuel++;
            io.emit('progress', statsEnvoi);

            // 3. LOG DB (Optionnel) — enregistrer aussi les envois manuels
            const isManual = String(item.id).startsWith('manual');
            const participantIdForDb = isManual ? null : item.id;
            try {
                await pool.query(
                    'INSERT INTO SentSMS (ParticipantId, Message, RecipientNumber, Statut, SentDate) VALUES (?, ?, ?, ?, NOW())',
                    [participantIdForDb, message, item.tel || item.numero, statut]
                );
            } catch (e) {
                logger.error('Bulk SMS database insert failed', { participantId: item.id, phone: item.tel, error: e.message });
            }

            // 4. ATTENTE DE SÉCURITÉ APRÈS LE SIGNAL
            if (statsEnvoi.actuel < statsEnvoi.total) {
                await waitRandom(10, 20);
            }
        }
        statsEnvoi.enCours = false;
        io.emit('finish', statsEnvoi);
    } catch (err) { logger.error('Bulk SMS error', { error: err.message }); }
});

// SMS Management Endpoints
app.get('/unread-sms', verifyToken, async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT r.*, 
                   COALESCE(p.Prenom, 'Inconnu') AS Prenom, 
                   COALESCE(p.NomDeFamille, '') AS NomDeFamille, 
                   COALESCE(p.NumeroTel, r.SenderNumber) AS NumeroTel
            FROM ReceivedSMS r
            LEFT JOIN Participants p ON r.ParticipantId = p.Id
            WHERE r.IsRead = 0
            ORDER BY r.ReceivedDate DESC
        `);
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/send-sms-quick', verifyToken, async (req, res) => {
    try {
        const { message, phone } = req.body;
        
        logger.info('REST: send-sms-quick received', { phone, messageLength: message?.length });
        
        if (!message || !phone) {
            logger.warn('REST: send-sms-quick - Missing parameters', { hasMessage: !!message, hasPhone: !!phone });
            return res.status(400).json({ error: 'Message et numéro requis' });
        }

        // Émettre le début du progress
        io.emit('progress', { actuel: 0, total: 1, details: { [phone]: 'envoi' } });

        try {
            // Envoyer via Pixel API
            const response = await axios.post(
                `http://${process.env.PIXEL_IP}:${process.env.PIXEL_PORT}/messages`,
                { phoneNumbers: [phone], textMessage: { text: message } },
                { 
                    auth: { username: process.env.PIXEL_USER, password: process.env.PIXEL_PASS },
                    timeout: 15000 
                }
            );
            
            const status = response.data?.status === 'ok' ? 'succès' : 'erreur';
            logger.info('REST: SMS sent successfully', { phone, status, responseStatus: response.status });
            
            // Insérer dans SentSMS
            const [result] = await pool.query(
                'INSERT INTO SentSMS (ParticipantId, Message, RecipientNumber, Statut, SentDate) VALUES (NULL, ?, ?, ?, NOW())',
                [message, phone, status]
            );
            
            const messageId = result.insertId;
            
            // Émettre le progress complété
            io.emit('progress', { actuel: 1, total: 1, details: { [phone]: status } });
            
            // Émettre le finish
            io.emit('finish');
            
            // Émettre le nouveau message envoyé pour l'ajouter à la conversation
            io.emit('sms-sent', {
                Id: messageId,
                Message: message,
                RecipientNumber: phone,
                Statut: status,
                SentDate: new Date().toISOString(),
                type: 'sent'
            });
            
            res.json({ success: true, messageId, status });
        } catch (apiErr) {
            logger.error('REST: SMS send failed', { phone, error: apiErr.message });
            
            // Insérer comme erreur
            await pool.query(
                'INSERT INTO SentSMS (ParticipantId, Message, RecipientNumber, Statut, SentDate) VALUES (NULL, ?, ?, ?, NOW())',
                [message, phone, 'erreur']
            );
            
            io.emit('progress', { actuel: 1, total: 1, details: { [phone]: 'erreur' } });
            io.emit('finish');
            
            res.json({ success: false, error: apiErr.message });
        }
    } catch (err) {
        logger.error('REST: send-sms-quick error', { error: err.message });
        res.status(500).json({ error: err.message });
    }
});

app.post('/mark-sms-read/:smsId', verifyToken, async (req, res) => {
    try {
        const smsId = req.params.smsId;
        await pool.query('UPDATE ReceivedSMS SET IsRead = 1, ReadDate = NOW() WHERE Id = ?', [smsId]);
        res.json({ success: true, message: 'SMS marqué comme lu' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/mark-conversation-read', verifyToken, async (req, res) => {
    try {
        const { contactKey } = req.body;
        
        logger.info('Mark conversation as read', { contactKey, userId: req.userId });
        
        // Vérifier si c'est un numéro de téléphone (contient +, -, ou parenthèses, ou > 1 million)
        const isPhoneNumber = /[+\-()x ]/.test(contactKey) || contactKey > 1000000;
        
        if (!isPhoneNumber && !isNaN(contactKey)) {
            // C'est un ParticipantId (petit nombre)
            const participantId = parseInt(contactKey);
            const [result] = await pool.query('UPDATE ReceivedSMS SET IsRead = 1, ReadDate = NOW() WHERE ParticipantId = ? AND IsRead = 0', [participantId]);
            logger.info('Conversation marked as read by ParticipantId', { participantId, affectedRows: result.affectedRows });
        } else {
            // C'est un numéro de téléphone - peut être un participant connu ou un Inconnu
            // Normaliser le numéro: enlever tous les caractères non-numériques
            const normalizedContactKey = contactKey.replace(/\D/g, '');
            
            // Chercher si ce numéro appartient à un participant (en normalisant aussi)
            const [participants] = await pool.query(
                'SELECT Id FROM Participants WHERE REPLACE(REPLACE(REPLACE(REPLACE(NumeroTel, "-", ""), "(", ""), ")", ""), " ", "") = ?',
                [normalizedContactKey]
            );
            
            if (participants.length > 0) {
                // C'est un participant connu - mettre à jour par ParticipantId
                const participantId = participants[0].Id;
                const [result] = await pool.query('UPDATE ReceivedSMS SET IsRead = 1, ReadDate = NOW() WHERE ParticipantId = ? AND IsRead = 0', [participantId]);
                logger.info('Conversation marked as read by phone', { phone: contactKey, participantId, affectedRows: result.affectedRows });
            } else {
                // C'est un Inconnu - mettre à jour par SenderNumber
                // Le SenderNumber peut avoir des formats différents: +15147957125, 5147957125, (514) 795-7125, etc.
                const [result] = await pool.query(
                    'UPDATE ReceivedSMS SET IsRead = 1, ReadDate = NOW() WHERE (SenderNumber = ? OR REPLACE(REPLACE(REPLACE(REPLACE(SenderNumber, "-", ""), "(", ""), ")", ""), " ", "") = ? OR REPLACE(REPLACE(REPLACE(REPLACE(SenderNumber, "-", ""), "(", ""), ")", ""), " ", "") = ? OR SenderNumber LIKE CONCAT("%", ?, "%")) AND IsRead = 0',
                    [contactKey, normalizedContactKey, contactKey.replace(/\D/g, ''), normalizedContactKey]
                );
                logger.info('Conversation marked as read for unknown sender', { phone: contactKey, affectedRows: result.affectedRows });
            }
        }
        
        res.json({ success: true, message: 'Conversation marquée comme lue', contactKey });
    } catch (err) { 
        logger.error('Mark conversation as read failed', { error: err.message, contactKey: req.body?.contactKey, userId: req.userId });
        res.status(500).json({ error: err.message }); 
    }
});

app.get('/sent-messages-archive', verifyToken, async (req, res) => {
    try {
        // Get all sent messages
        const [sentMessages] = await pool.query(`
            SELECT s.Id, s.ParticipantId, s.Message, s.Statut, s.SentDate AS createdAt, s.RecipientNumber,
                   p.Prenom, p.NomDeFamille, p.NumeroTel, 'sent' AS type
            FROM SentSMS s
            LEFT JOIN Participants p ON s.ParticipantId = p.Id
        `);

        // Get all received messages
        const [receivedMessages] = await pool.query(`
            SELECT r.Id, r.ParticipantId, r.Message, 'succès' AS Statut, r.ReceivedDate AS createdAt,
                   p.Prenom, p.NomDeFamille, p.NumeroTel, r.SenderNumber, r.IsRead,
                   'received' AS type
            FROM ReceivedSMS r
            LEFT JOIN Participants p ON r.ParticipantId = p.Id
        `);

        // Format all messages with standardized phone numbers
        const allMessages = [...sentMessages, ...receivedMessages]
            .map(msg => ({
                ...msg,
                NumeroTel: msg.NumeroTel ? formatPhoneForDisplay(msg.NumeroTel) : null,
                SenderNumber: msg.SenderNumber ? formatPhoneForDisplay(msg.SenderNumber) : null,
                RecipientNumber: msg.RecipientNumber ? formatPhoneForDisplay(msg.RecipientNumber) : null
            }))
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        res.json(allMessages);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/add-received-sms', verifyToken, async (req, res) => {
    try {
        const { ParticipantId, Message, SenderNumber } = req.body;
        if (!ParticipantId || !Message) {
            return res.status(400).json({ error: 'ParticipantId et Message requis' });
        }
        const [result] = await pool.query(
            'INSERT INTO ReceivedSMS (ParticipantId, Message, SenderNumber, IsRead, ReceivedDate) VALUES (?, ?, ?, 0, NOW())',
            [ParticipantId, Message, SenderNumber || null]
        );
        const messageId = result.insertId;
        io.emit('new-sms', { Id: messageId, ParticipantId, Message, SenderNumber });
        res.json({ success: true, message: 'SMS enregistré' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Pixel SMS Sync Endpoints
const pixelSync = new PixelSMSSync(pool);

app.get('/pixel/device-status', verifyToken, async (req, res) => {
    try {
        const connected = await pixelSync.checkDeviceConnection();
        res.json({ 
            connected, 
            message: connected ? 'Pixel 2 connecté' : 'Pixel 2 non détecté'
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/pixel/sync-sms', verifyToken, async (req, res) => {
    try {
        logger.info('SMS synchronization initiated', { username: req.username });
        const result = await pixelSync.syncSMSToDatabase();
        
        // Émettre un événement pour notifier les clients connectés
        io.emit('sms-sync-complete', result);
        
        logger.info('SMS synchronization completed', { inserted: result.inserted, skipped: result.skipped, errors: result.errors, username: req.username });
        
        res.json({
            success: true,
            message: `Synchronisation complète: ${result.inserted} importés, ${result.skipped} existants, ${result.errors} erreurs`,
            ...result
        });
    } catch (err) {
        logger.error('SMS synchronization failed', { error: err.message, username: req.username });
        res.status(500).json({ error: err.message });
    }
});

app.post('/pixel/sync-unread-only', verifyToken, async (req, res) => {
    try {
        logger.info('Unread SMS synchronization initiated', { username: req.username });
        const result = await pixelSync.syncUnreadOnly();
        
        // Émettre un événement pour notifier les clients connectés
        io.emit('sms-sync-complete', result);
        
        logger.info('Unread SMS synchronization completed', { inserted: result.inserted, skipped: result.skipped, username: req.username });
        
        res.json({
            success: true,
            message: `${result.inserted} SMS non lus importés, ${result.skipped} existants`,
            ...result
        });
    } catch (err) {
        logger.error('Unread SMS synchronization failed', { error: err.message, username: req.username });
        res.status(500).json({ error: err.message });
    }
});

// Webhook endpoint for incoming SMS from Pixel SMS Gateway
// If PIXEL_WEBHOOK_SECRET is set in .env, the gateway must include it in header 'x-pixel-webhook-secret'
app.post('/pixel/incoming', async (req, res) => {
    try {
        const secret = process.env.PIXEL_WEBHOOK_SECRET;
        if (secret) {
            const header = req.headers['x-pixel-webhook-secret'];
            if (!header || header !== secret) {
                return res.status(401).json({ error: 'Invalid webhook secret' });
            }
        }

        const payload = req.body;
        const items = Array.isArray(payload) ? payload : [payload];
        let inserted = 0;
        let skipped = 0;
        const errors = [];

        logger.info('Webhook received', { itemCount: items.length });

        for (const item of items) {
            // Handle nested payload structure (some devices wrap SMS in a 'payload' object)
            const smsData = item.payload || item;
            
            // Extract messageId for duplicate detection
            const messageId = smsData.messageId || item.id || null;
            
            // Flexible extraction
            const sender = smsData.phoneNumber || smsData.from || smsData.sender || smsData.address || smsData.number || (smsData.recipients && smsData.recipients[0] && smsData.recipients[0].phoneNumber);
            let body = smsData.message || smsData.body || smsData.text || smsData.content || null;
            if (!body && Array.isArray(smsData.parts)) body = smsData.parts.map(p => p.body || p.text || p.message || '').filter(Boolean).join('');
            if (!body && smsData.payload && typeof smsData.payload === 'string') body = smsData.payload;
            const timestamp = smsData.receivedAt || smsData.timestamp || smsData.date || smsData.time || smsData.receivedAt || (smsData.states && smsData.states.Delivered) || null;

            if (!sender || !body) {
                skipped++;
                logger.warn('Webhook SMS ignored', { sender, hasBody: !!body });
                continue;
            }

            // Clean the incoming phone number: remove all non-digits, take last 10
            const cleaned = (sender || '').replace(/\D/g, '').slice(-10);
            logger.info('Webhook SMS received', { originalSender: sender, cleanedPhone: cleaned, hasMessageId: !!messageId });
            
            // Query to find participant by cleaning the database phone number too
            const [rows] = await pool.query(`
                SELECT Id, NumeroTel FROM Participants 
                WHERE REPLACE(REPLACE(REPLACE(REPLACE(NumeroTel, '(', ''), ')', ''), ' ', ''), '-', '') LIKE CONCAT('%', ?)
                LIMIT 1
            `, [cleaned]);
            
            if (rows.length === 0) {
                logger.info('Webhook SMS participant not found', { cleanedPhone: cleaned });
            } else {
                logger.info('Webhook SMS participant found', { participantId: rows[0].Id, numeroTel: rows[0].NumeroTel });
            }
            
            const participantId = rows.length > 0 ? rows[0].Id : null;

            // Check for duplicates using messageId (unique per SMS on device)
            // Store messageId in a simple in-memory cache to deduplicate within the same second
            if (!global.recentMessageIds) global.recentMessageIds = {};
            
            if (messageId && global.recentMessageIds[messageId]) {
                skipped++;
                logger.warn('Webhook SMS duplicate ignored', { messageId, sender });
                continue;
            }
            
            if (messageId) {
                global.recentMessageIds[messageId] = true;
                // Clear old entries after 30 seconds to prevent memory leak
                setTimeout(() => delete global.recentMessageIds[messageId], 30000);
            }

            const smsDate = timestamp ? new Date(timestamp) : new Date();

            // Insert SMS even if participant not found (ParticipantId will be NULL)
            const [result] = await pool.query(
                'INSERT INTO ReceivedSMS (ParticipantId, Message, SenderNumber, IsRead, ReceivedDate) VALUES (?, ?, ?, 0, ?)',
                [participantId, body, sender, smsDate]
            );
            
            const smsInsertedId = result.insertId;
            io.emit('new-sms', { Id: smsInsertedId, ParticipantId: participantId, Message: body, SenderNumber: sender });
            logger.info('Webhook SMS inserted', { smsId: smsInsertedId, participantId, sender, messageLength: body?.length });
            inserted++;
        }

        logger.info('Webhook processing completed', { inserted, skipped, errors: errors.length });
        res.json({ success: true, inserted, skipped, errors });
    } catch (err) {
        logger.error('Webhook processing failed', { error: err.message });
        res.status(500).json({ error: err.message });
    }
});

// Socket.io handlers for WebSocket communication
io.on('connection', (socket) => {
    logger.info('Socket.io client connected', { socketId: socket.id });

    // Handle quick SMS sending via WebSocket
    socket.on('send-sms-quick', async (data) => {
        try {
            const { message, phone, safeId, callbackId, participantId } = data;
            
            logger.info('WebSocket: send-sms-quick received', { phone, participantId, messageLength: message?.length });
            
            if (!message || !phone) {
                logger.warn('WebSocket: send-sms-quick - Missing parameters', { hasMessage: !!message, hasPhone: !!phone });
                return socket.emit('sms-sent', {
                    success: false,
                    phone: phone,
                    callbackId: callbackId,
                    error: 'Message ou numéro manquant'
                });
            }

            // Formater le numéro de téléphone
            let finalPhone = (phone || "").trim();
            if (!finalPhone.startsWith('+')) {
                finalPhone = '+1' + finalPhone.replace(/\D/g, '');
            }

            // Rechercher le ParticipantId par le numéro de téléphone (si non fourni)
            let resolvedParticipantId = participantId || null;
            if (!resolvedParticipantId) {
                try {
                    // Nettoyer le numéro en supprimant tous les caractères non-numériques
                    const cleanedPhone = phone.replace(/\D/g, '');
                    // Prendre les 10 derniers chiffres (numéro sans indicatif international)
                    const last10Digits = cleanedPhone.slice(-10);
                    
                    const [participantRows] = await pool.query(
                        'SELECT Id, NumeroTel FROM Participants WHERE RIGHT(REPLACE(REPLACE(REPLACE(REPLACE(NumeroTel, "-", ""), "(", ""), ")", ""), " ", ""), 10) = ?',
                        [last10Digits]
                    );
                    
                    if (participantRows.length > 0) {
                        resolvedParticipantId = participantRows[0].Id;
                        logger.info('Participant found by phone', { phone: last10Digits, participantId: resolvedParticipantId });
                    } else {
                        logger.warn('Participant not found', { phone: last10Digits });
                    }
                } catch (searchErr) {
                    logger.error('Error searching participant', { phone, error: searchErr.message });
                }
            } else {
                logger.info('ParticipantId provided', { participantId: resolvedParticipantId });
            }

            const targetUrl = `http://${process.env.PIXEL_IP}:${process.env.PIXEL_PORT}/messages`;
            let statut = 'succès';
            let erreur = null;

            try {
                // Envoyer via Pixel API
                const response = await axios.post(targetUrl, {
                    phoneNumbers: [finalPhone],
                    textMessage: { text: message }
                }, { 
                    auth: { username: process.env.PIXEL_USER, password: process.env.PIXEL_PASS },
                    timeout: 15000 
                });
                
                logger.info('SMS sent successfully', { phone: finalPhone, responseStatus: response.status });
            } catch (apiErr) {
                statut = 'échec';
                erreur = apiErr.message;
                logger.error('SMS send failed', { phone: finalPhone, error: erreur });
            }

            // Insérer dans SentSMS avec ParticipantId
            try {
                const [result] = await pool.query(
                    'INSERT INTO SentSMS (ParticipantId, Message, RecipientNumber, Statut, SentDate) VALUES (?, ?, ?, ?, NOW())',
                    [resolvedParticipantId, message, phone, statut]
                );
                logger.info('SMS inserted in database', { insertId: result.insertId, participantId: resolvedParticipantId, status: statut });
            } catch (dbErr) {
                logger.error('Database insert failed', { error: dbErr.message });
            }

            // Répondre avec le message envoyé pour l'ajouter à la conversation (pas de events globaux progress/finish)
            socket.emit('sms-sent', {
                success: statut === 'succès',
                phone: phone,
                callbackId: callbackId,
                Message: message,
                Statut: statut,
                SentDate: new Date().toISOString(),
                ParticipantId: resolvedParticipantId,
                error: erreur
            });
        } catch (err) {
            logger.error('WebSocket send-sms-quick error', { error: err.message, callbackId: data?.callbackId });
            socket.emit('sms-sent', {
                success: false,
                callbackId: data?.callbackId,
                error: err.message
            });
        }
    });

    // Handle bulk SMS sending via WebSocket
    socket.on('bulk-sms', async (data) => {
        try {
            const { recipients, message, callbackId } = data;
            
            logger.info('WebSocket bulk SMS initiated', { socketId: socket.id, recipientCount: recipients.length, callbackId });
            
            if (!message || !recipients || recipients.length === 0) {
                return socket.emit('bulk-sms-response', {
                    success: false,
                    callbackId: callbackId,
                    error: 'Message ou destinataires manquants'
                });
            }

            const targetUrl = `http://${process.env.PIXEL_IP}:${process.env.PIXEL_PORT}/messages`;
            let successCount = 0;
            let failCount = 0;
            const errors = [];

            // Envoyer à chaque destinataire
            for (const recipientId of recipients) {
                try {
                    // Récupérer le numéro du participant
                    const [rows] = await pool.query(
                        'SELECT NumeroTel FROM Participants WHERE Id = ?',
                        [recipientId]
                    );
                    
                    if (rows.length === 0) {
                        failCount++;
                        errors.push(`Participant ${recipientId}: non trouvé`);
                        continue;
                    }
                    
                    let phone = rows[0].NumeroTel;
                    if (!phone.startsWith('+')) {
                        phone = '+1' + phone.replace(/\D/g, '');
                    }
                    
                    // Envoyer via Pixel API
                    try {
                        await axios.post(targetUrl, {
                            phoneNumbers: [phone],
                            textMessage: { text: message }
                        }, { 
                            auth: { username: process.env.PIXEL_USER, password: process.env.PIXEL_PASS },
                            timeout: 15000 
                        });
                        
                        logger.info('Bulk SMS sent via WebSocket', { phone, participantId: recipientId });
                        successCount++;
                    } catch (apiErr) {
                        failCount++;
                        errors.push(`${phone}: ${apiErr.message}`);
                        logger.error('Bulk SMS send failed via WebSocket', { phone, participantId: recipientId, error: apiErr.message });
                    }
                    
                    // Insérer dans SentSMS
                    try {
                        const status = successCount > failCount ? 'succès' : 'échec';
                        await pool.query(
                            'INSERT INTO SentSMS (ParticipantId, Message, RecipientNumber, Statut, SentDate) VALUES (?, ?, ?, ?, NOW())',
                            [recipientId, message, phone, status]
                        );
                        logger.info('Bulk SMS database insert', { participantId: recipientId, phone, status });
                    } catch (dbErr) {
                        logger.error('Bulk SMS database insert failed', { participantId: recipientId, phone, error: dbErr.message });
                    }
                    
                } catch (err) {
                    failCount++;
                    errors.push(`Participant ${recipientId}: ${err.message}`);
                    logger.error('Bulk SMS processing error', { participantId: recipientId, error: err.message });
                }
            }

            logger.info('Bulk SMS processing completed', { successCount, failCount, totalRecipients: recipients.length });
            
            // Répondre avec le résumé
            socket.emit('bulk-sms-response', {
                success: failCount === 0,
                callbackId: callbackId,
                successCount: successCount,
                failCount: failCount,
                total: recipients.length,
                errors: errors.length > 0 ? errors : undefined
            });
        } catch (err) {
            logger.error('Bulk SMS error', { error: err.message, callbackId: data?.callbackId });
            socket.emit('bulk-sms-response', {
                success: false,
                callbackId: data?.callbackId,
                error: err.message
            });
        }
    });

    socket.on('disconnect', () => {
        logger.info('Socket.io client disconnected', { socketId: socket.id });
    });
});

server.listen(3000, '0.0.0.0', () => logger.info('Server started', { port: 3000, host: '0.0.0.0' }));