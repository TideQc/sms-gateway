# 📖 GUIDE D'UTILISATION - cpaSmsApp

## 🎯 Vue d'Ensemble

`cpaSmsApp` est une classe ES6 qui encapsule toute la logique de l'application SMS Gateway. Elle utilise une architecture modulaire avec des sous-objets pour chaque domaine fonctionnel.

---

## 🚀 Initialisation

### Démarrer l'application

```javascript
// Créer une instance
const app = new cpaSmsApp('#app');

// Initialiser
await app.init();

// Accessible globalement pour déboguer
window.cpaSmsApp = app;
```

### Variables d'environnement

Modifier `js/config.js` pour changer l'API URL :

```javascript
const CONFIG = {
    API_URL: "http://localhost:3000", // Changer ici
    // ... autres config
};
```

---

## 📚 Modules et APIs

### 1. `state` - Gestion d'état globale

```javascript
// Accéder à l'état
app.state.user                      // { username: 'john' }
app.state.authToken                 // 'eyJhbGc...'
app.state.isLoggedIn                // true
app.state.selectedParticipants      // { id: { name, phone }, ... }
app.state.allParticipants           // Tableau complet
app.state.dataTable                 // Instance DataTables
app.state.socket                    // Socket.io instance
app.state.filters                   // { parc: [], type: [], coach: [] }
```

### 2. `api` - Appels API REST

```javascript
// Login
const loginResult = await app.api.login('username', 'password');
// Returns: { success: true, token: '...', username: '...' }

// Verify token
const tokenResult = await app.api.verifyToken();
// Returns: { success: true }

// Get participants
const participants = await app.api.getParticipants();
// Returns: [{ Id, Prenom, NomDeFamille, NumeroTel, ... }]

// Get unread SMS
const unreadSMS = await app.api.getUnreadSMS();
// Returns: [{ Id, Message, SenderNumber, ReceivedDate, ... }]

// Get SMS archive
const archive = await app.api.getArchive();
// Returns: [{ type: 'sent'|'received', Message, ... }]

// Send bulk SMS
const result = await app.api.sendBulkSMS(message, { ids: [...] });
// Or: await app.api.sendBulkSMS(message, { phones: [...] });

// Mark SMS as read
await app.api.markSMSRead(smsId);

// Mark conversation as read
await app.api.markConversationRead(contactKey);

// Import Excel
const importResult = await app.api.importExcel(fileObject);
// Returns: { successCount, errorCount, errors: [...] }

// Check Pixel status
const pixelStatus = await app.api.checkPixelStatus();
// Returns: { connected: true|false }
```

### 3. `ui` - Rendu DOM

```javascript
// Rendre login
const loginForm = app.ui.renderLogin();
// Injecte HTML login et retourne l'élément form

// Rendre app principale
app.ui.renderApp();
// Injecte l'app complète

// Afficher loader
app.ui.showLoader('Chargement des données...');

// Masquer loader
app.ui.hideLoader();
```

### 4. `login` - Authentification

```javascript
// Handle submit
const result = await app.login.handleSubmit('username', 'password');
// Vérifie les identifiants et initialise l'app si succès
```

### 5. `participants` - Gestion des participants

```javascript
// Charger participants
const participants = await app.participants.load();
// Charge les participants et crée la DataTable

// Sélectionner un participant
app.participants.select(participantId, 'Jean Dupont', '+15141234567');
// Ajoute à selectedParticipants

// Désélectionner
app.participants.deselect(participantId);
// Retire de selectedParticipants

// Nombre sélectionnés
const count = app.participants.getSelectedCount();
// Returns: 5
```

### 6. `sms` - Gestion des SMS

```javascript
// Charger SMS reçus
const receivedSMS = await app.sms.loadReceived();
// Affiche les SMS non lus

// Charger archive
const archive = await app.sms.loadArchive();
// Affiche toutes les conversations

// Envoyer réponse rapide
await app.sms.sendQuickReply('Merci !', '+15141234567');
// Envoie un SMS au numéro spécifié
```

---

## 🔌 WebSocket - Communication Temps Réel

### Émettre des événements

```javascript
const socket = app.state.socket;

// Envoyer un SMS via WebSocket
socket.emit('send-sms-quick', {
    message: 'Texte du message',
    phone: '+15141234567',
    safeId: 'contact_id',
    callbackId: 'unique-id'
});

// Envoyer des SMS en masse
socket.emit('send-bulk-sms', {
    message: 'Texte du message',
    ids: ['id1', 'id2', ...],
    isManual: false
});
```

### Écouter les événements

```javascript
const socket = app.state.socket;

// Progression d'envoi
socket.on('progress', (data) => {
    console.log(`${data.actuel} / ${data.total}`);
    // data.details = { participantId: 'succès'|'erreur', ... }
});

// Envoi terminé
socket.on('finish', () => {
    console.log('Envoi terminé !');
});

// Nouveau SMS reçu
socket.on('new-sms', (data) => {
    console.log(`Nouveau SMS de ${data.SenderNumber}`);
});

// Réponse à un SMS
socket.on('sms-sent', (data) => {
    if (data.success) {
        console.log('SMS envoyé !');
    } else {
        console.error('Erreur:', data.error);
    }
});
```

---

## 🔔 Notifications

Utiliser le système de notifications :

```javascript
// Types : 'success', 'error', 'info'
showNotification('Message envoyé !', 'success', 3000);
showNotification('Erreur lors du chargement', 'error', 5000);
showNotification('Synchronisation en cours...', 'info', 2000);

// Shortcuts
notificationManager.success('Succès !');
notificationManager.error('Erreur !');
notificationManager.info('Info');
```

