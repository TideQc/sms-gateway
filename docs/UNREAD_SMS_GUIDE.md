# SMS Non Lus - Guide d'Utilisation

## 🎯 Fonctionnalité

Ce système permet de :
- ✅ Afficher une **icône SMS non lus** pour chaque participant dans la liste
- ✅ Voir le **nombre de SMS reçus non lus** en badge pulsant
- ✅ Consulter tous les **SMS reçus** dans un onglet dédié
- ✅ **Marquer les SMS comme lus** après consultation
- ✅ Recevoir les SMS en **temps réel** via WebSocket

## 📱 Affichage des SMS Non Lus

### Dans le tableau des participants

Chaque participant affiche :
- 🚫 **Badge rouge pulsant avec icône 📨** → SMS non lus (avec le nombre)
- ✅ **Badge vert** → Pas de SMS non lus

Exemple :
```
Nom              | Téléphone       | SMS
Alice Martin     | +1 514 555-0001 | 📨 3  (3 SMS non lus)
Bob Dupont       | +1 514 555-0002 | ✓    (Aucun SMS non lus)
```

### Onglet "SMS Reçus"

Un nouvel onglet `📨 SMS Reçus` affiche :
- Tous les SMS reçus des participants
- **Nombre de SMS non lus** en badge rouge
- Carte de SMS avec :
  - 👤 Nom du participant
  - 📞 Numéro de téléphone
  - 📝 Contenu du message
  - 📅 Date et heure de réception
  - ✓ Bouton pour marquer comme lu

## 🔧 Installation

### 1. Créer la table de base de données

Exécutez cette requête SQL dans votre MySQL :

