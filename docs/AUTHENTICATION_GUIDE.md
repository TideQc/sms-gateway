# 🔐 Guide d'Authentification SMS Gateway

## Vue d'ensemble

L'authentification sécurisée a été intégrée au SMS Gateway avec:
- ✅ JWT (JSON Web Tokens) pour les sessions
- ✅ Bcrypt pour le hachage des mots de passe
- ✅ Stockage localStorage des tokens
- ✅ Protection de toutes les routes API
- ✅ Page de connexion responsive

---

## 1️⃣ Installation des dépendances

D'abord, installez les nouveaux packages:

```bash
cd backend
npm install
```

Cela installera:
- `bcrypt`: Hachage sécurisé des mots de passe
- `jsonwebtoken`: Gestion des tokens JWT

---

## 2️⃣ Configuration de la base de données

La table `Utilisateurs` est déjà créée avec cette structure:

```sql
CREATE TABLE `Utilisateurs` (
    `Id` INT(11) NOT NULL AUTO_INCREMENT,
    `Username` VARCHAR(50) NULL DEFAULT NULL COLLATE 'utf8mb4_general_ci',
    `Password` VARCHAR(150) NULL DEFAULT NULL COLLATE 'utf8mb4_general_ci',
    `Email` VARCHAR(255) NULL DEFAULT NULL COLLATE 'utf8mb4_general_ci',
    `CreatedDate` INT(10) NULL DEFAULT NULL,
    `LastLoginDate` INT(10) NULL DEFAULT NULL,
    PRIMARY KEY (`Id`) USING BTREE,
    UNIQUE INDEX `Username` (`Username`) USING BTREE,
    UNIQUE INDEX `Email` (`Email`) USING BTREE
)
COLLATE='utf8mb4_general_ci'
ENGINE=InnoDB;
```

---

## 3️⃣ Créer les premiers utilisateurs

### Étape 1: Générer un hash de mot de passe

```bash
cd backend
node hash-password.js "votre_mot_de_passe_ici"
```

Exemple:
```bash
node hash-password.js "SecurePassword123!"
```

Vous recevrez un hash similaire à:
```
$2b$10$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ
```

### Étape 2: Insérer l'utilisateur en base de données

```sql
INSERT INTO Utilisateurs (Username, Password, Email, CreatedDate) 
VALUES ('admin', '$2b$10$...hash_généré...', 'admin@cardio.com', UNIX_TIMESTAMP());
```

Exemple complet:
```sql
INSERT INTO Utilisateurs (Username, Password, Email, CreatedDate) 
VALUES (
    'admin', 
    '$2b$10$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ',
    'admin@cardio.com', 
    UNIX_TIMESTAMP()
);
```

---

## 4️⃣ Configuration du serveur

Le fichier `.env` doit contenir une clé JWT_SECRET:

```env
DB_HOST=localhost
DB_USER=root
DB_PASS=votre_mot_de_passe
DB_NAME=cardio_plein_air

JWT_SECRET=votre_clé_secrète_très_longue_et_aléatoire

PIXEL_IP=192.168.x.x
PIXEL_PORT=8080
PIXEL_USER=user
PIXEL_PASS=pass
```

⚠️ **IMPORTANT**: Changez `JWT_SECRET` avec une clé aléatoire longue dans la production!

Vous pouvez générer une clé secrète avec:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 5️⃣ Endpoints d'authentification

### Login
**POST** `/login`

```javascript
{
    "username": "admin",
    "password": "SecurePassword123!"
}
```

Réponse réussie:
```javascript
{
    "success": true,
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "username": "admin",
    "message": "Connecté avec succès"
}
```

### Logout
**POST** `/logout`

Header requis:
```
Authorization: Bearer <token>
```

### Vérifier le token
**GET** `/verify-token`

Header requis:
```
Authorization: Bearer <token>
```

---

## 6️⃣ Utilisation du frontend

### Flux d'authentification

1. **L'utilisateur accède à la page**: Le frontend vérifie s'il existe un token en localStorage
2. **Token invalide/absent**: Affichage de la page de connexion
3. **L'utilisateur se connecte**: 
   - Soumission du formulaire avec username/password
   - Réception du token JWT
   - Stockage du token en localStorage
   - Affichage de l'app principale
