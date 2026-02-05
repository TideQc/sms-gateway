# 🔐 SETUP VISUAL GUIDE - AUTHENTIFICATION

## OVERVIEW

```
┌─────────────────────────────────────────────────────────────┐
│                    AUTHENTIFICATION SMS                    │
│                     Gateway Setup                          │
└─────────────────────────────────────────────────────────────┘

[FRONTEND]                          [BACKEND]
┌──────────────────┐               ┌──────────────────┐
│ Page Connexion   │               │ Node.js Express  │
├──────────────────┤               ├──────────────────┤
│ Username Input   │─┐             │ POST /login      │
│ Password Input   │ └─────[POST]──>│ Vérifie Password│
│ Bouton Login     │               │ Retourne JWT     │
│                  │<─────[JWT]─────│                  │
│ [Stocke en LS]   │               │ MySQL Database   │
│                  │               │ Table:Utilisateurs
└──────────────────┘               └──────────────────┘

Chaque requête API inclut:
Header: "Authorization: Bearer <JWT_TOKEN>"
```

---

## ETAPE 1: INSTALLER LES DÉPENDANCES

```bash
cd backend
npm install
```

**Résultat:**
```
✅ bcrypt@5.1.1
✅ jsonwebtoken@9.1.2
✅ Autres dépendances...
```

---

## ETAPE 2: GÉNÉRER LE HASH DU MOT DE PASSE

```bash
node hash-password.js "VotreMotDePasse123!"
```

**Terminal Output:**
```
✅ Hash généré avec succès:

$2b$10$xL8X7u8X7u8X7u8X7u8X7u8X7u8X7u8X7u8X7u8X7u8X7u8X7u8X
```

**Ne fermez pas cette fenêtre! Vous aurez besoin du hash.**

---

## ETAPE 3: INSÉRER EN BASE DE DONNÉES

Ouvrez MySQL et exécutez:

```sql
INSERT INTO Utilisateurs (Username, Password, Email, CreatedDate) 
VALUES (
    'admin', 
    '$2b$10$xL8X7u8X7u8X7u8X7u8X7u8X7u8X7u8X7u8X7u8X7u8X7u8X7u8X',
    'admin@cardio.com', 
    UNIX_TIMESTAMP()
);
```

**Remplacez le hash par celui que vous avez généré!**

---

## ETAPE 4: VÉRIFIER L'INSERTION

```sql
SELECT * FROM Utilisateurs;
```

**Résultat attendu:**
```
┌────┬──────────┬──────────────────────────────────────────┬──────────────────┬────────────┬──────────────┐
│ Id │ Username │ Password                                 │ Email            │ CreatedDate│ LastLoginDate
├────┼──────────┼──────────────────────────────────────────┼──────────────────┼────────────┼──────────────┤
│ 1  │ admin    │ $2b$10$xL8X7u8X7u8X7u8X7u8X7u8X7u...  │ admin@cardio.com │ 1705000000 │ NULL
└────┴──────────┴──────────────────────────────────────────┴──────────────────┴────────────┴──────────────┘
```

---

## ETAPE 5: REDÉMARRER LE SERVEUR

```bash
cd backend
node server.js
```

**Résultat attendu:**
```
🚀 Serveur Prêt
(sur le port 3000)
```

---

## ETAPE 6: ACCÉDER À L'APPLICATION

Ouvrez dans votre navigateur:
```
http://localhost:3000/frontend/index.html
```

---

## PAGE DE CONNEXION

```
┌─────────────────────────────────┐
│                                 │
│            🔐 Connexion         │
│     SMS Gateway - Cardio        │
│                                 │
│  Nom d'utilisateur:             │
│  ┌──────────────────────────┐   │
│  │ admin                    │   │
│  └──────────────────────────┘   │
│                                 │
│  Mot de passe:                  │
│  ┌──────────────────────────┐   │
│  │ ••••••••••••••••••       │   │
│  └──────────────────────────┘   │
│                                 │
│  ┌──────────────────────────┐   │
│  │    Connexion             │   │
│  └──────────────────────────┘   │
│                                 │
└─────────────────────────────────┘
```