```sql
CREATE TABLE IF NOT EXISTS `ReceivedSMS` (
    `Id` INT PRIMARY KEY AUTO_INCREMENT,
    `ParticipantId` INT NOT NULL,
    `Message` LONGTEXT NOT NULL,
    `SenderNumber` VARCHAR(20) NULL,
    `IsRead` TINYINT DEFAULT 0,
    `ReceivedDate` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `ReadDate` TIMESTAMP NULL,
    `CreatedAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`ParticipantId`) REFERENCES `Participants`(`Id`) ON DELETE CASCADE,
    INDEX `idx_participant_read` (`ParticipantId`, `IsRead`),
    INDEX `idx_received_date` (`ReceivedDate`)
);
```

Ou utilisez le fichier migration fourni :
```bash
# Dans votre client MySQL
mysql -u username -p database_name < database/unread-sms-migration.sql
```

### 2. Redémarrer le serveur

```bash
cd backend
node server.js
```

## 📡 API Endpoints

### Récupérer les SMS non lus

**GET** `/unread-sms`

Headers: `Authorization: Bearer {token}`

Réponse :
```json
[
    {
        "Id": 1,
        "ParticipantId": 123,
        "Message": "Bonjour, comment ça va?",
        "SenderNumber": "+1 514 555-0001",
        "IsRead": 0,
        "ReceivedDate": "2024-01-12T10:30:45Z",
        "ReadDate": null,
        "Prenom": "Alice",
        "NomDeFamille": "Martin",
        "NumeroTel": "+1 514 555-0001"
    }
]
```

### Marquer un SMS comme lu

**POST** `/mark-sms-read/:smsId`

Headers: `Authorization: Bearer {token}`

Réponse :
```json
{
    "success": true,
    "message": "SMS marqué comme lu"
}
```

### Ajouter un SMS reçu

**POST** `/add-received-sms`

Headers: `Authorization: Bearer {token}`

Body :
```json
{
    "ParticipantId": 123,
    "Message": "Bonjour!",
    "SenderNumber": "+1 514 555-0001"
}
```

## 🔄 WebSocket Events

### Événement "new-sms"

Déclenché quand un SMS est reçu :

```javascript
socket.on('new-sms', (data) => {
    console.log('SMS reçu de:', data.SenderNumber);
    // La liste des SMS est automatiquement mise à jour
});
```

## 📊 Utilisation en Production

### Intégration avec des webhooks SMS

Vous pouvez intégrer des services SMS (Twilio, AWS SNS, etc.) pour enregistrer les SMS reçus :

```javascript
// Exemple : Route webhook pour Twilio
app.post('/webhook/sms-received', async (req, res) => {
    const { From, Body, MessageSid } = req.body;
    
    // Trouver le participant par numéro
    const [participant] = await pool.query(
        'SELECT Id FROM Participants WHERE NumeroTel LIKE ?',
        [`%${From.slice(-10)}%`]
    );
    
    if (participant.length > 0) {
        // Ajouter le SMS à la base de données
        await pool.query(
            'INSERT INTO ReceivedSMS (ParticipantId, Message, SenderNumber) VALUES (?, ?, ?)',
            [participant[0].Id, Body, From]
        );
        
        // Émettre un événement en temps réel
        io.emit('new-sms', {
            ParticipantId: participant[0].Id,
            Message: Body,
            SenderNumber: From
        });
    }
    
    res.json({ success: true });
});
```

## 🎨 Personnalisation

### Modifier la couleur du badge SMS non lus

Éditer `frontend/index.html` - section CSS :

```css
.sms-unread-badge {
    background: linear-gradient(135deg, #ff4444, #ff8844); /* Modifier ces couleurs */
}
```

### Modifier la vitesse du pulse

```css
@keyframes pulse-unread {
    0%, 100% { transform: scale(1); opacity: 1; }
    50% { transform: scale(1.2); opacity: 0.8; } /* Augmenter scale pour plus de pulse */
}

.sms-unread-badge {
    animation: pulse-unread 1s infinite; /* Augmenter/diminuer pour plus/moins rapide */
}
```

## 📋 Requête SQL Utiles

### Voir tous les SMS non lus

```sql
SELECT 
    r.Id,
    p.Prenom,
    p.NomDeFamille,
    p.NumeroTel,
    COUNT(*) as UnreadCount,
    MAX(r.ReceivedDate) as LastReceived
FROM ReceivedSMS r
JOIN Participants p ON r.ParticipantId = p.Id
WHERE r.IsRead = 0
GROUP BY r.ParticipantId
ORDER BY UnreadCount DESC;
```

### Compter les SMS par participant

```sql
SELECT 
    p.Prenom,
    p.NomDeFamille,
    COUNT(CASE WHEN r.IsRead = 0 THEN 1 END) as UnreadCount,
    COUNT(*) as TotalCount
FROM Participants p
LEFT JOIN ReceivedSMS r ON p.Id = r.ParticipantId
GROUP BY p.Id
ORDER BY UnreadCount DESC;
```

### Marquer tous les SMS comme lus pour un participant

```sql
UPDATE ReceivedSMS 
SET IsRead = 1, ReadDate = NOW()
WHERE ParticipantId = ? AND IsRead = 0;
```

## 🐛 Dépannage

### Les SMS non lus ne s'affichent pas

1. Vérifiez que la table `ReceivedSMS` existe :
   ```sql
   SHOW TABLES LIKE 'ReceivedSMS';
   ```

2. Vérifiez que le serveur affiche "Serveur Prêt" dans les logs

3. Ouvrez la console du navigateur (F12) et cherchez les erreurs

### Le badge ne se met pas à jour

1. Rechargez la page (Ctrl+F5)

2. Vérifiez que WebSocket fonctionne (onglet Network)

3. Vérifiez les logs du serveur pour les erreurs

## 📞 Support

Pour des questions ou des problèmes, consultez :
- [AUTHENTICATION_GUIDE.md](AUTHENTICATION_GUIDE.md) - Guide d'authentification
- [SETUP_AUTHENTICATION.md](SETUP_AUTHENTICATION.md) - Détails techniques
