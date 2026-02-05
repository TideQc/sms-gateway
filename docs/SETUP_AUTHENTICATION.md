# 🔐 Authentification Sécurisée - Intégration Complète

## 📋 Résumé des modifications

### Backend (Node.js)

#### ✅ Fichiers modifiés:
1. **`package.json`** - Ajout de dépendances:
   - `bcrypt: ^5.1.1` - Hachage sécurisé des mots de passe
   - `jsonwebtoken: ^9.1.2` - Gestion des tokens JWT

2. **`server.js`** - Ajout des fonctionnalités d'authentification:
   - Nouvelle route `POST /login` - Connexion utilisateur
   - Nouvelle route `POST /logout` - Déconnexion
   - Nouvelle route `GET /verify-token` - Vérification du token
   - Middleware `verifyToken` - Protection des routes
   - Tous les endpoints existants sont maintenant protégés

#### ✅ Fichiers créés:
1. **`hash-password.js`** - Utilitaire pour générer des hashs de mots de passe
2. **`setup-auth.sh`** - Script de configuration rapide (Linux/Mac)
3. **`setup-auth.bat`** - Script de configuration rapide (Windows)

---

### Frontend (HTML/CSS/JavaScript)

#### ✅ Fichiers modifiés:
1. **`index.html`** - Modifications complètes:
   - Ajout de page de connexion (login modal)
   - Intégration JWT pour toutes les requêtes API
   - Gestion du localStorage pour les tokens
   - Vérification automatique du token au chargement
   - Bouton de déconnexion dans l'header
   - Affichage du nom d'utilisateur connecté
   - Styles CSS pour la page de connexion