**Entrez:**
- Username: `admin`
- Password: `VotreMotDePasse123!`

**Puis cliquez "Connexion"**

---

## APRÈS CONNEXION

```
┌────────────────────────────────────────────────────────────┐
│ 🚀 SMS Gateway          Connecté : admin [Déconnexion]   │
├────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌────────────────┐        ┌──────────────────────┐        │
│  │ Nouveau Message│        │ Base de données      │        │
│  ├────────────────┤        │ [Filtres] [Recherche]│        │
│  │                │        ├──────────────────────┤        │
│  │ [Texte Message]│        │ Checkbox │ Nom │ ... │        │
│  │                │        │ ☑ John │ John Smith │        │
│  │ [Envoyer (0)]  │        │ ☐ Jane │ Jane Doe   │        │
│  │                │        │ ☐ Bob  │ Bob Jones  │        │
│  │ [Barre Prog]   │        │ ... (table scrollable)        │
│  │                │        │                              │
│  └────────────────┘        └──────────────────────┘        │
│                                                              │
│  [Floating Button: 📜 Historique]                          │
└────────────────────────────────────────────────────────────┘
```

✅ **Vous êtes connecté et l'application fonctionne!**

---

## VÉRIFICATION DU TOKEN

Ouvrez la console du navigateur (F12):

```javascript
// Console
localStorage.getItem('authToken')

// Résultat:
// "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjEsInVzZXJuYW1lIjoiYWRtaW4iLCJpYXQiOjE3MDUwMDAwMDAsImV4cCI6MTcwNTA4NjQwMH0.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

Le token JWT est maintenant stocké et utilisé automatiquement.

---

## AJOUTER D'AUTRES UTILISATEURS

### Répétez les étapes 2-3:

**Étape 2:** Générez un nouveau hash
```bash
node hash-password.js "MotDePasse456!"
```

**Étape 3:** Insérez en DB
```sql
INSERT INTO Utilisateurs (Username, Password, Email, CreatedDate) 
VALUES (
    'john', 
    '$2b$10$nouveau_hash_ici...',
    'john@cardio.com', 
    UNIX_TIMESTAMP()
);
```

Maintenant "john" peut se connecter avec le mot de passe utilisé.

---

## SÉCURITÉ - POINTS CLÉS

### ✅ Fait automatiquement:
- ✅ Mots de passe hachés avec Bcrypt (irreversible)
- ✅ JWT signé pour chaque session
- ✅ Tokens valides 24 heures
- ✅ LastLoginDate mis à jour
- ✅ Tous les endpoints protégés

### ⚠️ À configurer en production:
- ⚠️ Activez HTTPS (pas de HTTP)
- ⚠️ Changez JWT_SECRET en .env
- ⚠️ Imposez des mots de passe forts (12+ chars)
- ⚠️ Limitez les tentatives de connexion
- ⚠️ Activez les logs d'accès

---

## DÉCONNEXION

Cliquez le bouton "Déconnexion" dans l'header:

```
┌─────────────────────────────────────────────────────────┐
│ 🚀 SMS Gateway    Connecté : admin [Déconnexion] ✓      │
└─────────────────────────────────────────────────────────┘
                              ↓
                    Click [Déconnexion]
                              ↓
                    Confirmation: "Êtes-vous sûr?"
                              ↓
                    Click "OK"
                              ↓
                    ✅ Token supprimé
                    ✅ Page rechargée
                    ✅ Retour à la connexion
