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

const monitoringState = {
    maxLogs: 2000,
    maxBuckets: 360,
    logs: [],
    totals: {
        incoming: 0,
        outgoing: 0,
        success: 0,
        error: 0,
        skipped: 0
    },
    buckets: new Map()
};

const recentBulkReports = new Map();
const MAX_RECENT_BULK_REPORTS = 500;
const BULK_REPORT_TTL_MS = 24 * 60 * 60 * 1000;

function pruneBulkReports() {
    const now = Date.now();

    for (const [callbackId, report] of recentBulkReports.entries()) {
        const completedAtMs = report?.completedAt ? Date.parse(report.completedAt) : NaN;
        const storedAtMs = report?.storedAt ? Date.parse(report.storedAt) : NaN;
        const referenceMs = Number.isFinite(completedAtMs)
            ? completedAtMs
            : (Number.isFinite(storedAtMs) ? storedAtMs : now);

        if ((now - referenceMs) > BULK_REPORT_TTL_MS) {
            recentBulkReports.delete(callbackId);
        }
    }

    while (recentBulkReports.size > MAX_RECENT_BULK_REPORTS) {
        const oldestKey = recentBulkReports.keys().next().value;
        if (!oldestKey) break;
        recentBulkReports.delete(oldestKey);
    }
}

function storeBulkReport(report) {
    if (!report || typeof report !== 'object') return;

    const callbackId = String(report.callbackId || '').trim();
    if (!callbackId) return;

    recentBulkReports.set(callbackId, {
        ...report,
        storedAt: new Date().toISOString()
    });

    pruneBulkReports();
}

function getBulkReport(callbackId) {
    const key = String(callbackId || '').trim();
    if (!key) return null;

    pruneBulkReports();
    return recentBulkReports.get(key) || null;
}

function getMinuteBucketKey(date = new Date()) {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    const hour = String(date.getUTCHours()).padStart(2, '0');
    const minute = String(date.getUTCMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hour}:${minute}`;
}

function getOrCreateMonitoringBucket(bucketKey) {
    if (!monitoringState.buckets.has(bucketKey)) {
        monitoringState.buckets.set(bucketKey, {
            incoming: 0,
            outgoing: 0,
            success: 0,
            error: 0,
            skipped: 0
        });
    }
    return monitoringState.buckets.get(bucketKey);
}

function pruneMonitoringBuckets() {
    if (monitoringState.buckets.size <= monitoringState.maxBuckets) return;
    const sortedKeys = Array.from(monitoringState.buckets.keys()).sort();
    const removeCount = monitoringState.buckets.size - monitoringState.maxBuckets;
    for (let i = 0; i < removeCount; i++) {
        monitoringState.buckets.delete(sortedKeys[i]);
    }
}

function incrementMonitoringMetric(metricKey, bucketKey) {
    if (!Object.prototype.hasOwnProperty.call(monitoringState.totals, metricKey)) return;
    monitoringState.totals[metricKey] += 1;
    const bucket = getOrCreateMonitoringBucket(bucketKey);
    bucket[metricKey] += 1;
}

function buildMonitoringSummary(windowMinutes = 60) {
    const minutes = Math.max(Number(windowMinutes) || 60, 1);
    const now = new Date();
    const easternTimeFormatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/New_York',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
    const labels = [];
    const incoming = [];
    const outgoing = [];
    const success = [];
    const error = [];
    const skipped = [];

    for (let i = minutes - 1; i >= 0; i--) {
        const d = new Date(now.getTime() - (i * 60 * 1000));
        const bucketKey = getMinuteBucketKey(d);
        const bucket = monitoringState.buckets.get(bucketKey) || {
            incoming: 0,
            outgoing: 0,
            success: 0,
            error: 0,
            skipped: 0
        };

        labels.push(easternTimeFormatter.format(d));
        incoming.push(bucket.incoming);
        outgoing.push(bucket.outgoing);
        success.push(bucket.success);
        error.push(bucket.error);
        skipped.push(bucket.skipped);
    }

    return {
        totals: {
            incoming: monitoringState.totals.incoming,
            outgoing: monitoringState.totals.outgoing,
            success: monitoringState.totals.success,
            error: monitoringState.totals.error,
            skipped: monitoringState.totals.skipped
        },
        chart: {
            labels,
            incoming,
            outgoing,
            success,
            error,
            skipped
        },
        logsCount: monitoringState.logs.length,
        updatedAt: new Date().toISOString()
    };
}

function recordMonitoringLog(level, baseMessage, fullMessage, date = new Date()) {
    const entry = {
        level,
        timestamp: Math.floor(date.getTime() / 1000),
        date: formatDateEastern(date),
        message: fullMessage,
        baseMessage: String(baseMessage || '')
    };

    monitoringState.logs.push(entry);
    if (monitoringState.logs.length > monitoringState.maxLogs) {
        monitoringState.logs.splice(0, monitoringState.logs.length - monitoringState.maxLogs);
    }

    const bucketKey = getMinuteBucketKey(date);
    const lower = String(baseMessage || '').toLowerCase();

    if (lower.includes('webhook sms inserted')) {
        incrementMonitoringMetric('incoming', bucketKey);
    }

    if (lower.includes('bulk sms sent via websocket') || lower.includes('rest: sms sent successfully') || lower === 'sms sent successfully') {
        incrementMonitoringMetric('outgoing', bucketKey);
        incrementMonitoringMetric('success', bucketKey);
    }

    if (lower.includes('bulk sms skipped duplicate success')) {
        incrementMonitoringMetric('skipped', bucketKey);
    }

    if (level === 'ERROR' || lower.includes(' send failed') || lower.includes(' processing error') || lower.includes(' bulk sms error')) {
        incrementMonitoringMetric('error', bucketKey);
    }

    pruneMonitoringBuckets();

    try {
        io.emit('monitoring-log', entry);
        io.emit('monitoring-summary', buildMonitoringSummary(60));
    } catch (_) {
        // ignore realtime emit issues for monitoring stream
    }

    return entry;
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
        recordMonitoringLog('INFO', message, fullMessage, now);
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
        recordMonitoringLog('ERROR', message, fullMessage, now);
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
        recordMonitoringLog('WARN', message, fullMessage, now);
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
 * Resolve Pixel send status from HTTP response + payload
 */
function resolvePixelSendStatus(response) {
    const httpAccepted = response?.status >= 200 && response?.status < 300;
    const payloadStatus = String(response?.data?.status || '').toLowerCase();
    const payloadText = JSON.stringify(response?.data || {}).toLowerCase();
    const queueLimitFailure = payloadText.includes('result_error_limit_exceeded')
        || payloadText.includes('limit_exceeded')
        || payloadText.includes('sending queue limit')
        || payloadText.includes('queue limit');
    const explicitFailure = response?.data?.success === false
        || ['error', 'erreur', 'failed', 'failure', 'ko'].includes(payloadStatus)
        || queueLimitFailure;
    return httpAccepted && !explicitFailure ? 'succès' : 'erreur';
}

function isQueueLimitError(input) {
    const responsePayload = input?.response?.data;
    const directPayload = input?.data;
    const messageText = String(input?.message || '').toLowerCase();
    const combined = `${JSON.stringify(responsePayload || {})} ${JSON.stringify(directPayload || {})} ${messageText}`.toLowerCase();

    return combined.includes('result_error_limit_exceeded')
        || combined.includes('limit_exceeded')
        || combined.includes('sending queue limit')
        || combined.includes('queue limit');
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

const waitMs = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const isRetryableDbLockError = (err) => {
    const code = String(err?.code || '');
    const errno = Number(err?.errno);
    return code === 'ER_LOCK_WAIT_TIMEOUT'
        || code === 'ER_LOCK_DEADLOCK'
        || errno === 1205
        || errno === 1213;
};

async function executePoolQueryWithRetry(sql, params = [], options = {}) {
    const maxAttempts = Math.max(Number(options.maxAttempts || 3), 1);
    const baseDelayMs = Math.max(Number(options.baseDelayMs || 150), 50);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await pool.query(sql, params);
        } catch (err) {
            const retryable = isRetryableDbLockError(err);
            if (!retryable || attempt >= maxAttempts) {
                throw err;
            }

            const jitter = Math.floor(Math.random() * 100);
            const delay = baseDelayMs * attempt + jitter;
            logger.warn('Retrying query after lock error', {
                attempt,
                maxAttempts,
                code: err.code,
                errno: err.errno,
                delayMs: delay
            });
            await waitMs(delay);
        }
    }
}

const BULK_SMS_DELAY_MS = Math.max(parseInt(process.env.BULK_SMS_DELAY_MS || '5000', 10) || 5000, 5000);
const BULK_SMS_DEDUP_ENABLED = String(process.env.BULK_SMS_DEDUP_ENABLED || 'true').toLowerCase() !== 'false';
const BULK_SMS_DEDUP_LOOKBACK_HOURS = Math.max(parseInt(process.env.BULK_SMS_DEDUP_LOOKBACK_HOURS || '168', 10) || 168, 1);
const SCHEDULED_JOBS_POLL_MS = Math.max(parseInt(process.env.SCHEDULED_JOBS_POLL_MS || '15000', 10) || 15000, 5000);
const MONTREAL_TZ = 'America/Toronto';

function formatDateTimeUtc(date = new Date()) {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    const hour = String(date.getUTCHours()).padStart(2, '0');
    const minute = String(date.getUTCMinutes()).padStart(2, '0');
    const second = String(date.getUTCSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

function parseMontrealLocalToUtc(localDateTime) {
    const raw = String(localDateTime || '').trim();
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (!match) return null;

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const hour = Number(match[4]);
    const minute = Number(match[5]);
    const second = Number(match[6] || 0);

    const targetUtcParts = Date.UTC(year, month - 1, day, hour, minute, second);
    let guessMs = targetUtcParts;

    const dtf = new Intl.DateTimeFormat('en-CA', {
        timeZone: MONTREAL_TZ,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });

    for (let i = 0; i < 4; i++) {
        const parts = dtf.formatToParts(new Date(guessMs)).reduce((acc, part) => {
            acc[part.type] = part.value;
            return acc;
        }, {});

        const shownAsUtc = Date.UTC(
            Number(parts.year),
            Number(parts.month) - 1,
            Number(parts.day),
            Number(parts.hour),
            Number(parts.minute),
            Number(parts.second)
        );

        const diff = targetUtcParts - shownAsUtc;
        if (diff === 0) break;
        guessMs += diff;
    }

    return new Date(guessMs);
}

function normalizePhone10(phone) {
    return normalizePhone(phone);
}

function toE164From10(phone10) {
    const n = normalizePhone10(phone10);
    return n && n.length === 10 ? `+1${n}` : '';
}

async function sendPixelSms(phone10OrE164, message) {
    let finalPhone = String(phone10OrE164 || '').trim();
    if (!finalPhone.startsWith('+')) {
        finalPhone = toE164From10(finalPhone);
    }

    if (!finalPhone) {
        throw new Error('Numéro invalide pour envoi Pixel');
    }

    const response = await axios.post(
        `http://${process.env.PIXEL_IP}:${process.env.PIXEL_PORT}/messages`,
        { phoneNumbers: [finalPhone], textMessage: { text: message } },
        {
            auth: { username: process.env.PIXEL_USER, password: process.env.PIXEL_PASS },
            timeout: 15000
        }
    );

    return {
        finalPhone,
        status: resolvePixelSendStatus(response),
        response
    };
}

async function hasRecentSuccessfulBulkSend(participantId, phoneE164, message) {
    if (!BULK_SMS_DEDUP_ENABLED) return false;

    const normalizedMessage = String(message || '').trim();
    if (!normalizedMessage) return false;

    if (participantId != null) {
        const [rows] = await pool.query(
            `SELECT Id
             FROM SentSMS
             WHERE ParticipantId = ?
                             AND BINARY Message = BINARY ?
               AND Statut = 'succès'
               AND SentDate >= DATE_SUB(NOW(), INTERVAL ? HOUR)
             ORDER BY Id DESC
             LIMIT 1`,
            [participantId, normalizedMessage, BULK_SMS_DEDUP_LOOKBACK_HOURS]
        );

        if (rows.length > 0) {
            return true;
        }
    }

    const normalizedPhone = normalizePhone10(phoneE164);
    if (!normalizedPhone) return false;

    const [rows] = await pool.query(
        `SELECT Id
         FROM SentSMS
                 WHERE BINARY Message = BINARY ?
           AND Statut = 'succès'
           AND SentDate >= DATE_SUB(NOW(), INTERVAL ? HOUR)
           AND RIGHT(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(RecipientNumber, '-', ''), '(', ''), ')', ''), ' ', ''), '+', ''), 10) = ?
         ORDER BY Id DESC
         LIMIT 1`,
        [normalizedMessage, BULK_SMS_DEDUP_LOOKBACK_HOURS, normalizedPhone]
    );

    return rows.length > 0;
}