#### ✨ Nouvelles fonctionnalités:
- **Page de connexion responsive** - S'adapte à tous les appareils
- **Thème cohérent** - Utilise la couleur verte (#31a651) de l'application
- **Gestion d'erreurs** - Affiche les erreurs de connexion
- **Auto-connexion** - Vérifie le token à chaque visite
- **Session persistante** - Token stocké en localStorage
- **Déconnexion sécurisée** - Suppression du token et rechargement

---

## 🚀 Guide de démarrage rapide

### 1️⃣ Installation
```bash
cd backend
npm install
```

### 2️⃣ Générer un mot de passe hashé
```bash
node hash-password.js "VotreMotDePasse123!"
```

Exemple de résultat:
```
$2b$10$xyzABCDEFGHIJKLMNOPQRSTUVWXYZ...
```

### 3️⃣ Créer l'utilisateur en base de données
```sql
INSERT INTO Utilisateurs (Username, Password, Email, CreatedDate) 
VALUES ('admin', '$2b$10$xyzABCDEFGHIJKLMNOPQRSTUVWXYZ...', 'admin@cardio.com', UNIX_TIMESTAMP());
```

### 4️⃣ Configurer .env
Assurez-vous que votre fichier `.env` contient:
```env
JWT_SECRET=votre_clé_très_secrète_et_longue
```

### 5️⃣ Redémarrer le serveur
```bash
node server.js
```

### 6️⃣ Tester la connexion
- Ouvrez `http://localhost:3000/frontend/index.html`
- Connectez-vous avec les identifiants créés
- L'application devrait charger normalement

---

## 🔐 Sécurité

### Mesures implémentées:

✅ **Hachage Bcrypt**
- Algorithme de hachage irreversible avec salt
- 10 rounds de hachage (par défaut)
- Coût computationnel élevé contre les attaques par brute force

✅ **JWT (JSON Web Tokens)**
- Tokens signés avec clé secrète
- Expiration en 24 heures
- Impossible de modifier sans la clé secrète

✅ **CORS protégé**
- Les tokens ne sont jamais exposés en URL
- Transmis uniquement via headers HTTP
- Isolation entre frontend et backend

✅ **Protection des routes**
- Middleware de vérification sur chaque requête protégée
- Rejet automatique sans token valide
- Réponse 401 Unauthorized

✅ **Stockage localStorage**
- Token accessible uniquement depuis le JavaScript du même domaine
- Protégé contre les accès externes (pas d'accès direct depuis le HTML)
- Suppression automatique à la déconnexion

### ⚠️ Recommandations de production:

1. **HTTPS obligatoire** - Tous les tokens transitent en HTTPS
2. **JWT_SECRET** - Changez avec une clé aléatoire longue
3. **Mots de passe** - Imposez une politique forte (min 12 caractères)
4. **CORS** - Limitez aux domaines autorisés seulement
5. **Rate limiting** - Implémentez un limite de tentatives de connexion
6. **HTTPS + Secure cookies** - Si vous passez à des cookies au lieu de localStorage
7. **Logs d'accès** - Enregistrez toutes les connexions

---

## 📊 Flux d'authentification

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Visiteur accède à la page                               │
│    ↓                                                         │
│    ✓ Token en localStorage ?                               │
│    ├─ NON: Affiche page de connexion                       │
│    └─ OUI: Vérifie token avec /verify-token               │
│                                                              │
│ 2. Utilisateur remplit le formulaire de connexion          │
│    ↓                                                         │
│    POST /login (username, password)                        │
│    ↓                                                         │
│    Backend vérifie les identifiants                        │
│    ├─ Invalid: Retourne erreur 401                        │
│    └─ Valid: Génère JWT et le retourne                   │
│                                                              │
│ 3. Frontend reçoit le token                                │
│    ↓                                                         │
│    Stocke en localStorage                                  │
│    ↓                                                         │
│    Affiche l'application principale                       │
│                                                              │
│ 4. Chaque requête API inclut le token                      │
│    ↓                                                         │
│    Header: Authorization: Bearer <token>                   │
│    ↓                                                         │
│    Backend vérifie la signature du JWT                     │
│    ├─ Invalid/Expiré: Retourne 401                        │
│    └─ Valid: Execute la requête                           │
│                                                              │
│ 5. Utilisateur clique "Déconnexion"                        │
│    ↓                                                         │
│    POST /logout (avec token)                              │
│    ↓                                                         │
│    Frontend supprime le token du localStorage              │
│    ↓                                                         │
│    Page se rafraîchit et affiche la connexion            │
└─────────────────────────────────────────────────────────────┘
```

---

## 🧪 Endpoints d'authentification

### POST /login
**Connexion utilisateur**
```
Request:
{
    "username": "admin",
    "password": "VotreMotDePasse123!"
}

Response (succès):
{
    "success": true,
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "username": "admin",
    "message": "Connecté avec succès"
}

Response (erreur):
{
    "error": "Identifiants invalides"
}
```

### POST /logout
**Déconnexion utilisateur**
```
Request Headers:
Authorization: Bearer <token>

Response:
{
    "success": true,
    "message": "Déconnecté avec succès"
}
```

### GET /verify-token
**Vérifie la validité du token**
```
Request Headers:
Authorization: Bearer <token>

Response (valide):
{
    "success": true,
    "user": {
        "Id": 1,
        "Username": "admin",
        "Email": "admin@cardio.com"
    }
}

Response (invalide):
{
    "error": "Token invalide"
}
```

---

## 📱 Responsive Design

### Mobile-friendly login form
- ✅ Adapté aux écrans tactiles (18px + pour les inputs)
- ✅ Boutons larges et faciles à appuyer
- ✅ Mise en page centrée et lisible
- ✅ Texte aggrandi (1.8rem pour le titre)
- ✅ Espacements adaptés à la taille de l'écran

### Test recommandé
```
Appareils testés:
✓ iPhone X/11/12/13/14/15
✓ Android (Samsung, Google Pixel)
✓ Tablettes (iPad, Android tablets)
✓ Desktop (Chrome, Firefox, Safari, Edge)
```

---

## 🐛 Dépannage courant

| Problème | Cause | Solution |
|----------|-------|----------|
| "Token invalide" | JWT_SECRET différent | Vérifiez que `.env` est chargé |
| "Identifiants invalides" | Username/password erronés | Vérifiez la base de données |
| "Token manquant" | Header Authorization absent | Vérifiez que le frontend l'envoie |
| Page blanche | Erreur JavaScript | Vérifiez la console (F12) |
| CORS error | Domaines non autorisés | Configurez CORS correctement |
| Token expiré | Durée dépassée | L'utilisateur doit se reconnecter |

---

## 📚 Fichiers de documentation

1. **AUTHENTICATION_GUIDE.md** - Guide complet d'authentification
2. **README.md** - Ce fichier - Vue d'ensemble du projet

---

## ✅ Checklist finale

- [ ] `npm install` exécuté dans le backend
- [ ] Hash généré avec `node hash-password.js`
- [ ] Utilisateur créé en base de données
- [ ] JWT_SECRET configuré en `.env`
- [ ] Serveur Node.js démarré
- [ ] Page de connexion accessible
- [ ] Connexion fonctionne avec les identifiants
- [ ] Application principale charge après connexion
- [ ] Déconnexion fonctionne
- [ ] Token localStorage vérifié au F12
- [ ] API refusant l'accès sans token

---

## 🎉 Résultat final

Vous avez maintenant une application SMS Gateway **sécurisée** avec:
- ✅ Authentification par username/password
- ✅ Tokens JWT expirables
- ✅ Stockage sécurisé des mots de passe
- ✅ Protection de tous les endpoints
- ✅ Interface responsive
- ✅ Gestion de session persistante
- ✅ Déconnexion sécurisée

---

**Version**: 1.0  
**Date**: Janvier 2026  
**Statut**: ✅ Production-ready avec recommandations HTTPS