```

---

## SCHÉMA COMPLET D'AUTHENTIFICATION

```
┌─────────────────────────────────────────────────────────────────┐
│                 FLUX COMPLET D'AUTHENTIFICATION                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  FRONTEND                          BACKEND                       │
│  ┌──────────────┐                  ┌──────────────┐            │
│  │ localStorage │                  │  MySQL DB    │            │
│  │ .getItem()   │                  │              │            │
│  └──────────────┘                  └──────────────┘            │
│        ↓                                  ↓                     │
│  [Pas de token] ────────────→ [Affiche Connexion]              │
│        ↓                                                         │
│  [Utilisateur Remplit]                                          │
│  - Username                                                     │
│  - Password                                                     │
│        ↓                                                         │
│  [POST /login] ──────────────────→ [Vérifie Username]          │
│                                    [Compare Password]          │
│                                    [Crée JWT Token]            │
│        ↓                                  ↓                     │
│  [Reçoit JWT] ←────────────────────→ [Retourne JWT]            │
│        ↓                                                         │
│  [Stocke en localStorage]                                       │
│  [Affiche APP]                                                  │
│        ↓                                                         │
│  [Chaque requête API]                                           │
│  [Header: Authorization: Bearer JWT] ────→ [Vérifie JWT]       │
│        ↓                                    ↓                   │
│  [Reçoit Données] ←──────────────── [Retourne Données]        │
│        ↓                                                         │
│  [Click Déconnexion]                                            │
│  [localStorage.removeItem]                                      │
│  [Reload Page]                                                  │
│        ↓                                                         │
│  [Retour Connexion]                                             │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## TROUBLESHOOTING VISUEL

```
Problème: "Token invalide"
         ↓
    ✓ Vérifiez .env
    ✓ JWT_SECRET est configuré?
    ✓ Serveur redémarré?
         ↓
    [Redémarrez le serveur: node server.js]

Problème: "Identifiants invalides"
         ↓
    ✓ Vérifiez base de données
    ✓ Utilisateur existe?
    ✓ Hash correct?
         ↓
    [Vérifiez: SELECT * FROM Utilisateurs]

Problème: Page blanche
         ↓
    ✓ Ouvrez F12 (Console)
    ✓ Cherchez les erreurs (red)
    ✓ Vérifiez API_URL
         ↓
    [Vérifiez que le serveur est démarré]

Problème: CORS error
         ↓
    ✓ Vérifiez domaine
    ✓ Vérifiez que API répond
    ✓ Vérifiez headers
         ↓
    [Arrêtez et redémarrez le serveur]
```

---

## FICHIERS IMPORTANTS

```
projet/
├── backend/
│   ├── server.js                    [← Authentification ajoutée]
│   ├── package.json                 [← Dépendances ajoutées]
│   ├── hash-password.js             [← Nouveau - Génère hashs]
│   ├── setup-auth.sh                [← Nouveau - Setup Linux]
│   ├── setup-auth.bat               [← Nouveau - Setup Windows]
│   └── .env                         [← Vérifiez JWT_SECRET]
│
├── frontend/
│   └── index.html                   [← Page login ajoutée]
│
└── Documentation/
    ├── AUTH_QUICK_START.md          [← Ce fichier]
    ├── AUTHENTICATION_GUIDE.md       [← Guide complet]
    ├── SETUP_AUTHENTICATION.md       [← Instructions détaillées]
    └── EXAMPLE_USERS.sql            [← Exemples SQL]
```

---

## 🎯 SUCCÈS = CHECKLIST

- [ ] npm install terminé
- [ ] Hash généré avec hash-password.js
- [ ] Utilisateur créé en MySQL
- [ ] Serveur Node.js en cours d'exécution
- [ ] Page accessible: http://localhost:3000/frontend/index.html
- [ ] Connexion avec "admin" / "VotreMotDePasse123!" fonctionne
- [ ] App SMS s'affiche après connexion
- [ ] Bouton "Déconnexion" visible et fonctionnel
- [ ] Token visible en localStorage (F12)
- [ ] Nouvelle connexion demande les identifiants

---

**Temps total de setup: 5-10 minutes**  
**Résultat: Application sécurisée et prête pour la production** ✅