let statsEnvoi = { total: 0, actuel: 0, enCours: false, details: {} };
let scheduledJobsTimer = null;
let scheduledJobsInProgress = false;
const schedulingSchema = {
    distributionMemberPhoneColumn: 'PhoneNumber',
    distributionMemberNameColumn: 'DisplayName',
    distributionMemberRawPhoneColumn: null,
    distributionMemberNormalizedPhoneColumn: null,
    distributionListCreatedByColumn: null,
    scheduledJobNameColumn: null,
    scheduledJobMessageTemplateColumn: null,
    scheduledJobLocalDateTimeColumn: null,
    scheduledJobLegacyUtcColumn: null,
    scheduledJobRecurrenceTypeColumn: null,
    scheduledJobRecurrenceIntervalColumn: null,
    scheduledJobRecurrenceUntilUtcColumn: null,
    scheduledJobRecurrenceCountMaxColumn: null,
    scheduledJobRecurrenceCountDoneColumn: null,
    scheduledRecipientPhoneColumn: null,
    scheduledRecipientNameColumn: 'DisplayName',
    scheduledRecipientRawPhoneColumn: null,
    scheduledRecipientNormalizedPhoneColumn: null,
    scheduledRecipientStatusColumn: null,
    scheduledRecipientErrorColumn: null,
    scheduledRecipientSentAtColumn: null,
    scheduledRunJobIdColumn: 'JobId',
    scheduledRunTriggeredByColumn: 'TriggeredBy',
    scheduledRunSummaryColumn: null,
    scheduledRunTotalRecipientsColumn: 'TotalRecipients',
    scheduledRunSuccessCountColumn: 'SuccessCount',
    scheduledRunFailedCountColumn: 'FailedCount',
    scheduledRunStartedAtColumn: 'StartedAt',
    scheduledRunCompletedAtColumn: 'CompletedAt',
    scheduledJobStatusAdapter: null,
    scheduledRecipientStatusAdapter: null
};

const RECURRENCE_TYPES = new Set(['none', 'minutely', 'hourly', 'daily', 'weekly', 'monthly']);

function parseEnumOptions(columnType = '') {
    const options = [];
    const regex = /'((?:''|[^'])*)'/g;
    let match;
    while ((match = regex.exec(String(columnType)))) {
        options.push(match[1].replace(/''/g, "'"));
    }
    return options;
}

function pickEnumValue(enumValues, preferredValues, fallbackIndex = 0) {
    const normalizedEnum = enumValues.map(value => String(value).toLowerCase());
    for (const preferred of preferredValues) {
        const idx = normalizedEnum.indexOf(String(preferred).toLowerCase());
        if (idx >= 0) return enumValues[idx];
    }
    return enumValues[fallbackIndex] ?? enumValues[0] ?? null;
}

function truncateStatusValue(value, maxLength) {
    const text = String(value ?? '');
    if (!maxLength || maxLength <= 0) return text;
    return text.slice(0, maxLength);
}

async function buildStatusAdapter(tableName, columnName, type) {
    const [rows] = await pool.query(
        `SELECT DATA_TYPE, COLUMN_TYPE, CHARACTER_MAXIMUM_LENGTH, COLUMN_DEFAULT
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = ?
           AND COLUMN_NAME = ?
         LIMIT 1`,
        [tableName, columnName]
    );

    if (!rows.length) {
        if (type === 'job') {
            return { pending: 'pending', running: 'running', completed: 'completed', failed: 'failed', cancelled: 'cancelled' };
        }
        return { pending: 'pending', success: 'success', failed: 'failed' };
    }

    const meta = rows[0];
    const dataType = String(meta.DATA_TYPE || '').toLowerCase();
    const columnType = String(meta.COLUMN_TYPE || '').toLowerCase();
    const maxLength = Number(meta.CHARACTER_MAXIMUM_LENGTH || 0);
    const defaultValue = meta.COLUMN_DEFAULT;

    if (['tinyint', 'smallint', 'int', 'bigint', 'decimal'].includes(dataType)) {
        const base = Number(defaultValue ?? 0);
        if (type === 'job') {
            return { pending: base, running: base + 1, completed: base + 2, failed: base + 3, cancelled: base + 4 };
        }
        return { pending: base, success: base + 1, failed: base + 2 };
    }

    if (columnType.startsWith('enum(')) {
        const enumValues = parseEnumOptions(meta.COLUMN_TYPE);
        if (type === 'job') {
            const pending = pickEnumValue(enumValues, ['pending', 'planifie', 'scheduled', 'en_attente', 'queued'], 0);
            const running = pickEnumValue(enumValues, ['running', 'in_progress', 'processing', 'en_cours'], 1);
            const completed = pickEnumValue(enumValues, ['completed', 'done', 'success', 'termine'], 2);
            const failed = pickEnumValue(enumValues, ['failed', 'error', 'ko', 'echec'], 3);
            const cancelled = pickEnumValue(enumValues, ['cancelled', 'canceled', 'annule'], 4);
            return { pending, running, completed, failed, cancelled: cancelled || failed || pending };
        }

        const pending = pickEnumValue(enumValues, ['pending', 'queued', 'en_attente'], 0);
        const success = pickEnumValue(enumValues, ['success', 'sent', 'completed', 'done', 'ok'], 1);
        const failed = pickEnumValue(enumValues, ['failed', 'error', 'ko', 'echec'], 2);
        return { pending, success: success || pending, failed: failed || pending };
    }

    if (type === 'job') {
        return {
            pending: truncateStatusValue(defaultValue ?? 'pending', maxLength || 20),
            running: truncateStatusValue('running', maxLength || 20),
            completed: truncateStatusValue('completed', maxLength || 20),
            failed: truncateStatusValue('failed', maxLength || 20),
            cancelled: truncateStatusValue('cancelled', maxLength || 20)
        };
    }

    return {
        pending: truncateStatusValue(defaultValue ?? 'pending', maxLength || 20),
        success: truncateStatusValue('success', maxLength || 20),
        failed: truncateStatusValue('failed', maxLength || 20)
    };
}

async function detectExistingColumn(tableName, candidates, fallback) {
    for (const column of candidates) {
        const [rows] = await pool.query(
            `SELECT 1
             FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = ?
               AND COLUMN_NAME = ?
             LIMIT 1`,
            [tableName, column]
        );

        if (rows.length > 0) {
            return column;
        }
    }

    return fallback;
}

