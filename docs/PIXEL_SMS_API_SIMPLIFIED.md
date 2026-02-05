# 📱 Synchronisation SMS via SMS Gateway API (Simplifié)

## 🎯 Avantage

Au lieu d'utiliser ADB (debug USB), on utilise directement l'API SMS Gateway qui est **déjà installée** sur le Pixel 2 pour envoyer les SMS. C'est :
- ✅ Plus simple (pas d'ADB à installer)
- ✅ Plus fiable (via HTTP/HTTPS)
- ✅ Identique à la route `/send-bulk` existante
- ✅ Pas de config USB/débogage requise

## ⚙️ Configuration

Vous avez probablement déjà configuré ceci pour l'envoi de SMS. Vérifiez votre `.env` :

```env
# Connexion au Pixel 2 (SMS Gateway API)
PIXEL_IP=192.168.X.X      # IP du Pixel 2 sur le réseau
PIXEL_PORT=8080           # Port de l'API SMS Gateway
PIXEL_USER=admin          # Username API
PIXEL_PASS=password       # Password API
```

## 🚀 Utilisation

### Via le bouton dans l'interface

1. Ouvrez l'application
2. Allez à **"SMS Reçus"**
3. Cliquez **"📱 SMS Non Lus"** ou **"📱 Tous les SMS"**
4. Les SMS du Pixel 2 sont importés automatiquement

### Via API

```bash
# Synchroniser uniquement les SMS non lus
curl -X POST http://localhost:3000/pixel/sync-unread-only \
  -H "Authorization: Bearer YOUR_TOKEN"

# Résultat:
# {
#   "success": true,
#   "message": "3 SMS non lus importés, 1 existant",
#   "inserted": 3,
#   "skipped": 1,
#   "total": 4
# }
```

## 📊 Fonctionnement

```
┌──────────────────────────┐
│ Pixel 2                  │
│ SMS Gateway API          │
│ (port 8080)              │
└────────┬─────────────────┘
         │ HTTP GET /messages
         │ (username + password)
         │
         ▼
┌──────────────────────────┐
│ Backend (Node.js)        │
│ pixel-sms-sync.js        │
│                          │
│ • Récupère SMS via API   │
│ • Filtre les reçus       │
│ • Cherche participants   │
│ • Insère en BDD          │
└────────┬─────────────────┘
         │
         ▼
┌──────────────────────────┐
│ Base de Données          │
│ ReceivedSMS              │
│ • ParticipantId (FK)     │
│ • Message                │
│ • SenderNumber           │
│ • IsRead                 │
└──────────────────────────┘
```

## 🔄 Format de réponse attendu

L'API SMS Gateway du Pixel 2 devrait retourner quelque chose comme :

```json
{
  "messages": [
    {
      "id": "sms_1",
      "sender": "+1 514 555 0001",
      "body": "Bonjour!",
      "timestamp": 1673548645000,
      "read": false,
      "type": 1
    },
    {
      "id": "sms_2",
      "sender": "+1 514 555 0002",
      "body": "Je suis en retard",
      "timestamp": 1673548700000,
      "read": true,
      "type": 1
    }
  ]
}
```

Le code gère plusieurs formats (sender/address, body/message/text, etc.)

## 📋 Champs supportés

Le système supporte plusieurs noms de champs :

| Champ | Variantes |
|-------|-----------|
| Numéro | sender, address, from |
| Message | body, message, text |
| Date | timestamp, date, dateTime |
| Lu | read, isRead |
| Type | type (1=reçu, 2=envoyé) |

## 🐛 Dépannage

### Erreur : "Pixel 2 non accessible"

1. **Vérifiez l'IP** :
   ```powershell
   ping 192.168.X.X
   ```

2. **Vérifiez le port** :
   ```powershell
   curl http://192.168.X.X:8080/messages
   ```

3. **Vérifiez les identifiants** dans `.env`

4. **Redémarrez le SMS Gateway** sur le Pixel 2

### Erreur : "401 Unauthorized"

Les identifiants sont incorrects :
- Changez `PIXEL_USER` et `PIXEL_PASS` dans `.env`
- Redémarrez le serveur Node

### Les SMS ne s'importent pas

1. Testez manuellement :
   ```bash
   curl -u admin:password http://192.168.X.X:8080/messages
   ```

2. Vérifiez les logs du serveur Node (affiche les détails)

3. Vérifiez que ReceivedSMS existe :
   ```sql
   SELECT COUNT(*) FROM ReceivedSMS;
   ```

## 💡 Améliorations Possibles

### 1. Synchronisation Automatique Toutes les 5 minutes

```javascript
// Dans server.js
setInterval(async () => {
    try {
        await pixelSync.syncUnreadOnly();
        io.emit('auto-sync-complete');
    } catch (error) {
        console.error('Auto-sync error:', error);
    }
}, 5 * 60 * 1000); // 5 minutes
```

### 2. Notifier quand des SMS arrivent

```javascript
// WebSocket côté frontend
socket.on('sms-sync-complete', (result) => {
    if (result.inserted > 0) {
        showNotification(`📨 ${result.inserted} SMS reçus!`);
    }
});
```

### 3. Marquer automatiquement comme lu après sync

Modifier le endpoint pour ajouter à l'API du Pixel 2 :

```javascript
// Après insertion
await axios.put(`${this.pixelUrl}/messages/${sms.id}/read`, {}, {
    auth: this.pixelAuth
});
```

## 📞 Configuration Exemple

Si votre SMS Gateway API utilise des formats différents, adaptez `pixel-sms-sync.js` :

```javascript
// Ligne 120 - Adapter à votre format
const sender = sms.sender || sms.address || sms.from || sms.number;
const body = sms.body || sms.message || sms.text || sms.content;
```

## ✅ Checklist

- [ ] IP du Pixel 2 correcte dans `.env`
- [ ] Port correct (8080 ou autre)
- [ ] Identifiants SMS Gateway corrects
- [ ] Pixel 2 sur le même réseau
- [ ] Firewall permet la connexion
- [ ] Table ReceivedSMS existe
- [ ] Serveur Node redémarré après `.env`

Voilà ! C'est beaucoup plus simple que ADB 🎉