---

## 🛠️ Utilitaires

### Fonctions helper

```javascript
import { 
    formatDateEST, 
    escapeHtml, 
    normalizePhone, 
    debounce, 
    isElementVisible, 
    getSafeId 
} from './utils.js';

// Format date
const dateStr = formatDateEST('2024-01-19T10:30:00Z');
// Returns: "19/01/2024 05:30:00"

// Escape HTML
const safe = escapeHtml('<script>alert("xss")</script>');
// Returns: "&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;"

// Normalize phone
const normalized = normalizePhone('+1 514 123-4567');
// Returns: "5141234567"

// Debounce function
const debouncedSearch = debounce((query) => {
    app.api.searchParticipants(query);
}, 500);

// Check visibility
if (isElementVisible(document.querySelector('#element'))) {
    // Element is visible
}

// Safe ID for DOM
const safeId = getSafeId('Contact: +1514-123-4567');
// Returns: "Contact_15141234567"
```

---

## 🧪 Exemples Pratiques

### Exemple 1 : Sélectionner tous les participants d'un parc

```javascript
app.state.allParticipants
    .filter(p => p.Parc === 'Parc Lafontaine')
    .forEach(p => {
        app.participants.select(p.Id, `${p.Prenom} ${p.NomDeFamille}`, p.NumeroTel);
    });

console.log(`Sélectionnés : ${app.participants.getSelectedCount()}`);
```

### Exemple 2 : Envoyer un SMS bulk

```javascript
const message = 'Bonjour, nouvel horaire ce samedi !';

const result = await app.api.sendBulkSMS(message, {
    ids: Object.keys(app.state.selectedParticipants)
});

showNotification(`SMS envoyé à ${result.sent} personnes`, 'success');
```

### Exemple 3 : Recherche en temps réel

```javascript
const searchInput = document.querySelector('#customSearch');

searchInput.addEventListener('input', debounce((e) => {
    const query = e.target.value.toLowerCase();
    
    const filtered = app.state.allParticipants.filter(p =>
        p.Prenom.toLowerCase().includes(query) ||
        p.NomDeFamille.toLowerCase().includes(query) ||
        p.NumeroTel.includes(query)
    );
    
    console.log(`Trouvés : ${filtered.length} participants`);
}, 300));
```

### Exemple 4 : Export données

```javascript
function exportParticipants() {
    const csv = [
        ['Nom', 'Téléphone', 'Parc', 'Coach'],
        ...app.state.allParticipants.map(p => [
            `${p.Prenom} ${p.NomDeFamille}`,
            p.NumeroTel,
            p.Parc,
            p.NomEntraineur
        ])
    ];
    
    const csvString = csv.map(row => row.join(',')).join('\n');
    const blob = new Blob([csvString], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = 'participants.csv';
    link.click();
}

exportParticipants();
```

---

## 🐛 Déboggage

### Inspecter l'état

```javascript
console.log(window.cpaSmsApp.state);
// Affiche l'état complet de l'app
```

### Logs détaillés

```javascript
// Activer les logs WebSocket
window.cpaSmsApp.state.socket.onAny((event, ...args) => {
    console.log(`[Socket] ${event}:`, args);
});
```

### Forcer un reload

```javascript
// Recharger les participants
await window.cpaSmsApp.participants.load();

// Recharger les SMS
await window.cpaSmsApp.sms.loadReceived();
await window.cpaSmsApp.sms.loadArchive();
```

---

## ⚠️ Gestion d'Erreurs

```javascript
try {
    const participants = await app.api.getParticipants();
} catch (err) {
    console.error('Erreur:', err.message);
    showNotification('Erreur lors du chargement', 'error');
}
```

---

## 🔐 Sécurité

- Les tokens sont stockés dans `localStorage`
- Les requêtes incluent automatiquement l'header `Authorization: Bearer {token}`
- Les données sensibles ne sont jamais loggées
- L'HTML généré est échappé avec `escapeHtml()`

---

## 📱 Responsive

L'app adapte automatiquement :
- **Desktop** (> 992px) - Vue complète
- **Tablet** (768px - 992px) - Vue adaptée
- **Mobile** (< 768px) - Vue compacte
- **Landscape** - Optimisé hauteur réduite

Pas besoin d'actions spéciales - le CSS responsive gère tout.

---

## 📦 Dépendances Externes

- **jQuery** - Manipulation DOM (à remplacer par Vanilla JS si souhaité)
- **Bootstrap 5** - Framework CSS
- **DataTables** - Tableaux interactifs
- **Socket.io** - Communication temps réel

Toutes les dépendances sont optionnelles et peuvent être remplacées.

---

## 🚀 Performance

### Optimisations incluses

- CSS séparé et cachable par navigateur
- DataTables avec pagination (25 lignes par défaut)
- Debounce sur la recherche
- Lazy loading des SMS archive
- WebSocket pour communication temps réel

### Conseils pour améliorer

```javascript
// Utiliser requestAnimationFrame pour les animations
requestAnimationFrame(() => {
    // Update DOM
});

// Virtualiser les listes longues
// Minifier le CSS/JS en production
// Compresser les images
// Utiliser un CDN pour les librairies
```

---

## 📞 Support

Pour des questions sur l'implémentation, voir :
- `REFACTORING_SUMMARY.md` - Résumé de la refactorisation
- `MIGRATION_GUIDE.md` - Guide de migration
- `FICHIERS_CREES.md` - Liste complète des fichiers

---

**Bonne utilisation ! 🎉**