async function ensureColumnExists(tableName, columnName, definitionSql) {
    const [rows] = await pool.query(
        `SELECT 1
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = ?
           AND COLUMN_NAME = ?
         LIMIT 1`,
        [tableName, columnName]
    );

    if (rows.length === 0) {
        await pool.query(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definitionSql}`);
    }
}

function normalizeRecurrenceType(value) {
    const normalized = String(value || 'none').trim().toLowerCase();
    return RECURRENCE_TYPES.has(normalized) ? normalized : 'none';
}

function normalizePositiveInt(value, fallback = 1, min = 1, max = 365) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    const integer = Math.trunc(parsed);
    if (integer < min) return min;
    if (integer > max) return max;
    return integer;
}

function parseUtcDateValue(value) {
    if (!value) return null;
    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value;
    }

    const raw = String(value).trim();
    if (!raw) return null;

    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw)) {
        const parsed = new Date(raw.replace(' ', 'T') + 'Z');
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(raw)) {
        const parsed = new Date(raw + 'Z');
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatUtcDateAsMontrealLocal(dateValue) {
    const date = parseUtcDateValue(dateValue);
    if (!date) return null;

    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: MONTREAL_TZ,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });

    const parts = formatter.formatToParts(date).reduce((acc, part) => {
        acc[part.type] = part.value;
        return acc;
    }, {});

    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
}

function addRecurrenceToLocalDateTime(localDateTime, recurrenceType, recurrenceInterval) {
    const raw = String(localDateTime || '').trim();
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (!match) return null;

    const year = Number(match[1]);
    const month = Number(match[2]) - 1;
    const day = Number(match[3]);
    const hour = Number(match[4]);
    const minute = Number(match[5]);
    const second = Number(match[6] || 0);
    const interval = normalizePositiveInt(recurrenceInterval, 1, 1, 365);
    const cursor = new Date(Date.UTC(year, month, day, hour, minute, second));

    if (recurrenceType === 'minutely') {
        cursor.setUTCMinutes(cursor.getUTCMinutes() + interval);
    } else if (recurrenceType === 'hourly') {
        cursor.setUTCHours(cursor.getUTCHours() + interval);
    } else if (recurrenceType === 'daily') {
        cursor.setUTCDate(cursor.getUTCDate() + interval);
    } else if (recurrenceType === 'weekly') {
        cursor.setUTCDate(cursor.getUTCDate() + (interval * 7));
    } else if (recurrenceType === 'monthly') {
        cursor.setUTCMonth(cursor.getUTCMonth() + interval);
    } else {
        return null;
    }

    const nextYear = cursor.getUTCFullYear();
    const nextMonth = String(cursor.getUTCMonth() + 1).padStart(2, '0');
    const nextDay = String(cursor.getUTCDate()).padStart(2, '0');
    const nextHour = String(cursor.getUTCHours()).padStart(2, '0');
    const nextMinute = String(cursor.getUTCMinutes()).padStart(2, '0');
    const nextSecond = String(cursor.getUTCSeconds()).padStart(2, '0');
    return `${nextYear}-${nextMonth}-${nextDay}T${nextHour}:${nextMinute}:${nextSecond}`;
}

function computeNextRecurringUtcFromJob(job) {
    const recurrenceType = normalizeRecurrenceType(job?.RecurrenceType);
    if (recurrenceType === 'none') return null;

    const currentLocal = formatUtcDateAsMontrealLocal(job?.SendAtUtc);
    if (!currentLocal) return null;

    const nextLocal = addRecurrenceToLocalDateTime(currentLocal, recurrenceType, job?.RecurrenceInterval || 1);
    if (!nextLocal) return null;

    return parseMontrealLocalToUtc(nextLocal);
}

async function refreshSchedulingSchemaCompatibilityMetadata() {
    schedulingSchema.distributionMemberPhoneColumn = await detectExistingColumn(
        'AdminDistributionListMembers',
        ['PhoneNumber', 'NumeroTel', 'Phone'],
        'PhoneNumber'
    );

    schedulingSchema.distributionMemberNameColumn = await detectExistingColumn(
        'AdminDistributionListMembers',
        ['DisplayName', 'Name', 'Nom'],
        'DisplayName'
    );

    schedulingSchema.distributionMemberRawPhoneColumn = await detectExistingColumn(
        'AdminDistributionListMembers',
        ['RawPhone', 'OriginalPhone', 'PhoneRaw'],
        null
    );

    schedulingSchema.distributionMemberNormalizedPhoneColumn = await detectExistingColumn(
        'AdminDistributionListMembers',
        ['NormalizedPhone', 'PhoneNormalized', 'NormalizedNumeroTel'],
        null
    );

    schedulingSchema.distributionListCreatedByColumn = await detectExistingColumn(
        'AdminDistributionLists',
        ['CreatedByUserId', 'CreatedBy', 'UserId'],
        null
    );

    schedulingSchema.scheduledJobNameColumn = await detectExistingColumn(
        'ScheduledSmsJobs',
        ['Name', 'JobName'],
        null
    );

    schedulingSchema.scheduledJobMessageTemplateColumn = await detectExistingColumn(
        'ScheduledSmsJobs',
        ['MessageTemplate', 'Template', 'SmsTemplate'],
        null
    );

    schedulingSchema.scheduledJobLocalDateTimeColumn = await detectExistingColumn(
        'ScheduledSmsJobs',
        ['ScheduledAtLocal', 'SendAtLocal', 'LocalScheduledAt'],
        null
    );

    schedulingSchema.scheduledJobLegacyUtcColumn = await detectExistingColumn(
        'ScheduledSmsJobs',
        ['ScheduledAtUtc', 'UtcScheduledAt', 'SendDateUtc'],
        null
    );

    schedulingSchema.scheduledJobRecurrenceTypeColumn = await detectExistingColumn(
        'ScheduledSmsJobs',
        ['RecurrenceType', 'RepeatType', 'FrequencyType'],
        null
    );

    schedulingSchema.scheduledJobRecurrenceIntervalColumn = await detectExistingColumn(
        'ScheduledSmsJobs',
        ['RecurrenceInterval', 'RepeatInterval', 'FrequencyInterval'],
        null
    );

    schedulingSchema.scheduledJobRecurrenceUntilUtcColumn = await detectExistingColumn(
        'ScheduledSmsJobs',
        ['RecurrenceUntilUtc', 'RepeatUntilUtc', 'RepeatUntil', 'RecurrenceEndUtc'],
        null
    );

    schedulingSchema.scheduledJobRecurrenceCountMaxColumn = await detectExistingColumn(
        'ScheduledSmsJobs',
        ['RecurrenceCountMax', 'RepeatCountMax', 'MaxOccurrences'],
        null
    );

    schedulingSchema.scheduledJobRecurrenceCountDoneColumn = await detectExistingColumn(
        'ScheduledSmsJobs',
        ['RecurrenceCountDone', 'RepeatCountDone', 'OccurrencesDone'],
        null
    );

    schedulingSchema.scheduledRecipientPhoneColumn = await detectExistingColumn(
        'ScheduledSmsJobRecipients',
        ['PhoneNumber', 'NumeroTel', 'Phone', 'RecipientNumber', 'ToNumber', 'DestinationNumber', 'NormalizedPhone', 'RawPhone'],
        null
    );

    schedulingSchema.scheduledRecipientNameColumn = await detectExistingColumn(
        'ScheduledSmsJobRecipients',
        ['DisplayName', 'Name', 'Nom'],
        null
    );

    schedulingSchema.scheduledRecipientRawPhoneColumn = await detectExistingColumn(
        'ScheduledSmsJobRecipients',
        ['RawPhone', 'OriginalPhone', 'PhoneRaw'],
        null
    );

    schedulingSchema.scheduledRecipientNormalizedPhoneColumn = await detectExistingColumn(
        'ScheduledSmsJobRecipients',
        ['NormalizedPhone', 'PhoneNormalized', 'NormalizedNumeroTel'],
        null
    );

    schedulingSchema.scheduledRecipientStatusColumn = await detectExistingColumn(
        'ScheduledSmsJobRecipients',
        ['Status', 'State', 'Statut'],
        null
    );

    schedulingSchema.scheduledRecipientErrorColumn = await detectExistingColumn(
        'ScheduledSmsJobRecipients',
        ['ErrorMessage', 'Error', 'Erreur'],
        null
    );

    schedulingSchema.scheduledRecipientSentAtColumn = await detectExistingColumn(
        'ScheduledSmsJobRecipients',
        ['SentAt', 'SentDate', 'SentOn', 'CompletedAt'],
        null
    );

    schedulingSchema.scheduledRunJobIdColumn = await detectExistingColumn(
        'ScheduledSmsJobRuns',
        ['JobId', 'ScheduledJobId', 'JobRefId'],
        'JobId'
    );

    schedulingSchema.scheduledRunTriggeredByColumn = await detectExistingColumn(
        'ScheduledSmsJobRuns',
        ['TriggeredBy', 'Source', 'ExecutionSource', 'RunBy'],
        null
    );

    schedulingSchema.scheduledRunSummaryColumn = await detectExistingColumn(
        'ScheduledSmsJobRuns',
        ['SummaryMessage', 'Summary', 'RunSummary', 'Message'],
        null
    );

    schedulingSchema.scheduledRunTotalRecipientsColumn = await detectExistingColumn(
        'ScheduledSmsJobRuns',
        ['TotalRecipients', 'RecipientsCount', 'Total'],
        null
    );

    schedulingSchema.scheduledRunSuccessCountColumn = await detectExistingColumn(
        'ScheduledSmsJobRuns',
        ['SuccessCount', 'Successes', 'SucceededCount'],
        null
    );

    schedulingSchema.scheduledRunFailedCountColumn = await detectExistingColumn(
        'ScheduledSmsJobRuns',
        ['FailedCount', 'Failures', 'ErrorCount'],
        null
    );

    schedulingSchema.scheduledRunStartedAtColumn = await detectExistingColumn(
        'ScheduledSmsJobRuns',
        ['StartedAt', 'StartedAtUtc', 'StartAt', 'StartAtUtc', 'RunStartedAt', 'RunStartedAtUtc', 'StartDate', 'StartDateUtc'],
        null
    );

    schedulingSchema.scheduledRunCompletedAtColumn = await detectExistingColumn(
        'ScheduledSmsJobRuns',
        ['CompletedAt', 'CompletedAtUtc', 'EndedAt', 'EndedAtUtc', 'RunCompletedAt', 'RunCompletedAtUtc', 'EndDate', 'EndDateUtc'],
        null
    );

    schedulingSchema.scheduledJobStatusAdapter = await buildStatusAdapter('ScheduledSmsJobs', 'Status', 'job');
    schedulingSchema.scheduledRecipientStatusAdapter = await buildStatusAdapter('ScheduledSmsJobRecipients', 'Status', 'recipient');

}

async function insertScheduledJobRun(runData) {
    const runJobIdColumn = schedulingSchema.scheduledRunJobIdColumn;
    if (!runJobIdColumn) {
        logger.warn('Scheduled run insert skipped: no jobId column detected');
        return;
    }

    const columnValues = new Map();
    columnValues.set(runJobIdColumn, runData.jobId);

    if (schedulingSchema.scheduledRunTriggeredByColumn) {
        columnValues.set(schedulingSchema.scheduledRunTriggeredByColumn, runData.triggeredBy);
    }
    if (schedulingSchema.scheduledRunSummaryColumn) {
        columnValues.set(schedulingSchema.scheduledRunSummaryColumn, runData.summaryMessage);
    }
    if (schedulingSchema.scheduledRunTotalRecipientsColumn) {
        columnValues.set(schedulingSchema.scheduledRunTotalRecipientsColumn, runData.totalRecipients);
    }
    if (schedulingSchema.scheduledRunSuccessCountColumn) {
        columnValues.set(schedulingSchema.scheduledRunSuccessCountColumn, runData.successCount);
    }
    if (schedulingSchema.scheduledRunFailedCountColumn) {
        columnValues.set(schedulingSchema.scheduledRunFailedCountColumn, runData.failedCount);
    }
    if (schedulingSchema.scheduledRunStartedAtColumn) {
        columnValues.set(schedulingSchema.scheduledRunStartedAtColumn, runData.runStart);
    }
    if (schedulingSchema.scheduledRunCompletedAtColumn) {
        columnValues.set(schedulingSchema.scheduledRunCompletedAtColumn, '__UTC_NOW__');
    }

    const insertColumns = [];
    const insertValues = [];
    const insertParams = [];
    for (const [column, value] of columnValues.entries()) {
        insertColumns.push(column);
        if (value === '__UTC_NOW__') {
            insertValues.push('UTC_TIMESTAMP()');
        } else {
            insertValues.push('?');
            insertParams.push(value);
        }
    }

    if (!insertColumns.length) return;

    await executePoolQueryWithRetry(
        `INSERT INTO ScheduledSmsJobRuns (${insertColumns.join(', ')}) VALUES (${insertValues.join(', ')})`,
        insertParams,
        { maxAttempts: 4, baseDelayMs: 160 }
    );
}

function getScheduledJobStatusValue(state) {
    const adapter = schedulingSchema.scheduledJobStatusAdapter || {};
    return adapter[state] ?? state;
}

function getScheduledRecipientStatusValue(state) {
    const adapter = schedulingSchema.scheduledRecipientStatusAdapter || {};
    return adapter[state] ?? state;
}

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

app.get('/bulk-queue-status', verifyToken, (req, res) => res.json(getBulkQueueSnapshot()));

app.get('/monitoring/summary', verifyToken, (req, res) => {
    const windowMinutes = Math.max(Math.min(parseInt(req.query.windowMinutes || '60', 10) || 60, 720), 5);
    res.json({ success: true, ...buildMonitoringSummary(windowMinutes) });
});

app.get('/monitoring/logs', verifyToken, (req, res) => {
    const limit = Math.max(Math.min(parseInt(req.query.limit || '200', 10) || 200, 1000), 10);
    const logs = monitoringState.logs.slice(-limit).reverse();
    res.json({ success: true, logs, total: monitoringState.logs.length, limit });
});

app.get('/bulk-sms-report/:callbackId', verifyToken, (req, res) => {
    const callbackId = String(req.params.callbackId || '').trim();
    if (!callbackId) {
        return res.status(400).json({ success: false, error: 'callbackId requis' });
    }

    const report = getBulkReport(callbackId);
    if (!report) {
        return res.json({ success: true, found: false, callbackId });
    }

    return res.json({ success: true, found: true, callbackId, report });
});

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
        const rawPhone = String(phone || '');
        const normalizedPhone = normalizePhone(rawPhone);
        const finalPhone = normalizedPhone ? `+1${normalizedPhone}` : '';
        
        logger.info('REST: send-sms-quick received', { phone: rawPhone, messageLength: message?.length });
        
        if (!message || !phone) {
            logger.warn('REST: send-sms-quick - Missing parameters', { hasMessage: !!message, hasPhone: !!phone });
            return res.status(400).json({ error: 'Message et numéro requis' });
        }

        if (normalizedPhone.length !== 10) {
            logger.warn('REST: send-sms-quick - Invalid phone format', { rawPhone, normalizedPhone });
            return res.status(400).json({ success: false, error: `Numéro invalide: ${rawPhone}` });
        }

        let resolvedParticipantId = null;
        try {
            const [participantRows] = await pool.query(
                'SELECT Id FROM Participants WHERE RIGHT(REPLACE(REPLACE(REPLACE(REPLACE(NumeroTel, "-", ""), "(", ""), ")", ""), " ", ""), 10) = ? LIMIT 1',
                [normalizedPhone]
            );
            if (participantRows.length > 0) {
                resolvedParticipantId = participantRows[0].Id;
            }
        } catch (lookupErr) {
            logger.warn('REST: participant lookup failed', { phone: rawPhone, error: lookupErr.message });
        }

        const alreadySent = await hasRecentSuccessfulBulkSend(resolvedParticipantId, finalPhone, message);
        if (alreadySent) {
            logger.warn('REST: SMS skipped duplicate success', {
                phone: rawPhone,
                finalPhone,
                participantId: resolvedParticipantId,
                lookbackHours: BULK_SMS_DEDUP_LOOKBACK_HOURS
            });

            io.emit('progress', { actuel: 1, total: 1, details: { [rawPhone]: 'ignoré' } });
            io.emit('finish');

            return res.json({
                success: true,
                skipped: true,
                status: 'ignoré',
                phone: rawPhone,
                normalizedPhone: finalPhone,
                participantId: resolvedParticipantId,
                reason: 'déjà envoyé récemment avec succès'
            });
        }

        // Émettre le début du progress
        io.emit('progress', { actuel: 0, total: 1, details: { [rawPhone]: 'envoi' } });

        try {
            // Envoyer via Pixel API
            const response = await axios.post(
                `http://${process.env.PIXEL_IP}:${process.env.PIXEL_PORT}/messages`,
                { phoneNumbers: [finalPhone], textMessage: { text: message } },
                { 
                    auth: { username: process.env.PIXEL_USER, password: process.env.PIXEL_PASS },
                    timeout: 15000 
                }
            );
            
            const status = resolvePixelSendStatus(response);
            logger.info('REST: SMS sent successfully', {
                phone: rawPhone,
                finalPhone,
                status,
                responseStatus: response.status,
                responsePayloadStatus: response.data?.status,
                responsePayloadSuccess: response.data?.success
            });

            if (status !== 'succès') {
                await pool.query(
                    'INSERT INTO SentSMS (ParticipantId, Message, RecipientNumber, Statut, SentDate) VALUES (?, ?, ?, ?, NOW())',
                    [resolvedParticipantId, message, finalPhone, 'erreur']
                );

                io.emit('progress', { actuel: 1, total: 1, details: { [rawPhone]: 'erreur' } });
                io.emit('finish');

                return res.json({
                    success: false,
                    error: `Échec d'envoi pour ${rawPhone}`,
                    status,
                    phone: rawPhone
                });
            }
            
            // Insérer dans SentSMS
            const [result] = await pool.query(
                'INSERT INTO SentSMS (ParticipantId, Message, RecipientNumber, Statut, SentDate) VALUES (?, ?, ?, ?, NOW())',
                [resolvedParticipantId, message, finalPhone, status]
            );
            
            const messageId = result.insertId;
            
            // Émettre le progress complété
            io.emit('progress', { actuel: 1, total: 1, details: { [rawPhone]: status } });
            
            // Émettre le finish
            io.emit('finish');
            
            // Émettre le nouveau message envoyé pour l'ajouter à la conversation
            io.emit('sms-sent', {
                Id: messageId,
                ParticipantId: resolvedParticipantId,
                Message: message,
                RecipientNumber: finalPhone,
                Statut: status,
                SentDate: new Date().toISOString(),
                type: 'sent'
            });
            
            res.json({ success: true, messageId, status, phone: rawPhone, normalizedPhone: finalPhone, participantId: resolvedParticipantId });
        } catch (apiErr) {
            logger.error('REST: SMS send failed', { phone: rawPhone, finalPhone, error: apiErr.message });
            
            // Insérer comme erreur
            await pool.query(
                'INSERT INTO SentSMS (ParticipantId, Message, RecipientNumber, Statut, SentDate) VALUES (?, ?, ?, ?, NOW())',
                [resolvedParticipantId, message, finalPhone, 'erreur']
            );
            
            io.emit('progress', { actuel: 1, total: 1, details: { [rawPhone]: 'erreur' } });
            io.emit('finish');
            
            res.json({ success: false, error: `Échec d'envoi pour ${rawPhone}: ${apiErr.message}`, phone: rawPhone });
        }
    } catch (err) {
        logger.error('REST: send-sms-quick error', { error: err.message });
        res.status(500).json({ error: err.message });
    }
});

