const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const utils = require('../frontend/js/utils');

function createApp(elements = {}) {
    function App() {}
    const document = {
        querySelector: selector => elements[selector] || null,
        querySelectorAll: selector => selector === '#archiveContactsList > .card' ? (elements.cards || []) : [],
        addEventListener() {}
    };
    const notifications = [];
    const context = {
        cpaSmsApp: App,
        document,
        localStorage: { getItem: key => key === 'archive.favoriteContactKeys' ? '["participant_1"]' : null },
        notificationManager: {
            success: message => notifications.push(message),
            error: message => notifications.push(message)
        },
        confirm: () => true,
        setTimeout() {},
        console,
        ...utils
    };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../frontend/js/sms-module.js'), 'utf8'), context);
    const app = new App();
    app.state = {};
    app._updateArchiveSelectionUI = () => {};
    return { app, notifications };
}

test('default archive order follows latest date, not unread or favorite status', () => {
    const list = { innerHTML: '', querySelectorAll: () => [] };
    const { app } = createApp({ '#archiveContactsList': list });
    app._renderArchive([
        { ParticipantId: 1, Prenom: 'Ancien', NomDeFamille: 'Contact', type: 'received', IsRead: 0, createdAt: '2024-01-01', Message: 'ancien' },
        { ParticipantId: 2, Prenom: 'Recent', NomDeFamille: 'Contact', type: 'sent', createdAt: '2025-01-01', Message: 'recent' }
    ]);
    assert.ok(list.innerHTML.indexOf('data-contact-key="participant_2"') < list.innerHTML.indexOf('data-contact-key="participant_1"'));
});

test('archive filters and sorting apply together', () => {
    const cards = [
        { dataset: { lastTs: '100', unreadCount: '2', favorite: '1', name: 'Alain' }, style: {}, getAttribute: name => ({ 'data-last-ts': '100', 'data-search-text': 'alain' })[name] },
        { dataset: { lastTs: '200', unreadCount: '0', favorite: '0', name: 'Zoé' }, style: {}, getAttribute: name => ({ 'data-last-ts': '200', 'data-search-text': 'zoé' })[name] }
    ];
    const ordered = [];
    const list = { querySelectorAll: () => cards, appendChild: card => ordered.push(card) };
    const filter = { value: 'unread' };
    const sort = { value: 'oldest' };
    const { app } = createApp({ '#archiveContactsList': list, '#archiveFilter': filter, '#archiveSort': sort, cards });
    app._applyArchiveSearchFilter();
    assert.equal(cards[0].style.display, '');
    assert.equal(cards[1].style.display, 'none');
    app._sortArchiveContacts();
    assert.equal(ordered[0], cards[0]);
    ordered.length = 0;
    sort.value = 'newest';
    app._sortArchiveContacts();
    assert.equal(ordered[0], cards[1]);
    filter.value = 'favorites';
    app._applyArchiveSearchFilter();
    assert.equal(cards[0].style.display, '');
    assert.equal(cards[1].style.display, 'none');
});

test('mark all read calls the global endpoint and refreshes the archive', async () => {
    const button = { disabled: false };
    const { app, notifications } = createApp({ '#archiveMarkAllRead': button });
    let refreshed = false;
    app.api = { markAllSmsRead: async () => ({ affectedRows: 3 }) };
    app.loadArchive = async () => { refreshed = true; };
    await app._markAllArchiveRead();
    assert.equal(refreshed, true);
    assert.equal(button.disabled, false);
    assert.match(notifications[0], /3 SMS/);
});