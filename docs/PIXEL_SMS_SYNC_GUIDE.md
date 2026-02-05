# 📱 Guide : Synchroniser les SMS du Pixel 2

## 🎯 Fonctionnalité

Ce système permet de :
- ✅ Connecter un téléphone Pixel 2 via USB
- ✅ Récupérer automatiquement les SMS non lus
- ✅ Identifier les participants par leur numéro de téléphone
- ✅ Marquer les SMS inconnus comme "Inconnu"
- ✅ Importer directement dans la base de données
- ✅ Synchroniser en temps réel via WebSocket

## 📥 Installation d'ADB

### Windows

#### Étape 1 : Télécharger Android SDK Platform Tools

1. Allez sur : https://developer.android.com/studio/releases/platform-tools
2. Cliquez sur "Download SDK Platform-Tools for Windows"
3. Extrayez le fichier ZIP dans un dossier (ex: `C:\android-sdk`)

#### Étape 2 : Ajouter ADB au PATH (Optionnel mais recommandé)

1. Ouvrez "Variables d'environnement système"
   - Tapez `env` dans la recherche Windows
   - Cliquez "Éditer les variables d'environnement du système"

2. Cliquez "Variables d'environnement..."

3. Sous "Variables utilisateur", cliquez "Nouveau..."
   - Nom : `ANDROID_HOME`
   - Valeur : `C:\android-sdk`

4. Modifiez la variable `Path` et ajoutez : `C:\android-sdk\platform-tools`

5. Ouvrez PowerShell et testez :
   ```powershell
   adb version
   ```
   Si cela affiche une version, c'est configuré ✅

#### Étape 3 : Alternative - Utiliser directement le chemin complet

Si vous ne voulez pas modifier PATH, utilisez le chemin complet :

```powershell
C:\android-sdk\platform-tools\adb devices
```

### macOS

```bash
# Avec Homebrew
brew install android-platform-tools

# Ou télécharger directement et ajouter au PATH
# Télécharger: https://developer.android.com/studio/releases/platform-tools
unzip ~/Downloads/platform-tools-latest-darwin.zip
mv ~/Downloads/platform-tools ~/android-sdk
export PATH="~/android-sdk:$PATH"
```

### Linux

```bash
# Avec apt (Ubuntu/Debian)
sudo apt-get install android-tools-adb

# Ou télécharger directement
wget https://developer.android.com/studio/releases/platform-tools
unzip platform-tools-latest-linux.zip
mv platform-tools ~/android-sdk
export PATH="~/android-sdk:$PATH"
```

## 📱 Configuration du Pixel 2

### Étape 1 : Activer le débogage USB

1. Ouvrez **Paramètres** > **À propos du téléphone**
2. Appuyez 7 fois sur **Numéro de build** pour activer le mode développeur
3. Allez dans **Système** > **Options de développeur**
4. Activez **Débogage USB**
5. Connectez le téléphone via USB à l'ordinateur

### Étape 2 : Autoriser l'ordinateur

Quand vous connectez le téléphone, une notification s'affiche :
- **"Autoriser l'accès aux données de cet appareil ?"**
- Appuyez sur **"Autoriser"**

### Étape 3 : Vérifier la connexion

```powershell
# Exécutez depuis le répertoire backend
adb devices

# Vous devriez voir :
# List of attached devices
# FA8XX1XXXXX        device
```

Si le statut est **"device"** au lieu de **"offline"**, la connexion est ✅

## 🚀 Utilisation

### Via l'API

#### 1. Vérifier la connexion du Pixel 2

```bash
curl -X GET http://localhost:3000/pixel/device-status \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Réponse :
```json
{
    "connected": true,
    "message": "Pixel 2 connecté"
}
```

#### 2. Synchroniser TOUS les SMS

```bash
curl -X POST http://localhost:3000/pixel/sync-sms \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Réponse :
```json
{
    "success": true,
    "message": "Synchronisation complète: 5 importés, 2 existants, 0 erreurs",
    "inserted": 5,
    "skipped": 2,
    "errors": 0,
    "total": 7
}
```