app.post('/mark-all-sms-read', verifyToken, async (req, res) => {
    try {
        const [result] = await pool.query('UPDATE ReceivedSMS SET IsRead = 1, ReadDate = NOW() WHERE IsRead = 0 OR IsRead IS NULL');
        const affectedRows = result.affectedRows || 0;
        if (affectedRows > 0) {
            io.emit('conversation-read-updated', { all: true, affectedRows, userId: req.userId });
        }
        res.json({ success: true, affectedRows });
    } catch (err) {
        logger.error('Mark all SMS as read failed', { error: err.message, userId: req.userId });
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
        const { contactKey, sourceSocketId } = req.body;
        const key = String(contactKey || '');
        
        logger.info('Mark conversation as read', { contactKey: key, userId: req.userId });

        let affectedRows = 0;

        if (key.startsWith('participant_')) {
            const participantId = parseInt(key.replace('participant_', ''), 10);
            if (!Number.isNaN(participantId)) {
                const [participantRows] = await pool.query(
                    'SELECT NumeroTel FROM Participants WHERE Id = ? LIMIT 1',
                    [participantId]
                );
                const normalizedParticipantPhone = normalizePhone(participantRows?.[0]?.NumeroTel || '');

                const [result] = await pool.query(
                    `UPDATE ReceivedSMS
                     SET IsRead = 1, ReadDate = NOW()
                     WHERE (
                        ParticipantId = ?
                        OR (
                            ParticipantId IS NULL
                            AND ? <> ''
                            AND RIGHT(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(SenderNumber, '-', ''), '(', ''), ')', ''), ' ', ''), '+', ''), 10) = ?
                        )
                     )
                     AND (IsRead = 0 OR IsRead IS NULL)`,
                    [participantId, normalizedParticipantPhone, normalizedParticipantPhone]
                );
                affectedRows = result.affectedRows || 0;
                logger.info('Conversation marked as read by participant key', { participantId, normalizedParticipantPhone, affectedRows });
            }
        } else if (key.startsWith('unknown_')) {
            const normalizedUnknown = normalizePhone(key.replace('unknown_', ''));
            if (normalizedUnknown) {
                const [result] = await pool.query(
                    `UPDATE ReceivedSMS
                     SET IsRead = 1, ReadDate = NOW()
                     WHERE ParticipantId IS NULL
                                             AND (IsRead = 0 OR IsRead IS NULL)
                       AND RIGHT(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(SenderNumber, '-', ''), '(', ''), ')', ''), ' ', ''), '+', ''), 10) = ?`,
                    [normalizedUnknown]
                );
                affectedRows = result.affectedRows || 0;
                logger.info('Conversation marked as read by unknown key', { normalizedUnknown, affectedRows });
            }
        } else {
            // Legacy fallback behavior
            const isPhoneNumber = /[+\-()x ]/.test(key) || key > 1000000;
        
            if (!isPhoneNumber && !isNaN(key)) {
                const participantId = parseInt(key, 10);
                const [result] = await pool.query(
                    'UPDATE ReceivedSMS SET IsRead = 1, ReadDate = NOW() WHERE ParticipantId = ? AND (IsRead = 0 OR IsRead IS NULL)',
                    [participantId]
                );
                affectedRows = result.affectedRows || 0;
                logger.info('Conversation marked as read by ParticipantId', { participantId, affectedRows });
            } else {
                const normalizedContactKey = key.replace(/\D/g, '');

                const [participants] = await pool.query(
                    'SELECT Id FROM Participants WHERE REPLACE(REPLACE(REPLACE(REPLACE(NumeroTel, "-", ""), "(", ""), ")", ""), " ", "") = ?',
                    [normalizedContactKey]
                );

                if (participants.length > 0) {
                    const participantId = participants[0].Id;
                    const [result] = await pool.query(
                        'UPDATE ReceivedSMS SET IsRead = 1, ReadDate = NOW() WHERE ParticipantId = ? AND (IsRead = 0 OR IsRead IS NULL)',
                        [participantId]
                    );
                    affectedRows = result.affectedRows || 0;
                    logger.info('Conversation marked as read by phone', { phone: key, participantId, affectedRows });
                } else {
                    const [result] = await pool.query(
                        'UPDATE ReceivedSMS SET IsRead = 1, ReadDate = NOW() WHERE (SenderNumber = ? OR REPLACE(REPLACE(REPLACE(REPLACE(SenderNumber, "-", ""), "(", ""), ")", ""), " ", "") = ? OR REPLACE(REPLACE(REPLACE(REPLACE(SenderNumber, "-", ""), "(", ""), ")", ""), " ", "") = ? OR SenderNumber LIKE CONCAT("%", ?, "%")) AND (IsRead = 0 OR IsRead IS NULL)',
                        [key, normalizedContactKey, key.replace(/\D/g, ''), normalizedContactKey]
                    );
                    affectedRows = result.affectedRows || 0;
                    logger.info('Conversation marked as read for unknown sender', { phone: key, affectedRows });
                }
            }
        }
        
        if (affectedRows > 0) {
            io.emit('conversation-read-updated', {
                contactKey: key,
                affectedRows,
                userId: req.userId,
                sourceSocketId: sourceSocketId || null,
                timestamp: Date.now()
            });
        }

        res.json({ success: true, message: 'Conversation marquée comme lue', contactKey: key, affectedRows });
    } catch (err) { 
        logger.error('Mark conversation as read failed', { error: err.message, contactKey: req.body?.contactKey, userId: req.userId });
        res.status(500).json({ error: err.message }); 
    }
});

app.post('/delete-conversations', verifyToken, async (req, res) => {
    let conn;
    try {
        const contactKeys = Array.isArray(req.body?.contactKeys) ? req.body.contactKeys : [];
        if (contactKeys.length === 0) {
            return res.status(400).json({ success: false, error: 'Aucune conversation sélectionnée' });
        }

        conn = await pool.getConnection();
        await conn.beginTransaction();

        let deletedSent = 0;
        let deletedReceived = 0;
        let deletedConversations = 0;

        for (const rawKey of contactKeys) {
            const contactKey = String(rawKey || '');
            let localDeleted = 0;

            if (contactKey.startsWith('participant_')) {
                const participantId = parseInt(contactKey.replace('participant_', ''), 10);
                if (!Number.isNaN(participantId)) {
                    const [sentResult] = await conn.query('DELETE FROM SentSMS WHERE ParticipantId = ?', [participantId]);
                    const [receivedResult] = await conn.query('DELETE FROM ReceivedSMS WHERE ParticipantId = ?', [participantId]);
                    deletedSent += sentResult.affectedRows || 0;
                    deletedReceived += receivedResult.affectedRows || 0;
                    localDeleted = (sentResult.affectedRows || 0) + (receivedResult.affectedRows || 0);
                }
            } else {
                const normalized = normalizePhone(contactKey.replace('unknown_', ''));
                if (normalized) {
                    const [sentResult] = await conn.query(
                        `DELETE FROM SentSMS
                         WHERE ParticipantId IS NULL
                           AND RIGHT(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(RecipientNumber, '-', ''), '(', ''), ')', ''), ' ', ''), '+', ''), 10) = ?`,
                        [normalized]
                    );
                    const [receivedResult] = await conn.query(
                        `DELETE FROM ReceivedSMS
                         WHERE ParticipantId IS NULL
                           AND RIGHT(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(SenderNumber, '-', ''), '(', ''), ')', ''), ' ', ''), '+', ''), 10) = ?`,
                        [normalized]
                    );

                    deletedSent += sentResult.affectedRows || 0;
                    deletedReceived += receivedResult.affectedRows || 0;
                    localDeleted = (sentResult.affectedRows || 0) + (receivedResult.affectedRows || 0);
                }
            }

            if (localDeleted > 0) {
                deletedConversations++;
            }
        }

        await conn.commit();
        logger.info('Conversations deleted', {
            selectedCount: contactKeys.length,
            deletedConversations,
            deletedSent,
            deletedReceived,
            userId: req.userId
        });

        res.json({
            success: true,
            deletedConversations,
            deletedSent,
            deletedReceived
        });
    } catch (err) {
        if (conn) await conn.rollback();
        logger.error('Delete conversations failed', { error: err.message, userId: req.userId });
        res.status(500).json({ success: false, error: err.message });
    } finally {
        if (conn) conn.release();
    }
});