4. **Chaque requête API**: Inclut le header `Authorization: Bearer <token>`
5. **Déconnexion**: Suppression du token du localStorage et rechargement

### Stockage du token

Le token est stocké en localStorage:
```javascript
localStorage.setItem('authToken', token);
localStorage.setItem('username', username);
```

### Réauthentification automatique

À chaque visite, le frontend vérifie automatiquement le token avec `/verify-token`.

---

## 7️⃣ Routes protégées

Les endpoints suivants nécessitent un token JWT valide:

- `GET /participants` - Liste des participants
- `GET /send-status` - Statut d'envoi
- `GET /participant-history/:id` - Historique d'un participant
- `POST /send-bulk` - Envoi de messages SMS
- `POST /logout` - Déconnexion

---

## 8️⃣ Sécurité - Bonnes pratiques

### ✅ À faire

- ✅ Utilisez HTTPS en production (pas de HTTP)
- ✅ Stockez JWT_SECRET dans `.env` (jamais en dur dans le code)
- ✅ Régénérez JWT_SECRET tous les 6 mois
- ✅ Utilisez des mots de passe forts (min 12 caractères)
- ✅ Hachez tous les mots de passe avec bcrypt (rounds: 10)
- ✅ Mettez à jour LastLoginDate lors de chaque connexion

### ❌ À éviter

- ❌ Ne stockez jamais le mot de passe en clair
- ❌ N'exposez jamais le JWT_SECRET en frontend
- ❌ N'utilisez pas HTTP en production
- ❌ Ne faites pas expirer les tokens trop tard (recommandé: 24h)
- ❌ N'oubliez pas de vérifier les tokens sur chaque route protégée

---

## 9️⃣ Gestion des tokens

### Durée de vie (ttl)

Actuellement définie à **24 heures**:

```javascript
{ expiresIn: '24h' }
```

Pour modifier (en minutes ou heures):
```javascript
{ expiresIn: '12h' }    // 12 heures
{ expiresIn: '7d' }     // 7 jours
{ expiresIn: 3600 }     // 3600 secondes
```

### Renouvellement

L'utilisateur doit se reconnecter après expiration du token.

Pour implémenter un "refresh token" (optionnel):
1. Générez un refresh token avec une durée plus longue
2. Stockez-le en base de données
3. Permettez au frontend de renouveler le JWT sans se reconnecter

---

## 🔟 Dépannage

### ❌ "Token invalide"
- Vérifiez que le header `Authorization` est correct
- Format: `Bearer <token>` (avec un espace)
- Vérifiez que JWT_SECRET est le même entre génération et vérification

### ❌ "Token manquant"
- Vérifiez que le header `Authorization` est envoyé
- Le frontend stocke-t-il le token correctement?

### ❌ "Identifiants invalides"
- Vérifiez le username et password en base de données
- Utilisez `node hash-password.js` pour générer un nouveau hash

### ❌ La page de connexion s'affiche indéfiniment
- Vérifiez la console du navigateur pour les erreurs CORS
- Vérifiez que l'API_URL est correcte
- Vérifiez que le serveur Node.js est démarré

---

## 📋 Checklist de déploiement

- [ ] JWT_SECRET généré et stocké en `.env`
- [ ] Au moins 1 utilisateur créé en base de données
- [ ] npm install exécuté
- [ ] HTTPS configuré (en production)
- [ ] Mots de passe testés et fonctionnels
- [ ] Page de login responsive testée sur mobile
- [ ] Token localStorage fonctionne
- [ ] Déconnexion fonctionne
- [ ] Les endpoints protégés refusent l'accès sans token

---

## 🆘 Support

En cas de problème:

1. Vérifiez les logs du serveur Node.js
2. Vérifiez la console du navigateur (F12)
3. Vérifiez que la base de données est accessible
4. Vérifiez les permissions MySQL sur la table `Utilisateurs`
5. Assurez-vous que bcrypt et jsonwebtoken sont installés

---

**Version**: 1.0  
**Date**: Janvier 2026  
**Auteur**: SMS Gateway Team