#### 3. Synchroniser UNIQUEMENT les SMS non lus

```bash
curl -X POST http://localhost:3000/pixel/sync-unread-only \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Réponse :
```json
{
    "success": true,
    "message": "3 SMS non lus importés, 1 existant",
    "inserted": 3,
    "skipped": 1,
    "total": 4
}
```

### Via le Frontend

Créez des boutons dans le panel "SMS Reçus" :

```html
<button class="btn btn-success" onclick="syncPixelSMS()">📱 Sync Pixel 2</button>
```

```javascript
function syncPixelSMS() {
    $.ajax({
        url: `${API_URL}/pixel/sync-sms`,
        type: 'POST',
        headers: { 'Authorization': `Bearer ${authToken}` },
        beforeSend: function() {
            alert('Synchronisation en cours... (assurez-vous que le Pixel 2 est connecté)');
        },
        success: function(data) {
            alert(`✅ ${data.message}`);
            loadReceivedSMS(); // Recharger la liste
        },
        error: function() {
            alert('❌ Erreur: Pixel 2 non connecté ou erreur ADB');
        }
    });
}
```

## 🔍 Processus de Synchronisation

### Étape 1 : Récupération des SMS
```
📱 Pixel 2
    ↓
[ADB Query] (adb shell content query --uri content://sms/inbox)
    ↓
Liste des SMS bruts
```

### Étape 2 : Parsing
```
SMS Brut: Row: 0 _id=1234, address=5145550001, body=Bonjour!, date=1234567890, type=1, read=0
    ↓
Parse → {address, body, date, type, read}
```

### Étape 3 : Identification du Participant
```
Numéro: 514-555-0001
    ↓
[Recherche dans Participants]
    ↓
Trouvé: Alice Martin (Id=1) ✅
    OU
Introuvable → ParticipantId = NULL, Affichage = "Inconnu" ⚠️
```

### Étape 4 : Insertion dans ReceivedSMS
```sql
INSERT INTO ReceivedSMS (
    ParticipantId, 
    Message, 
    SenderNumber, 
    IsRead, 
    ReceivedDate
) VALUES (
    1,                           -- Alice Martin
    "Bonjour!",                 -- Message du SMS
    "+1 514 555-0001",          -- Numéro original
    0,                          -- Non lu
    "2024-01-12 10:30:45"       -- Date du SMS
)
```

### Étape 5 : Notification en Temps Réel
```
[WebSocket] → io.emit('new-sms', {...})
    ↓
Frontend se met à jour automatiquement
```

## 📊 Logs et Débogage

### Logs du serveur

Quand vous synchronisez, le serveur affiche :

```
📱 Démarrage de la synchronisation des SMS...
✅ Appareil connecté: FA8XX1XXXXX
📨 7 SMS trouvés
✅ SMS importé: Alice Martin (+1 514 555-0001)
✅ SMS importé: Bob Dupont (+1 514 555-0002)
⏭️  SMS déjà existant: +1 514 555-0003
✅ SMS importé: Inconnu (+1 514 555-0999)

📊 Résultats: 5 importés, 2 existants, 0 erreurs
```

### Vérifier les SMS dans la BDD

```sql
-- Voir tous les SMS synchronisés
SELECT r.Id, 
       IFNULL(CONCAT(p.Prenom, ' ', p.NomDeFamille), 'Inconnu') as Participant,
       r.SenderNumber,
       r.Message,
       r.IsRead,
       r.ReceivedDate
FROM ReceivedSMS r
LEFT JOIN Participants p ON r.ParticipantId = p.Id
ORDER BY r.ReceivedDate DESC;

-- Voir les SMS "Inconnu" (ParticipantId = NULL)
SELECT * FROM ReceivedSMS 
WHERE ParticipantId IS NULL
ORDER BY ReceivedDate DESC;
```

## 🐛 Dépannage

### Erreur : "adb: command not found"

**Solution** : Ajoutez ADB au PATH ou utilisez le chemin complet

```powershell
# Windows
C:\android-sdk\platform-tools\adb devices

# macOS/Linux
~/android-sdk/adb devices
```

### Erreur : "No devices found"

**Causes possibles** :

1. ❌ Pixel 2 non connecté via USB
   → Connectez via un câble USB de bonne qualité

2. ❌ Débogage USB non activé
   → Allez dans Paramètres > Options de développeurs > Débogage USB

3. ❌ Appareil non autorisé
   → Acceptez la notification sur le téléphone

4. ❌ Driver USB manquant (Windows)
   → Installez les drivers : https://developer.android.com/studio/run/win-usb

Testez avec :
```powershell
adb kill-server
adb devices
```

### Erreur : "read: permission denied"

**Solution** : 
- Linux/macOS : `sudo adb devices`
- Windows : Exécutez PowerShell en administrateur

### Les SMS ne se synchronisent pas

**Causes** :

1. ❌ Pas de permission pour lire les SMS sur le téléphone
   → Vérifiez que vous avez autorisé l'accès aux données

2. ❌ La table ReceivedSMS n'existe pas
   → Exécutez la migration : `database/unread-sms-migration.sql`

3. ❌ Erreur de base de données
   → Vérifiez les logs du serveur

## 📋 Commandes ADB Utiles

```bash
# Lister les appareils
adb devices

# Afficher les SMS bruts
adb shell content query --uri content://sms/inbox

# Afficher UNIQUEMENT les SMS non lus
adb shell content query --uri content://sms/inbox --where "read=0"

# Lister les colonnes disponibles
adb shell content query --uri content://sms/inbox --projection "*"

# Ouvrir shell interactif
adb shell

# Copier des fichiers du téléphone
adb pull /path/to/file .
```

## 🔐 Sécurité

### Points importants :

1. ✅ Authentification JWT requise pour tous les endpoints `/pixel/*`
2. ✅ Logs : Chaque synchronisation enregistre l'utilisateur
3. ✅ Validation : Vérification de l'existence du participant
4. ✅ Doublons : Les SMS existants ne sont pas importés deux fois

### Données sensibles :

Les SMS contiennent des données sensibles. Assurez-vous :

- ✅ Certificat SSL/HTTPS en production
- ✅ Authentification forte (mot de passe robuste)
- ✅ Sauvegarde régulière de la base de données
- ✅ Gestion des accès : Seuls les admins peuvent synchroniser

## 💡 Cas d'Usage

### 1. Synchronisation Automatique Régulière

```javascript
// Tous les 5 minutes en arrière-plan
setInterval(async () => {
    await fetch('/pixel/sync-unread-only', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${authToken}` }
    });
}, 5 * 60 * 1000);
```

### 2. Synchronisation au Démarrage de l'App

```javascript
// Quand l'utilisateur se connecte
function initApp() {
    // ... code existant ...
    
    // Sync SMS du Pixel 2
    $.ajax({
        url: `${API_URL}/pixel/sync-unread-only`,
        type: 'POST',
        headers: { 'Authorization': `Bearer ${authToken}` },
        success: () => console.log('✅ SMS synchronisés')
    });
}
```

### 3. Notifications Visuelles

```javascript
// Ajouter un indicateur de synchronisation
socket.on('sms-sync-complete', (result) => {
    $('#syncStatus').html(`
        ✅ Dernière sync: ${new Date().toLocaleTimeString()}
        (${result.inserted} importés)
    `);
});
```

## 📞 Support

Pour des questions ou problèmes supplémentaires :
- Vérifiez les logs du serveur
- Testez `adb devices` manuellement
- Consultez [UNREAD_SMS_GUIDE.md](UNREAD_SMS_GUIDE.md)