async function ensureSchedulingTables() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS AdminDistributionLists (
            Id INT AUTO_INCREMENT PRIMARY KEY,
            Name VARCHAR(120) NOT NULL,
            Description VARCHAR(255) NULL,
            IsActive TINYINT(1) NOT NULL DEFAULT 1,
            CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS AdminDistributionListMembers (
            Id INT AUTO_INCREMENT PRIMARY KEY,
            ListId INT NOT NULL,
            DisplayName VARCHAR(120) NULL,
            PhoneNumber VARCHAR(30) NOT NULL,
            IsActive TINYINT(1) NOT NULL DEFAULT 1,
            CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uq_list_phone (ListId, PhoneNumber),
            INDEX idx_list_members_list (ListId)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS ScheduledSmsJobs (
            Id INT AUTO_INCREMENT PRIMARY KEY,
            Title VARCHAR(180) NULL,
            Message TEXT NOT NULL,
            SendAtUtc DATETIME NOT NULL,
            TimeZone VARCHAR(60) NOT NULL DEFAULT 'America/Toronto',
            DistributionListId INT NULL,
            CreatedByUserId INT NULL,
            RecurrenceType VARCHAR(20) NOT NULL DEFAULT 'none',
            RecurrenceInterval INT NOT NULL DEFAULT 1,
            RecurrenceUntilUtc DATETIME NULL,
            RecurrenceCountMax INT NULL,
            RecurrenceCountDone INT NOT NULL DEFAULT 0,
            Status VARCHAR(20) NOT NULL DEFAULT 'pending',
            TotalRecipients INT NOT NULL DEFAULT 0,
            SuccessCount INT NOT NULL DEFAULT 0,
            FailedCount INT NOT NULL DEFAULT 0,
            LastError TEXT NULL,
            StartedAt DATETIME NULL,
            CompletedAt DATETIME NULL,
            CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_jobs_status_sendat (Status, SendAtUtc)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await ensureColumnExists('ScheduledSmsJobs', 'RecurrenceType', "VARCHAR(20) NOT NULL DEFAULT 'none'");
    await ensureColumnExists('ScheduledSmsJobs', 'RecurrenceInterval', 'INT NOT NULL DEFAULT 1');
    await ensureColumnExists('ScheduledSmsJobs', 'RecurrenceUntilUtc', 'DATETIME NULL');
    await ensureColumnExists('ScheduledSmsJobs', 'RecurrenceCountMax', 'INT NULL');
    await ensureColumnExists('ScheduledSmsJobs', 'RecurrenceCountDone', 'INT NOT NULL DEFAULT 0');

    await pool.query(`
        CREATE TABLE IF NOT EXISTS ScheduledSmsJobRecipients (
            Id INT AUTO_INCREMENT PRIMARY KEY,
            JobId INT NOT NULL,
            ParticipantId INT NULL,
            DisplayName VARCHAR(120) NULL,
            PhoneNumber VARCHAR(30) NOT NULL,
            Status VARCHAR(20) NOT NULL DEFAULT 'pending',
            ErrorMessage TEXT NULL,
            SentAt DATETIME NULL,
            CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_job_recipients_job (JobId),
            INDEX idx_job_recipients_status (Status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS ScheduledSmsJobRuns (
            Id INT AUTO_INCREMENT PRIMARY KEY,
            JobId INT NOT NULL,
            TriggeredBy VARCHAR(20) NOT NULL,
            SummaryMessage TEXT NULL,
            TotalRecipients INT NOT NULL DEFAULT 0,
            SuccessCount INT NOT NULL DEFAULT 0,
            FailedCount INT NOT NULL DEFAULT 0,
            StartedAt DATETIME NOT NULL,
            CompletedAt DATETIME NOT NULL,
            CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_job_runs_job (JobId)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS ScheduledSmsNotificationLogs (
            Id INT AUTO_INCREMENT PRIMARY KEY,
            JobId INT NOT NULL,
            ListId INT NOT NULL,
            PhoneNumber VARCHAR(30) NOT NULL,
            Status VARCHAR(20) NOT NULL,
            ErrorMessage TEXT NULL,
            SentAt DATETIME NULL,
            CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_job_notifications_job (JobId)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
}

function buildScheduledSummary(job, totalRecipients, successCount, failedCount, processingMs = 0) {
    const messageText = String(job?.Message || '').trim() || '(vide)';
    const durationSeconds = Math.max(0, Math.round(Number(processingMs || 0) / 1000));
    const titleText = String(job?.Title || '').trim() || 'Sans titre';
    const hourText = new Date().toLocaleTimeString('fr-CA', {
        timeZone: MONTREAL_TZ,
        hour12: false
    });
    return [
        `Envoi automatisé terminé - ${titleText}`,
        `Heure: ${hourText}`,
        `Message: ${messageText}`,
        `Total envoyé: ${totalRecipients}`,
        `Succès: ${successCount}`,
        `Erreurs: ${failedCount}`,
        `Temps de traitement: ${durationSeconds}s`
    ].join('\n');
}

async function notifyDistributionListForJob(jobId, listId, summaryMessage) {
    if (!listId) return;
    const phoneColumn = schedulingSchema.distributionMemberPhoneColumn;
    const nameColumn = schedulingSchema.distributionMemberNameColumn;
    const [members] = await pool.query(
        `SELECT Id, ${phoneColumn} AS PhoneNumber, ${nameColumn} AS DisplayName
         FROM AdminDistributionListMembers
         WHERE ListId = ? AND IsActive = 1`,
        [listId]
    );

    for (const member of members) {
        const normalized = normalizePhone10(member.PhoneNumber);
        if (!normalized) {
            await pool.query(
                'INSERT INTO ScheduledSmsNotificationLogs (JobId, ListId, PhoneNumber, Status, ErrorMessage) VALUES (?, ?, ?, ?, ?)',
                [jobId, listId, member.PhoneNumber, 'failed', 'Numéro invalide']
            );
            continue;
        }

        try {
            const result = await sendPixelSms(normalized, summaryMessage);
            await pool.query(
                'INSERT INTO ScheduledSmsNotificationLogs (JobId, ListId, PhoneNumber, Status, SentAt) VALUES (?, ?, ?, ?, UTC_TIMESTAMP())',
                [jobId, listId, result.finalPhone, result.status === 'succès' ? 'success' : 'failed']
            );
        } catch (err) {
            await pool.query(
                'INSERT INTO ScheduledSmsNotificationLogs (JobId, ListId, PhoneNumber, Status, ErrorMessage) VALUES (?, ?, ?, ?, ?)',
                [jobId, listId, normalized, 'failed', err.message]
            );
        }

        if (BULK_SMS_DELAY_MS > 0) {
            await waitMs(BULK_SMS_DELAY_MS);
        }
    }
}

async function executeScheduledJob(jobId, triggeredBy = 'scheduler') {
    let conn;
    const runStartDate = new Date();
    const runStart = formatDateTimeUtc(runStartDate);
    const jobStatusPending = getScheduledJobStatusValue('pending');
    const jobStatusRunning = getScheduledJobStatusValue('running');
    const jobStatusFailed = getScheduledJobStatusValue('failed');
    const recipientStatusFailed = getScheduledRecipientStatusValue('failed');
    const recipientStatusSuccess = getScheduledRecipientStatusValue('success');

    try {
        conn = await pool.getConnection();
        await conn.beginTransaction();

        const [lockResult] = await conn.query(
            `UPDATE ScheduledSmsJobs
             SET Status = ?, StartedAt = UTC_TIMESTAMP(), LastError = NULL
             WHERE Id = ? AND Status = ?`,
            [jobStatusRunning, jobId, jobStatusPending]
        );

        if (!lockResult.affectedRows) {
            await conn.rollback();
            return false;
        }

        const [jobRows] = await conn.query('SELECT * FROM ScheduledSmsJobs WHERE Id = ?', [jobId]);
        const job = jobRows[0];
        const recipientPhoneColumn = schedulingSchema.scheduledRecipientPhoneColumn
            || schedulingSchema.scheduledRecipientNormalizedPhoneColumn
            || schedulingSchema.scheduledRecipientRawPhoneColumn;
        const recipientNameColumn = schedulingSchema.scheduledRecipientNameColumn;
        const recipientStatusColumn = schedulingSchema.scheduledRecipientStatusColumn;
        const recipientErrorColumn = schedulingSchema.scheduledRecipientErrorColumn;
        const recipientSentAtColumn = schedulingSchema.scheduledRecipientSentAtColumn;
        const recipientNameSelect = recipientNameColumn
            ? `${recipientNameColumn} AS DisplayName`
            : 'NULL AS DisplayName';

        if (!recipientPhoneColumn) {
            throw new Error('Aucune colonne téléphone détectée dans ScheduledSmsJobRecipients');
        }

        const [recipients] = await conn.query(
            `SELECT Id, JobId, ParticipantId, ${recipientNameSelect}, ${recipientPhoneColumn} AS PhoneNumber
             FROM ScheduledSmsJobRecipients
             WHERE JobId = ?`,
            [jobId]
        );
        await conn.commit();
        conn.release();
        conn = null;

        let successCount = 0;
        let failedCount = 0;

        for (const recipient of recipients) {
            const normalized = normalizePhone10(recipient.PhoneNumber);
            if (!normalized) {
                failedCount++;
                const sets = [];
                const params = [];
                if (recipientStatusColumn) {
                    sets.push(`${recipientStatusColumn} = ?`);
                    params.push(recipientStatusFailed);
                }
                if (recipientErrorColumn) {
                    sets.push(`${recipientErrorColumn} = ?`);
                    params.push('Numéro invalide');
                }
                if (sets.length > 0) {
                    params.push(recipient.Id);
                    await executePoolQueryWithRetry(
                        `UPDATE ScheduledSmsJobRecipients SET ${sets.join(', ')} WHERE Id = ?`,
                        params,
                        { maxAttempts: 3, baseDelayMs: 120 }
                    );
                }
                continue;
            }

            try {
                const sendResult = await sendPixelSms(normalized, job.Message);
                const status = sendResult.status === 'succès' ? recipientStatusSuccess : recipientStatusFailed;
                if (status === recipientStatusSuccess) {
                    successCount++;
                } else {
                    failedCount++;
                }

                const sets = [];
                const params = [];
                if (recipientStatusColumn) {
                    sets.push(`${recipientStatusColumn} = ?`);
                    params.push(status);
                }
                if (recipientErrorColumn) {
                    sets.push(`${recipientErrorColumn} = NULL`);
                }
                if (recipientSentAtColumn) {
                    sets.push(`${recipientSentAtColumn} = UTC_TIMESTAMP()`);
                }
                if (sets.length > 0) {
                    params.push(recipient.Id);
                    await executePoolQueryWithRetry(
                        `UPDATE ScheduledSmsJobRecipients SET ${sets.join(', ')} WHERE Id = ?`,
                        params,
                        { maxAttempts: 3, baseDelayMs: 120 }
                    );
                }

                await executePoolQueryWithRetry(
                    'INSERT INTO SentSMS (ParticipantId, Message, RecipientNumber, Statut, SentDate) VALUES (?, ?, ?, ?, NOW())',
                    [recipient.ParticipantId || null, job.Message, sendResult.finalPhone, status === recipientStatusSuccess ? 'succès' : 'échec'],
                    { maxAttempts: 3, baseDelayMs: 120 }
                );
            } catch (err) {
                failedCount++;
                const sets = [];
                const params = [];
                if (recipientStatusColumn) {
                    sets.push(`${recipientStatusColumn} = ?`);
                    params.push(recipientStatusFailed);
                }
                if (recipientErrorColumn) {
                    sets.push(`${recipientErrorColumn} = ?`);
                    params.push(err.message);
                }
                if (sets.length > 0) {
                    params.push(recipient.Id);
                    await executePoolQueryWithRetry(
                        `UPDATE ScheduledSmsJobRecipients SET ${sets.join(', ')} WHERE Id = ?`,
                        params,
                        { maxAttempts: 3, baseDelayMs: 120 }
                    );
                }
                await executePoolQueryWithRetry(
                    'INSERT INTO SentSMS (ParticipantId, Message, RecipientNumber, Statut, SentDate) VALUES (?, ?, ?, ?, NOW())',
                    [recipient.ParticipantId || null, job.Message, toE164From10(normalized), 'échec'],
                    { maxAttempts: 3, baseDelayMs: 120 }
                );
            }

            if (BULK_SMS_DELAY_MS > 0) {
                await waitMs(BULK_SMS_DELAY_MS);
            }
        }

        const totalRecipients = recipients.length;
        const recurrenceType = normalizeRecurrenceType(job.RecurrenceType);
        const recurrenceCountDone = Math.max(0, Number(job.RecurrenceCountDone || 0));
        const recurrenceCountMax = job.RecurrenceCountMax == null ? null : Math.max(1, Number(job.RecurrenceCountMax || 0));
        const recurrenceUntilUtc = parseUtcDateValue(job.RecurrenceUntilUtc);
        const nextRecurrenceCountDone = recurrenceType === 'none' ? recurrenceCountDone : recurrenceCountDone + 1;
        const nextRecurringUtcDate = recurrenceType === 'none' ? null : computeNextRecurringUtcFromJob(job);

        const canContinueByCount = recurrenceCountMax == null || nextRecurrenceCountDone < recurrenceCountMax;
        const canContinueByUntil = !recurrenceUntilUtc
            || (nextRecurringUtcDate && nextRecurringUtcDate.getTime() <= recurrenceUntilUtc.getTime());
        const shouldReschedule = recurrenceType !== 'none' && !!nextRecurringUtcDate && canContinueByCount && canContinueByUntil;

        const finalStatus = failedCount > 0 && successCount === 0
            ? getScheduledJobStatusValue('failed')
            : getScheduledJobStatusValue('completed');
        const processingMs = Date.now() - runStartDate.getTime();
        const summaryMessage = buildScheduledSummary(job, totalRecipients, successCount, failedCount, processingMs);

        if (shouldReschedule) {
            const recipientResetSets = [];
            const recipientResetParams = [];
            if (recipientStatusColumn) {
                recipientResetSets.push(`${recipientStatusColumn} = ?`);
                recipientResetParams.push(getScheduledRecipientStatusValue('pending'));
            }
            if (recipientErrorColumn) {
                recipientResetSets.push(`${recipientErrorColumn} = NULL`);
            }
            if (recipientSentAtColumn) {
                recipientResetSets.push(`${recipientSentAtColumn} = NULL`);
            }

            if (recipientResetSets.length > 0) {
                recipientResetParams.push(jobId);
                await executePoolQueryWithRetry(
                    `UPDATE ScheduledSmsJobRecipients
                     SET ${recipientResetSets.join(', ')}
                     WHERE JobId = ?`,
                    recipientResetParams,
                    { maxAttempts: 4, baseDelayMs: 150 }
                );
            }

            await executePoolQueryWithRetry(
                `UPDATE ScheduledSmsJobs
                 SET Status = ?, SendAtUtc = ?, TotalRecipients = 0, SuccessCount = 0, FailedCount = 0,
                     LastError = NULL, StartedAt = NULL, CompletedAt = NULL, RecurrenceCountDone = ?, UpdatedAt = UTC_TIMESTAMP()
                 WHERE Id = ?`,
                [getScheduledJobStatusValue('pending'), formatDateTimeUtc(nextRecurringUtcDate), nextRecurringUtcDate ? nextRecurrenceCountDone : recurrenceCountDone, jobId],
                { maxAttempts: 4, baseDelayMs: 160 }
            );
        } else {
            await executePoolQueryWithRetry(
                `UPDATE ScheduledSmsJobs
                 SET Status = ?, TotalRecipients = ?, SuccessCount = ?, FailedCount = ?, CompletedAt = UTC_TIMESTAMP(),
                     RecurrenceCountDone = ?
                 WHERE Id = ?`,
                [finalStatus, totalRecipients, successCount, failedCount, nextRecurrenceCountDone, jobId],
                { maxAttempts: 4, baseDelayMs: 160 }
            );
        }

        try {
            await insertScheduledJobRun({
                jobId,
                triggeredBy,
                summaryMessage,
                totalRecipients,
                successCount,
                failedCount,
                runStart
            });
        } catch (runLogErr) {
            logger.warn('Scheduled job run insert failed (non-blocking)', { jobId, error: runLogErr.message });
        }

        try {
            await notifyDistributionListForJob(jobId, job.DistributionListId, summaryMessage);
        } catch (notifyErr) {
            logger.warn('Scheduled job notifications failed (non-blocking)', { jobId, error: notifyErr.message });
        }

        io.emit('scheduled-job-updated', {
            jobId,
            status: shouldReschedule ? getScheduledJobStatusValue('pending') : finalStatus,
            totalRecipients,
            successCount,
            failedCount,
            completedAt: new Date().toISOString()
        });

        return true;
    } catch (err) {
        logger.error('Execute scheduled job failed', { jobId, error: err.message });
        if (conn) {
            try {
                await conn.rollback();
            } catch (rollbackErr) {
                logger.warn('Rollback failed after scheduled job error', { jobId, error: rollbackErr.message });
            }
            conn.release();
            conn = null;
        }

        try {
            await executePoolQueryWithRetry(
                `UPDATE ScheduledSmsJobs
                 SET Status = ?, LastError = ?, CompletedAt = UTC_TIMESTAMP()
                 WHERE Id = ?`,
                [jobStatusFailed, err.message, jobId],
                { maxAttempts: 4, baseDelayMs: 200 }
            );
        } catch (subErr) {
            logger.error('Failed to mark scheduled job as failed', { jobId, error: subErr.message });
        }
        return false;
    } finally {
        if (conn) conn.release();
    }
}

async function processDueScheduledJobs() {
    if (scheduledJobsInProgress) return;
    scheduledJobsInProgress = true;
    const jobStatusPending = getScheduledJobStatusValue('pending');

    try {
        const [jobs] = await pool.query(
            `SELECT Id
             FROM ScheduledSmsJobs
             WHERE Status = ? AND SendAtUtc <= UTC_TIMESTAMP()
             ORDER BY SendAtUtc ASC
             LIMIT 5`,
            [jobStatusPending]
        );

        for (const job of jobs) {
            await executeScheduledJob(job.Id, 'scheduler');
        }
    } catch (err) {
        logger.error('Scheduled jobs poll failed', { error: err.message });
    } finally {
        scheduledJobsInProgress = false;
    }
}

function startScheduledJobsRunner() {
    if (scheduledJobsTimer) return;
    scheduledJobsTimer = setInterval(() => {
        processDueScheduledJobs().catch((err) => {
            logger.error('Scheduled runner iteration error', { error: err.message });
        });
    }, SCHEDULED_JOBS_POLL_MS);
}

app.get('/admin/distribution-lists', verifyToken, async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT l.Id, l.Name, l.Description, l.IsActive, l.CreatedAt, l.UpdatedAt,
                   COUNT(m.Id) AS MembersCount
            FROM AdminDistributionLists l
            LEFT JOIN AdminDistributionListMembers m ON m.ListId = l.Id AND m.IsActive = 1
            GROUP BY l.Id
            ORDER BY l.Name ASC
        `);
        res.json(rows);
    } catch (err) {
        logger.error('Get distribution lists failed', { error: err.message, userId: req.userId });
        res.status(500).json({ error: err.message });
    }
});

app.post('/admin/distribution-lists', verifyToken, async (req, res) => {
    try {
        const name = String(req.body?.name || '').trim();
        const description = String(req.body?.description || '').trim() || null;
        const createdByColumn = schedulingSchema.distributionListCreatedByColumn;

        if (!name) return res.status(400).json({ error: 'Nom de liste requis' });

        const [result] = createdByColumn
            ? await pool.query(
                `INSERT INTO AdminDistributionLists (Name, Description, IsActive, ${createdByColumn}) VALUES (?, ?, 1, ?)`,
                [name, description, req.userId || null]
            )
            : await pool.query(
                'INSERT INTO AdminDistributionLists (Name, Description, IsActive) VALUES (?, ?, 1)',
                [name, description]
            );

        res.json({ success: true, id: result.insertId });
    } catch (err) {
        logger.error('Create distribution list failed', { error: err.message, userId: req.userId });
        res.status(500).json({ error: err.message });
    }
});

app.put('/admin/distribution-lists/:id', verifyToken, async (req, res) => {
    try {
        const listId = Number(req.params.id);
        const name = String(req.body?.name || '').trim();
        const description = String(req.body?.description || '').trim() || null;
        const isActive = req.body?.isActive === undefined ? 1 : (req.body.isActive ? 1 : 0);

        if (!listId || Number.isNaN(listId)) return res.status(400).json({ error: 'ID invalide' });
        if (!name) return res.status(400).json({ error: 'Nom de liste requis' });

        await pool.query(
            'UPDATE AdminDistributionLists SET Name = ?, Description = ?, IsActive = ? WHERE Id = ?',
            [name, description, isActive, listId]
        );

        res.json({ success: true });
    } catch (err) {
        logger.error('Update distribution list failed', { error: err.message, userId: req.userId, listId: req.params.id });
        res.status(500).json({ error: err.message });
    }
});

app.delete('/admin/distribution-lists/:id', verifyToken, async (req, res) => {
    let conn;
    try {
        const listId = Number(req.params.id);
        if (!listId || Number.isNaN(listId)) return res.status(400).json({ error: 'ID invalide' });

        conn = await pool.getConnection();
        await conn.beginTransaction();
        await conn.query('DELETE FROM AdminDistributionListMembers WHERE ListId = ?', [listId]);
        await conn.query('DELETE FROM AdminDistributionLists WHERE Id = ?', [listId]);
        await conn.commit();

        res.json({ success: true });
    } catch (err) {
        if (conn) await conn.rollback();
        logger.error('Delete distribution list failed', { error: err.message, userId: req.userId, listId: req.params.id });
        res.status(500).json({ error: err.message });
    } finally {
        if (conn) conn.release();
    }
});

app.get('/admin/distribution-lists/:id/members', verifyToken, async (req, res) => {
    try {
        const listId = Number(req.params.id);
        if (!listId || Number.isNaN(listId)) return res.status(400).json({ error: 'ID invalide' });
        const phoneColumn = schedulingSchema.distributionMemberPhoneColumn;
        const nameColumn = schedulingSchema.distributionMemberNameColumn;

        const [rows] = await pool.query(
            `SELECT Id, ListId, ${nameColumn} AS DisplayName, ${phoneColumn} AS PhoneNumber, IsActive, CreatedAt
             FROM AdminDistributionListMembers
             WHERE ListId = ?
             ORDER BY ${nameColumn} ASC, Id ASC`,
            [listId]
        );
        res.json(rows);
    } catch (err) {
        logger.error('Get distribution list members failed', { error: err.message, listId: req.params.id, userId: req.userId });
        res.status(500).json({ error: err.message });
    }
});

app.post('/admin/distribution-lists/:id/members', verifyToken, async (req, res) => {
    try {
        const listId = Number(req.params.id);
        const displayName = String(req.body?.displayName || '').trim() || null;
        const phoneRaw = String(req.body?.phone || '').trim();
        const normalized = normalizePhone10(phoneRaw);
        const phoneColumn = schedulingSchema.distributionMemberPhoneColumn;
        const nameColumn = schedulingSchema.distributionMemberNameColumn;
        const rawPhoneColumn = schedulingSchema.distributionMemberRawPhoneColumn;
        const normalizedPhoneColumn = schedulingSchema.distributionMemberNormalizedPhoneColumn;

        if (!listId || Number.isNaN(listId)) return res.status(400).json({ error: 'ID invalide' });
        if (!normalized) return res.status(400).json({ error: 'Numéro invalide' });

        const insertColumns = [
            'ListId',
            nameColumn,
            phoneColumn,
            ...(rawPhoneColumn ? [rawPhoneColumn] : []),
            ...(normalizedPhoneColumn ? [normalizedPhoneColumn] : []),
            'IsActive'
        ].join(', ');

        const insertValues = [
            '?',
            '?',
            '?',
            ...(rawPhoneColumn ? ['?'] : []),
            ...(normalizedPhoneColumn ? ['?'] : []),
            '1'
        ].join(', ');

        const updateRawPhone = rawPhoneColumn
            ? `, ${rawPhoneColumn} = VALUES(${rawPhoneColumn})`
            : '';

        const updateNormalizedPhone = normalizedPhoneColumn
            ? `, ${normalizedPhoneColumn} = VALUES(${normalizedPhoneColumn})`
            : '';

        const params = [
            listId,
            displayName,
            normalized,
            ...(rawPhoneColumn ? [phoneRaw || normalized] : []),
            ...(normalizedPhoneColumn ? [normalized] : [])
        ];

        await pool.query(
            `INSERT INTO AdminDistributionListMembers (${insertColumns})
             VALUES (${insertValues})
             ON DUPLICATE KEY UPDATE ${nameColumn} = VALUES(${nameColumn}), IsActive = 1${updateRawPhone}${updateNormalizedPhone}`,
            params
        );

        res.json({ success: true });
    } catch (err) {
        logger.error('Add distribution list member failed', { error: err.message, listId: req.params.id, userId: req.userId });
        res.status(500).json({ error: err.message });
    }
});

app.delete('/admin/distribution-lists/:listId/members/:memberId', verifyToken, async (req, res) => {
    try {
        const listId = Number(req.params.listId);
        const memberId = Number(req.params.memberId);
        if (!listId || Number.isNaN(listId) || !memberId || Number.isNaN(memberId)) {
            return res.status(400).json({ error: 'ID invalide' });
        }

        await pool.query('DELETE FROM AdminDistributionListMembers WHERE Id = ? AND ListId = ?', [memberId, listId]);
        res.json({ success: true });
    } catch (err) {
        logger.error('Delete distribution list member failed', {
            error: err.message,
            listId: req.params.listId,
            memberId: req.params.memberId,
            userId: req.userId
        });
        res.status(500).json({ error: err.message });
    }
});

app.get('/scheduled-jobs', verifyToken, async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT j.Id, j.Title, j.Message, j.SendAtUtc, j.TimeZone, j.DistributionListId,
                   j.RecurrenceType, j.RecurrenceInterval, j.RecurrenceUntilUtc, j.RecurrenceCountMax, j.RecurrenceCountDone,
                   j.Status,
                   j.TotalRecipients, j.SuccessCount, j.FailedCount, j.LastError,
                   j.StartedAt, j.CompletedAt, j.CreatedAt, j.UpdatedAt,
                   l.Name AS DistributionListName,
                   COUNT(r.Id) AS RecipientCount
            FROM ScheduledSmsJobs j
            LEFT JOIN AdminDistributionLists l ON l.Id = j.DistributionListId
            LEFT JOIN ScheduledSmsJobRecipients r ON r.JobId = j.Id
            GROUP BY j.Id
            ORDER BY j.SendAtUtc DESC
            LIMIT 200
        `);
        res.json(rows);
    } catch (err) {
        logger.error('Get scheduled jobs failed', { error: err.message, userId: req.userId });
        res.status(500).json({ error: err.message });
    }
});

app.post('/scheduled-jobs', verifyToken, async (req, res) => {
    let conn;
    try {
        const title = String(req.body?.title || '').trim() || null;
        const message = String(req.body?.message || '').trim();
        const sendAtLocal = String(req.body?.sendAtLocal || '').trim();
        const recurrenceTypeRaw = String(req.body?.recurrenceType || '').trim();
        const recurrenceType = normalizeRecurrenceType(recurrenceTypeRaw || 'none');
        const recurrenceInterval = recurrenceType === 'none'
            ? 1
            : normalizePositiveInt(req.body?.recurrenceInterval, 1, 1, 365);
        const recurrenceUntilLocal = String(req.body?.recurrenceUntilLocal || '').trim();
        const recurrenceCountMaxRaw = req.body?.recurrenceCountMax;
        const distributionListId = req.body?.distributionListId ? Number(req.body.distributionListId) : null;
        const recipients = Array.isArray(req.body?.recipients) ? req.body.recipients : [];
        const scheduledJobNameColumn = schedulingSchema.scheduledJobNameColumn;
        const scheduledJobMessageTemplateColumn = schedulingSchema.scheduledJobMessageTemplateColumn;
        const scheduledJobLocalDateTimeColumn = schedulingSchema.scheduledJobLocalDateTimeColumn;
        const scheduledJobLegacyUtcColumn = schedulingSchema.scheduledJobLegacyUtcColumn;
        const recipientPhoneColumn = schedulingSchema.scheduledRecipientPhoneColumn
            || schedulingSchema.scheduledRecipientNormalizedPhoneColumn
            || schedulingSchema.scheduledRecipientRawPhoneColumn;
        const recipientNameColumn = schedulingSchema.scheduledRecipientNameColumn;
        const recipientRawPhoneColumn = schedulingSchema.scheduledRecipientRawPhoneColumn;
        const recipientNormalizedPhoneColumn = schedulingSchema.scheduledRecipientNormalizedPhoneColumn;
        const recipientStatusColumn = schedulingSchema.scheduledRecipientStatusColumn;
        const jobStatusPending = getScheduledJobStatusValue('pending');
        const recipientStatusPending = getScheduledRecipientStatusValue('pending');

        if (!message) return res.status(400).json({ error: 'Message requis' });
        if (!sendAtLocal) return res.status(400).json({ error: 'Date/heure locale requise' });
        if (recipients.length === 0) return res.status(400).json({ error: 'Aucun destinataire' });

        const sendAtUtcDate = parseMontrealLocalToUtc(sendAtLocal);
        if (!sendAtUtcDate || Number.isNaN(sendAtUtcDate.getTime())) {
            return res.status(400).json({ error: 'Date/heure locale invalide' });
        }

        if (recurrenceTypeRaw && recurrenceType === 'none' && recurrenceTypeRaw.toLowerCase() !== 'none') {
            return res.status(400).json({ error: 'Type de récurrence invalide' });
        }

        let recurrenceUntilUtcDate = null;
        if (recurrenceType !== 'none' && recurrenceUntilLocal) {
            recurrenceUntilUtcDate = parseMontrealLocalToUtc(recurrenceUntilLocal);
            if (!recurrenceUntilUtcDate || Number.isNaN(recurrenceUntilUtcDate.getTime())) {
                return res.status(400).json({ error: 'Date de fin de récurrence invalide' });
            }
            if (recurrenceUntilUtcDate.getTime() < sendAtUtcDate.getTime()) {
                return res.status(400).json({ error: 'La fin de récurrence doit être après la première exécution' });
            }
        }

        let recurrenceCountMax = null;
        if (recurrenceType !== 'none' && recurrenceCountMaxRaw !== undefined && recurrenceCountMaxRaw !== null && String(recurrenceCountMaxRaw).trim() !== '') {
            const parsedCount = Number(recurrenceCountMaxRaw);
            if (!Number.isFinite(parsedCount) || Math.trunc(parsedCount) < 1) {
                return res.status(400).json({ error: 'Nombre maximal de répétitions invalide' });
            }
            recurrenceCountMax = Math.trunc(parsedCount);
        }

        const normalizedRecipients = recipients
            .map((recipient) => ({
                participantId: recipient?.participantId ? Number(recipient.participantId) : null,
                displayName: String(recipient?.displayName || '').trim() || null,
                phone: normalizePhone10(recipient?.phone)
            }))
            .filter((recipient) => !!recipient.phone);

        if (normalizedRecipients.length === 0) {
            return res.status(400).json({ error: 'Aucun destinataire valide' });
        }

        if (!recipientPhoneColumn) {
            throw new Error('Aucune colonne téléphone détectée dans ScheduledSmsJobRecipients');
        }

        if (!recipientStatusColumn) {
            throw new Error('Aucune colonne statut détectée dans ScheduledSmsJobRecipients');
        }

        conn = await pool.getConnection();
        await conn.beginTransaction();

        const jobInsertColumns = [
            'Title',
            'Message',
            ...(scheduledJobMessageTemplateColumn ? [scheduledJobMessageTemplateColumn] : []),
            ...(scheduledJobLocalDateTimeColumn ? [scheduledJobLocalDateTimeColumn] : []),
            ...(scheduledJobLegacyUtcColumn ? [scheduledJobLegacyUtcColumn] : []),
            'SendAtUtc',
            'TimeZone',
            'DistributionListId',
            'CreatedByUserId',
            'RecurrenceType',
            'RecurrenceInterval',
            'RecurrenceUntilUtc',
            'RecurrenceCountMax',
            'RecurrenceCountDone',
            ...(scheduledJobNameColumn ? [scheduledJobNameColumn] : []),
            'Status',
            'TotalRecipients'
        ];

        const jobInsertValues = [
            '?', '?',
            ...(scheduledJobMessageTemplateColumn ? ['?'] : []),
            ...(scheduledJobLocalDateTimeColumn ? ['?'] : []),
            ...(scheduledJobLegacyUtcColumn ? ['?'] : []),
            '?', '?', '?', '?',
            '?', '?', '?', '?', '?',
            ...(scheduledJobNameColumn ? ['?'] : []),
            '?',
            '?'
        ];

        const scheduledUtcValue = formatDateTimeUtc(sendAtUtcDate);
        const jobInsertParams = [
            title,
            message,
            ...(scheduledJobMessageTemplateColumn ? [message] : []),
            ...(scheduledJobLocalDateTimeColumn ? [sendAtLocal] : []),
            ...(scheduledJobLegacyUtcColumn ? [scheduledUtcValue] : []),
            scheduledUtcValue,
            MONTREAL_TZ,
            distributionListId,
            req.userId || null,
            recurrenceType,
            recurrenceInterval,
            recurrenceUntilUtcDate ? formatDateTimeUtc(recurrenceUntilUtcDate) : null,
            recurrenceCountMax,
            0,
            ...(scheduledJobNameColumn ? [title || 'Envoi planifié'] : []),
            jobStatusPending,
            normalizedRecipients.length
        ];

        const [jobResult] = await conn.query(
            `INSERT INTO ScheduledSmsJobs
             (${jobInsertColumns.join(', ')})
             VALUES (${jobInsertValues.join(', ')})`,
            jobInsertParams
        );

        const jobId = jobResult.insertId;
        for (const recipient of normalizedRecipients) {
            const recipientColumnValues = new Map();
            recipientColumnValues.set('JobId', jobId);
            recipientColumnValues.set('ParticipantId', recipient.participantId);
            if (recipientNameColumn) recipientColumnValues.set(recipientNameColumn, recipient.displayName);
            recipientColumnValues.set(recipientPhoneColumn, recipient.phone);
            if (recipientRawPhoneColumn) recipientColumnValues.set(recipientRawPhoneColumn, recipient.phone);
            if (recipientNormalizedPhoneColumn) recipientColumnValues.set(recipientNormalizedPhoneColumn, recipient.phone);
            recipientColumnValues.set(recipientStatusColumn, recipientStatusPending);

            const recipientInsertColumns = Array.from(recipientColumnValues.keys());
            const recipientInsertValues = recipientInsertColumns.map(() => '?');
            const recipientInsertParams = recipientInsertColumns.map((column) => recipientColumnValues.get(column));

            await conn.query(
                `INSERT INTO ScheduledSmsJobRecipients
                 (${recipientInsertColumns.join(', ')})
                 VALUES (${recipientInsertValues.join(', ')})`,
                recipientInsertParams
            );
        }

        await conn.commit();
        res.json({ success: true, jobId });
    } catch (err) {
        if (conn) await conn.rollback();
        logger.error('Create scheduled job failed', { error: err.message, userId: req.userId });
        res.status(500).json({ error: err.message });
    } finally {
        if (conn) conn.release();
    }
});

app.post('/scheduled-jobs/:id/cancel', verifyToken, async (req, res) => {
    try {
        const jobId = Number(req.params.id);
        if (!jobId || Number.isNaN(jobId)) return res.status(400).json({ error: 'ID invalide' });
        const jobStatusPending = getScheduledJobStatusValue('pending');
        const jobStatusCancelled = getScheduledJobStatusValue('cancelled');

        const [result] = await executePoolQueryWithRetry(
            'UPDATE ScheduledSmsJobs SET Status = ?, UpdatedAt = UTC_TIMESTAMP() WHERE Id = ? AND Status = ?',
            [jobStatusCancelled, jobId, jobStatusPending],
            { maxAttempts: 4, baseDelayMs: 180 }
        );

        res.json({ success: true, updated: result.affectedRows || 0 });
    } catch (err) {
        logger.error('Cancel scheduled job failed', { error: err.message, userId: req.userId, jobId: req.params.id });
        res.status(500).json({ error: err.message });
    }
});

app.post('/scheduled-jobs/:id/run-now', verifyToken, async (req, res) => {
    try {
        const jobId = Number(req.params.id);
        if (!jobId || Number.isNaN(jobId)) return res.status(400).json({ error: 'ID invalide' });
        const jobStatusPending = getScheduledJobStatusValue('pending');

        const [result] = await executePoolQueryWithRetry(
            'UPDATE ScheduledSmsJobs SET SendAtUtc = UTC_TIMESTAMP(), UpdatedAt = UTC_TIMESTAMP() WHERE Id = ? AND Status = ?',
            [jobId, jobStatusPending],
            { maxAttempts: 4, baseDelayMs: 180 }
        );

        if (!result.affectedRows) {
            return res.status(400).json({ success: false, error: 'Job non exécutable' });
        }

        processDueScheduledJobs().catch((err) => {
            logger.error('Run-now poll trigger failed', { error: err.message, jobId });
        });

        res.json({ success: true });
    } catch (err) {
        logger.error('Run-now scheduled job failed', { error: err.message, userId: req.userId, jobId: req.params.id });
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
const AUTO_SYNC_INTERVAL_MS = parseInt(process.env.PIXEL_AUTO_SYNC_INTERVAL_MS || '15000', 10);
let autoSyncTimer = null;
let autoSyncRunning = false;

async function runAutoUnreadSync() {
    if (autoSyncRunning) return;
    autoSyncRunning = true;

    try {
        const result = await pixelSync.syncSMSToDatabase();
        if ((result?.inserted > 0) || (result?.insertedSent > 0)) {
            logger.info('Auto SMS sync imported new messages', { inserted: result.inserted, skipped: result.skipped, insertedSent: result.insertedSent, skippedSent: result.skippedSent });
            io.emit('sms-sync-complete', { ...result, auto: true });
        }
    } catch (err) {
        logger.warn('Auto SMS sync failed', { error: err.message });
    } finally {
        autoSyncRunning = false;
    }
}

function startAutoUnreadSync() {
    if (autoSyncTimer) return;
    logger.info('Auto unread SMS sync started', { intervalMs: AUTO_SYNC_INTERVAL_MS });

    runAutoUnreadSync();
    autoSyncTimer = setInterval(() => {
        runAutoUnreadSync();
    }, AUTO_SYNC_INTERVAL_MS);
}

function stopAutoUnreadSyncIfNoClients() {
    if (io.engine.clientsCount > 0) return;
    if (!autoSyncTimer) return;

    clearInterval(autoSyncTimer);
    autoSyncTimer = null;
    logger.info('Auto unread SMS sync stopped (no connected clients)');
}

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
            message: `Synchronisation complète: reçus ${result.inserted} importés/${result.skipped} existants, envoyés ${result.insertedSent || 0} importés/${result.skippedSent || 0} existants, ${result.errors} erreurs`,
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

// ===== Bulk SMS Queue =====
// Serializes all bulk sends across every connected client so the phone never
// receives concurrent batches, and broadcasts live status for reconnect/reload.
const bulkSmsQueue = [];
let currentBulkJob = null;
let bulkQueueRunning = false;

function getBulkQueueSnapshot() {
    return {
        processing: !!currentBulkJob,
        current: currentBulkJob ? { ...currentBulkJob } : null,
        queued: bulkSmsQueue.map(job => ({ callbackId: job.callbackId, total: job.recipients.length, queuedAt: job.queuedAt }))
    };
}

function broadcastBulkQueueStatus() {
    io.emit('bulk-queue-status', getBulkQueueSnapshot());
}

function enqueueBulkSmsJob(socket, data) {
    const job = {
        socketId: socket.id,
        recipients: Array.isArray(data?.recipients) ? data.recipients : [],
        message: data?.message,
        callbackId: data?.callbackId,
        queuedAt: new Date().toISOString()
    };

    bulkSmsQueue.push(job);
    logger.info('Bulk SMS job queued', { callbackId: job.callbackId, recipientCount: job.recipients.length, queueLength: bulkSmsQueue.length });

    socket.emit('bulk-sms-queued', {
        callbackId: job.callbackId,
        position: bulkSmsQueue.length,
        total: job.recipients.length
    });

    broadcastBulkQueueStatus();
    processBulkQueue();
}

async function processBulkQueue() {
    if (bulkQueueRunning) return;
    bulkQueueRunning = true;

    try {
        while (bulkSmsQueue.length > 0) {
            const job = bulkSmsQueue.shift();
            await runBulkSmsJob(job);
        }
    } finally {
        bulkQueueRunning = false;
        currentBulkJob = null;
        broadcastBulkQueueStatus();
    }
}

async function runBulkSmsJob(job) {
    const { recipients, message, callbackId, socketId } = job;

    currentBulkJob = {
        callbackId,
        current: 0,
        total: recipients.length,
        successCount: 0,
        failCount: 0,
        skippedCount: 0,
        startedAt: new Date().toISOString()
    };
    broadcastBulkQueueStatus();

    try {
        logger.info('WebSocket bulk SMS initiated', { socketId, recipientCount: recipients.length, callbackId });

        if (!message || !recipients || recipients.length === 0) {
            io.to(socketId).emit('bulk-sms-response', {
                success: false,
                callbackId,
                error: 'Message ou destinataires manquants'
            });
            return;
        }

        const targetUrl = `http://${process.env.PIXEL_IP}:${process.env.PIXEL_PORT}/messages`;
        let successCount = 0;
        let failCount = 0;
        let skippedCount = 0;
        const errors = [];
        const failedRecipients = [];
        const failedRecipientKeys = new Set();

        const addFailedRecipient = ({ participantId = null, phone = '', name = null, reason = '' } = {}) => {
            const normalizedPhone = normalizePhone10(phone);
            const e164Phone = normalizedPhone ? toE164From10(normalizedPhone) : '';
            const key = participantId != null
                ? `id:${participantId}`
                : (normalizedPhone ? `phone:${normalizedPhone}` : '');

            if (!key || failedRecipientKeys.has(key)) return;
            failedRecipientKeys.add(key);

            failedRecipients.push({
                participantId: participantId != null ? participantId : null,
                phone: e164Phone || String(phone || '').trim() || null,
                name: name || null,
                reason: reason || null
            });
        };

        io.emit('bulk-sms-progress', {
            callbackId,
            current: 0,
            total: recipients.length,
            successCount,
            failCount,
            skippedCount,
            status: 'start'
        });

        // Envoyer à chaque destinataire
        for (let index = 0; index < recipients.length; index++) {
            const recipientInput = recipients[index];
            let progressStatus = 'erreur';
            let progressRecipient = `destinataire_${index + 1}`;
            try {
                let recipientId = null;
                let phone = '';
                let recipientName = '';

                if (recipientInput && typeof recipientInput === 'object' && !Array.isArray(recipientInput)) {
                    const parsedId = parseInt(recipientInput.participantId ?? recipientInput.id ?? recipientInput.Id, 10);
                    if (!Number.isNaN(parsedId)) {
                        recipientId = parsedId;
                    }

                    recipientName = String(recipientInput.name || recipientInput.displayName || '').trim();
                    const normalizedDirectPhone = normalizePhone10(recipientInput.phone || recipientInput.phoneNumber || recipientInput.NumeroTel);
                    if (normalizedDirectPhone) {
                        phone = toE164From10(normalizedDirectPhone);
                    }
                } else {
                    const parsedId = parseInt(recipientInput, 10);
                    if (!Number.isNaN(parsedId)) {
                        recipientId = parsedId;
                    }
                }

                progressRecipient = recipientName || (recipientId != null ? `participant_${recipientId}` : progressRecipient);

                if (!phone && recipientId != null) {
                    const [rows] = await pool.query(
                        'SELECT NumeroTel FROM Participants WHERE Id = ?',
                        [recipientId]
                    );

                    if (rows.length === 0) {
                        failCount++;
                        errors.push(`Participant ${recipientId}: non trouvé`);
                        addFailedRecipient({ participantId: recipientId, name: recipientName, reason: 'participant-not-found' });
                        progressStatus = 'erreur';
                        continue;
                    }

                    const normalizedDbPhone = normalizePhone10(rows[0].NumeroTel);
                    if (!normalizedDbPhone) {
                        failCount++;
                        errors.push(`Participant ${recipientId}: numéro invalide`);
                        addFailedRecipient({ participantId: recipientId, name: recipientName, reason: 'invalid-phone' });
                        progressStatus = 'erreur';
                        continue;
                    }
                    phone = toE164From10(normalizedDbPhone);
                }

                if (!phone) {
                    failCount++;
                    errors.push(`${recipientName || recipientId || 'destinataire'}: numéro invalide`);
                    addFailedRecipient({ participantId: recipientId, name: recipientName, reason: 'invalid-phone' });
                    progressStatus = 'erreur';
                    continue;
                }

                progressRecipient = phone;

                const alreadySent = await hasRecentSuccessfulBulkSend(recipientId, phone, message);
                if (alreadySent) {
                    skippedCount++;
                    progressStatus = 'ignoré';
                    logger.warn('Bulk SMS skipped duplicate success', {
                        participantId: recipientId,
                        recipientName,
                        phone,
                        lookbackHours: BULK_SMS_DEDUP_LOOKBACK_HOURS
                    });
                    continue;
                }

                let status = 'échec';

                // Envoyer via Pixel API
                try {
                    const response = await axios.post(targetUrl, {
                        phoneNumbers: [phone],
                        textMessage: { text: message }
                    }, {
                        auth: { username: process.env.PIXEL_USER, password: process.env.PIXEL_PASS },
                        timeout: 15000
                    });

                    status = resolvePixelSendStatus(response) === 'succès' ? 'succès' : 'échec';

                    if (status === 'succès') {
                        logger.info('Bulk SMS sent via WebSocket', {
                            phone,
                            participantId: recipientId,
                            recipientName,
                            responseStatus: response?.status
                        });
                        successCount++;
                        progressStatus = 'succès';
                    } else {
                        failCount++;
                        const queueLimit = isQueueLimitError(response);
                        errors.push(queueLimit
                            ? `${phone}: limite de file SmsGate atteinte (RESULT_ERROR_LIMIT_EXCEEDED)`
                            : `${phone}: statut API non confirmé`);
                        addFailedRecipient({
                            participantId: recipientId,
                            phone,
                            name: recipientName,
                            reason: queueLimit ? 'queue-limit-exceeded' : 'api-status-not-confirmed'
                        });
                        progressStatus = 'erreur';
                        logger.warn('Bulk SMS API returned non-success status', {
                            phone,
                            participantId: recipientId,
                            recipientName,
                            responseStatus: response?.status,
                            payloadStatus: response?.data?.status,
                            queueLimit
                        });
                    }
                } catch (apiErr) {
                    status = 'échec';
                    failCount++;
                    if (isQueueLimitError(apiErr)) {
                        errors.push(`${phone}: limite de file SmsGate atteinte (RESULT_ERROR_LIMIT_EXCEEDED)`);
                        addFailedRecipient({ participantId: recipientId, phone, name: recipientName, reason: 'queue-limit-exceeded' });
                    } else {
                        errors.push(`${phone}: ${apiErr.message}`);
                        addFailedRecipient({ participantId: recipientId, phone, name: recipientName, reason: 'api-error' });
                    }
                    progressStatus = 'erreur';
                    logger.error('Bulk SMS send failed via WebSocket', { phone, participantId: recipientId, recipientName, error: apiErr.message });
                }

                // Insérer dans SentSMS
                try {
                    const [insertResult] = await pool.query(
                        'INSERT INTO SentSMS (ParticipantId, Message, RecipientNumber, Statut, SentDate) VALUES (?, ?, ?, ?, NOW())',
                        [recipientId, message, phone, status]
                    );
                    logger.info('Bulk SMS database insert', { participantId: recipientId, recipientName, phone, status });

                    if (status === 'succès') {
                        io.emit('sms-sent', {
                            Id: insertResult?.insertId || null,
                            ParticipantId: recipientId,
                            Message: message,
                            RecipientNumber: phone,
                            Statut: status,
                            SentDate: new Date().toISOString(),
                            type: 'sent',
                            source: 'bulk',
                            callbackId
                        });
                    }
                } catch (dbErr) {
                    logger.error('Bulk SMS database insert failed', { participantId: recipientId, recipientName, phone, error: dbErr.message });
                }

            } catch (err) {
                failCount++;
                errors.push(`Destinataire ${index + 1}: ${err.message}`);
                addFailedRecipient({ reason: 'processing-error' });
                progressStatus = 'erreur';
                logger.error('Bulk SMS processing error', { recipientIndex: index + 1, error: err.message });
            }

            if (currentBulkJob) {
                currentBulkJob.current = index + 1;
                currentBulkJob.successCount = successCount;
                currentBulkJob.failCount = failCount;
                currentBulkJob.skippedCount = skippedCount;
            }
            broadcastBulkQueueStatus();

            io.emit('bulk-sms-progress', {
                callbackId,
                current: index + 1,
                total: recipients.length,
                successCount,
                failCount,
                skippedCount,
                status: progressStatus,
                recipient: progressRecipient
            });

            if (index < recipients.length - 1 && BULK_SMS_DELAY_MS > 0) {
                await waitMs(BULK_SMS_DELAY_MS);
            }
        }

        logger.info('Bulk SMS processing completed', { successCount, failCount, skippedCount, totalRecipients: recipients.length });

        // Répondre avec le résumé
        const bulkSummary = {
            success: failCount === 0,
            callbackId,
            successCount,
            failCount,
            skippedCount,
            total: recipients.length,
            errors: errors.length > 0 ? errors : undefined,
            failedRecipients: failedRecipients.length > 0 ? failedRecipients : undefined,
            completedAt: new Date().toISOString()
        };

        storeBulkReport(bulkSummary);
        io.to(socketId).emit('bulk-sms-response', bulkSummary);
    } catch (err) {
        logger.error('Bulk SMS error', { error: err.message, callbackId });
        const bulkErrorSummary = {
            success: false,
            callbackId,
            error: err.message,
            completedAt: new Date().toISOString()
        };
        storeBulkReport(bulkErrorSummary);
        io.to(socketId).emit('bulk-sms-response', bulkErrorSummary);
    }
}

// Socket.io handlers for WebSocket communication
io.on('connection', (socket) => {
    logger.info('Socket.io client connected', { socketId: socket.id });
    startAutoUnreadSync();
    socket.emit('bulk-queue-status', getBulkQueueSnapshot());

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

    // Handle bulk SMS sending via WebSocket: queue the job, the shared worker processes it
    socket.on('bulk-sms', (data) => {
        enqueueBulkSmsJob(socket, data);
    });

    socket.on('disconnect', () => {
        logger.info('Socket.io client disconnected', { socketId: socket.id });
        stopAutoUnreadSyncIfNoClients();
    });
});

async function bootstrapServer() {
    try {
        await ensureSchedulingTables();
        await refreshSchedulingSchemaCompatibilityMetadata();
        logger.info('Scheduling tables initialized');
    } catch (err) {
        logger.error('Scheduling tables initialization failed', { error: err.message });
    }

    startScheduledJobsRunner();
    processDueScheduledJobs().catch((err) => {
        logger.error('Initial scheduled jobs poll failed', { error: err.message });
    });

    server.listen(3000, '0.0.0.0', () => logger.info('Server started', { port: 3000, host: '0.0.0.0' }));
}

bootstrapServer();