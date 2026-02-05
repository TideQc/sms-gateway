# 📱 SMS Gateway - Cardio Plein Air

[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=flat&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-4.18-000000?style=flat&logo=express&logoColor=white)](https://expressjs.com/)
[![MariaDB](https://img.shields.io/badge/MariaDB-10.11-003545?style=flat&logo=mariadb&logoColor=white)](https://mariadb.org/)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=flat&logo=docker&logoColor=white)](https://www.docker.com/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

> Application web de gestion de communications SMS pour Cardio Plein Air - Envoi massif, conversations bidirectionnelles et gestion de participants.

---

## 📋 Table des Matières

- [À Propos](#-à-propos)
- [Fonctionnalités](#-fonctionnalités)
- [Architecture](#-architecture)
- [Technologies](#-technologies)
- [Installation](#-installation)
- [Configuration](#-configuration)
- [Utilisation](#-utilisation)
- [API Documentation](#-api-documentation)
- [Structure du Projet](#-structure-du-projet)
- [Sécurité](#-sécurité)
- [Documentation](#-documentation)
- [Contribution](#-contribution)
- [License](#-license)

---

## 🎯 À Propos

**SMS Gateway Cardio Plein Air** est une solution complète de gestion de communications SMS permettant aux administrateurs et coachs de :

- 📤 Envoyer des SMS individuels ou en masse aux participants
- 💬 Gérer des conversations SMS bidirectionnelles
- 👥 Organiser les participants par parc, type d'activité et coach
- 📊 Suivre l'historique complet des communications
- 🔔 Recevoir des notifications en temps réel
- 📥 Importer des listes de participants via Excel

L'application utilise un téléphone Android comme passerelle SMS physique via l'application SMS Gateway.

---

## ✨ Fonctionnalités

### 🔐 Authentification & Sécurité
- Authentification JWT sécurisée (tokens 24h)
- Mots de passe hachés avec Bcrypt
- Protection de toutes les routes API
- Gestion multi-utilisateurs

### 👥 Gestion des Participants
- Tableau de bord interactif avec DataTables
- Filtres dynamiques (parc, type, coach)
- Import Excel par glisser-déposer
- Sélection multiple pour envois de masse
- Compteur SMS non lus par participant

### 💬 Messagerie SMS
- **Envoi individuel** : réponse rapide dans les conversations
- **Envoi de masse** : sélection multiple avec délai anti-spam
- **Conversations bidirectionnelles** : historique complet
- **Notifications temps réel** : via WebSocket (Socket.IO)
- **Gestion des non-lus** : marquer comme lu/non lu
- **Archives** : historique de tous les envois

### 🔄 Synchronisation Android
- Connexion automatique au téléphone via API
- Synchronisation des SMS reçus
- Matching intelligent avec les participants
- Gestion des SMS orphelins (numéros inconnus)
- Détection automatique des endpoints API

### 📊 Monitoring
- Statut de connexion téléphone en temps réel
- Barre de progression pour envois de masse
- Logs structurés JSON (backend)
- Dashboard avec statistiques

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    UTILISATEURS (Web)                       │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTPS (Port 4444)
                         ↓
┌─────────────────────────────────────────────────────────────┐
│              FRONTEND (Nginx Alpine)                        │
│  • HTML5 + Bootstrap 5                                      │
│  • JavaScript ES6 Modulaire                                 │
│  • Socket.IO Client (temps réel)                            │
│  • DataTables (tableaux interactifs)                        │
└────────────────────────┬────────────────────────────────────┘
                         │ REST API + WebSocket (Port 3000)
                         ↓
┌─────────────────────────────────────────────────────────────┐
│              BACKEND (Node.js/Express)                      │
│  • API RESTful (19 endpoints protégés)                      │
│  • Authentification JWT                                     │
│  • Socket.IO Server                                         │
│  • Service de synchronisation SMS Android                   │
└─────────┬───────────────────────────┬───────────────────────┘
          │                           │
          │ MySQL (3306)              │ HTTP API (8080)
          ↓                           ↓
┌──────────────────────┐    ┌─────────────────────────────────┐
│  MariaDB 10.11       │    │  TÉLÉPHONE ANDROID              │
│  • Participants      │    │  • SMS Gateway App              │
│  • ReceivedSMS       │    │  • Envoi/Réception SMS          │
│  • SentMessages      │    │  • API HTTP Locale              │
│  • Utilisateurs      │    └─────────────────────────────────┘
└──────────────────────┘
```

---

## 🛠️ Technologies

### Backend
- **Node.js** 18+ avec Express.js
- **Socket.IO** - Communication temps réel
- **JWT** - Authentification sécurisée
- **Bcrypt** - Hachage de mots de passe
- **MySQL2** - Connexion base de données
- **Axios** - Requêtes HTTP vers téléphone Android
- **Multer** - Upload de fichiers
- **XLSX** - Lecture de fichiers Excel

### Frontend
- **HTML5** + **CSS3** (9 modules CSS, 1350 lignes)
- **JavaScript ES6** - Architecture orientée objet
- **Bootstrap 5** - Framework UI responsive
- **jQuery** - Manipulation DOM
- **DataTables** - Tableaux de données avancés
- **Socket.IO Client** - WebSocket

### Infrastructure
- **Docker** + **Docker Compose**
- **Node.js** - Runtime backend
- **Nginx Alpine** - Serveur web frontend
- **MariaDB 10.11** - Base de données relationnelle

### Téléphone
- **Android** (compatible avec la plupart des appareils)
- **SMS Gateway App** - Passerelle SMS physique

---

## 🚀 Installation

### Prérequis

- Docker & Docker Compose
- Téléphone Android avec SMS Gateway installé
- Réseau local (backend et téléphone sur même réseau)

### Étapes

1. **Cloner le repository**
```bash
git clone https://github.com/votre-compte/cardio-plein-air-smsgateway.git
cd cardio-plein-air-smsgateway
```

2. **Configurer les variables d'environnement**
```bash
cp .env.example .env
```

Éditer `.env` avec vos valeurs :
```env
# Base de données
DB_HOST=db
DB_USER=user_sms
DB_PASS=user_password
DB_NAME=sms_gateway

# JWT
JWT_SECRET=votre-secret-securise-ici

# Téléphone Android (SMS Gateway)
PIXEL_IP=192.168.1.100
PIXEL_PORT=8080
PIXEL_USER=admin
PIXEL_PASS=password
```

3. **Démarrer les conteneurs Docker**
```bash
docker-compose up -d
```

4. **Créer les tables de base de données**
```bash
docker exec -i sms_db mysql -uuser_sms -puser_password sms_gateway < database/unread-sms-migration.sql
```

5. **Créer un utilisateur administrateur**
```bash
cd backend
node hash-password.js "VotreMotDePasse"
```

Puis exécuter dans MySQL :
```sql
INSERT INTO Utilisateurs (Username, Password, Email, CreatedDate) 
VALUES ('admin', 'HASH_GENERE_ICI', 'admin@example.com', UNIX_TIMESTAMP());
```

Ou utiliser le fichier `EXAMPLE_USERS.sql` fourni.

6. **Accéder à l'application**
```
http://localhost:4444
```

---

## ⚙️ Configuration

### Configuration du Téléphone Android

1. Installer **SMS Gateway** depuis le Play Store
2. Ouvrir l'application et configurer :
   - Port : `8080`
   - Authentification : Basic Auth
   - Créer un utilisateur/mot de passe
3. Obtenir l'adresse IP locale du téléphone (Paramètres → À propos)
4. S'assurer que le téléphone est sur le même réseau que le serveur

### Configuration Nginx (Production)

Pour un déploiement en production, modifier `docker-compose.yml` :

```yaml
frontend:
  image: nginx:alpine
  ports:
    - "80:80"
    - "443:443"
  volumes:
    - ./frontend:/usr/share/nginx/html
    - ./nginx.conf:/etc/nginx/nginx.conf
    - ./ssl:/etc/nginx/ssl
```

---

## 📖 Utilisation

### Connexion

1. Ouvrir `http://localhost:4444`
2. Se connecter avec les identifiants créés
3. Le token JWT est valide 24 heures

### Gestion des Participants

**Import Excel :**
1. Cliquer sur "Importer Excel"
2. Glisser-déposer un fichier `.xlsx` ou `.xls`
3. Colonnes attendues : `Prenom`, `NomDeFamille`, `NumeroTel`, `Park`, `Type`, `Coach`

**Filtres :**
- Utiliser les filtres par parc, type ou coach
- La recherche globale filtre tous les champs

### Envoi de SMS

**Envoi de masse :**
1. Sélectionner les participants (checkboxes)
2. Cliquer "Envoyer SMS de masse"
3. Composer le message
4. Confirmer l'envoi
5. Suivre la progression en temps réel

**Envoi individuel :**
1. Cliquer sur un participant
2. Voir la conversation complète
3. Taper une réponse rapide
4. Envoyer

### Réception de SMS

**Synchronisation manuelle :**
1. Cliquer sur "Synchroniser"
2. Les nouveaux SMS apparaissent avec notification
3. Un badge indique le nombre de non-lus

**Synchronisation automatique :**
- Les SMS sont synchronisés automatiquement si webhook configuré
- Endpoint : `POST /pixel/incoming`

---

## 🔌 API Documentation

### Authentification

Toutes les routes (sauf `/login` et `/pixel/incoming`) nécessitent un token JWT.

**Header requis :**
```
Authorization: Bearer <votre_token_jwt>
```

### Endpoints Principaux

#### Authentication

| Méthode | Route | Description |
|---------|-------|-------------|
| `POST` | `/login` | Connexion utilisateur |
| `POST` | `/logout` | Déconnexion |
| `GET` | `/verify-token` | Vérifier la validité du token |

#### Participants

| Méthode | Route | Description |
|---------|-------|-------------|
| `GET` | `/participants` | Liste complète avec compteur SMS |
| `POST` | `/api/participants/import-excel` | Import fichier Excel |
| `GET` | `/participant-history/:id` | Historique conversation |

#### SMS

| Méthode | Route | Description |
|---------|-------|-------------|
| `POST` | `/send-bulk` | Envoi SMS de masse |
| `POST` | `/send-sms-quick` | Envoi SMS individuel |
| `GET` | `/unread-sms` | Messages non lus |
| `POST` | `/mark-sms-read/:smsId` | Marquer SMS lu |
| `POST` | `/mark-conversation-read` | Marquer conversation lue |
| `GET` | `/sent-messages-archive` | Archives des envois |

#### Synchronisation Android

| Méthode | Route | Description |
|---------|-------|-------------|
| `GET` | `/pixel/device-status` | État du téléphone Android |
| `POST` | `/pixel/sync-sms` | Synchroniser tous les SMS |
| `POST` | `/pixel/sync-unread-only` | Sync SMS non lus |
| `POST` | `/pixel/incoming` | Webhook SMS entrants (public) |

#### Monitoring

| Méthode | Route | Description |
|---------|-------|-------------|
| `GET` | `/send-status` | Progression envoi de masse |
| `GET` | `/pixel-status` | État connexion téléphone |

### Exemple de Requête

**Login :**
```bash
curl -X POST http://localhost:3000/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"motdepasse"}'
```

**Envoi SMS :**
```bash
curl -X POST http://localhost:3000/send-sms-quick \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"phone":"+15145551234","message":"Bonjour!"}'
```

---

## 📁 Structure du Projet

```
cardio_plein_air_smsgateway/
├── backend/                      # Serveur Node.js
│   ├── server.js                # API principale (991 lignes)
│   ├── pixel-sms-sync.js        # Service de synchronisation (366 lignes)
│   ├── package.json             # Dépendances npm
│   ├── Dockerfile               # Image Docker backend
│   ├── hash-password.js         # Utilitaire hachage
│   ├── generate-hash.js         # Générateur de hash
│   └── setup-auth.sh/bat        # Scripts d'installation
│
├── frontend/                     # Application web
│   ├── index.html               # Point d'entrée
│   ├── css/                     # Styles modulaires (1350 lignes)
│   │   ├── global.css           # Variables + reset
│   │   ├── login.css            # Formulaire connexion
│   │   ├── tables.css           # Tableaux DataTables
│   │   ├── sms-messages.css     # Interface conversations
│   │   ├── responsive.css       # Media queries
│   │   ├── modals.css           # Dialogues
│   │   ├── burger-menu.css      # Menu mobile
│   │   └── scrollbar.css        # Scrollbar custom
│   │
│   └── js/                      # Modules JavaScript
│       ├── app.js               # Initialisation
│       ├── main.js              # Classe principale (943 lignes)
│       ├── sms-module.js        # Gestion SMS
│       ├── participants-module.js # Gestion participants
│       ├── notifications.js     # Système de toasts
│       ├── utils.js             # Utilitaires
│       └── config.js            # Configuration
│
├── database/                     # Scripts SQL
│   ├── unread-sms-migration.sql # Migration DB
│   └── test-unread-sms.sql      # Tests
│
├── db/                          # Données
│   └── ListesHiver26-ROS.csv    # Import participants
│
├── docker-compose.yml           # Orchestration Docker
├── .env                         # Variables d'environnement
├── .env.example                 # Template .env
│
└── docs/                        # Documentation
    ├── AUTH_QUICK_START.md      # Guide authentification rapide
    ├── AUTHENTICATION_GUIDE.md  # Guide complet sécurité
    ├── CHECKLIST.md             # Checklist complète
    ├── DEVELOPMENT_CHECKLIST.md # Checklist développement
    ├── EXAMPLE_USERS.sql        # Exemples utilisateurs
    ├── FICHIERS_CREES.md        # Inventaire fichiers créés
    ├── GUIDE_UTILISATION.md     # Guide d'utilisation
    ├── MIGRATION_GUIDE.md       # Guide de migration
    ├── PIXEL_SMS_SYNC_GUIDE.md  # Synchronisation Pixel
    ├── PIXEL_SMS_API_SIMPLIFIED.md
    ├── PIXEL_SMS_QUICK_START.md
    ├── README_AUTH.md           # Index documentation auth
    ├── REFACTORING_SUMMARY.md   # Résumé refactorisation
    ├── SETUP_AUTHENTICATION.md  # Setup technique auth
    ├── SUMMARY.md               # Résumé global
    ├── UNREAD_SMS_GUIDE.md      # Guide SMS non lus
    └── VISUAL_SETUP_GUIDE.md    # Instructions visuelles
```

---

## 🔐 Sécurité

### Authentification
- **JWT (JSON Web Tokens)** avec expiration 24h
- Secret stocké dans variables d'environnement
- Middleware de vérification sur toutes routes protégées

### Mots de Passe
- Hachage **Bcrypt** avec 10 rounds
- Jamais stockés en clair
- Scripts utilitaires fournis pour génération

### Base de Données
- Requêtes paramétrées (protection SQL injection)
- Pool de connexions sécurisé
- Credentials en variables d'environnement

### Recommandations Production
- [ ] Modifier `JWT_SECRET` avec une clé forte aléatoire
- [ ] Configurer HTTPS/SSL avec certificats
- [ ] Restreindre CORS aux domaines autorisés
- [ ] Utiliser un pare-feu (bloquer ports non nécessaires)
- [ ] Activer les logs d'audit
- [ ] Mettre en place des backups automatiques DB
- [ ] Limiter les tentatives de login (rate limiting)

---

## 📚 Documentation

### Guides Disponibles

| Document | Description | Temps de lecture |
|----------|-------------|------------------|
| [AUTH_QUICK_START.md](docs/AUTH_QUICK_START.md) | Setup authentification en 5 min | 5 min |
| [AUTHENTICATION_GUIDE.md](docs/AUTHENTICATION_GUIDE.md) | Guide complet sécurité | 30 min |
| [VISUAL_SETUP_GUIDE.md](docs/VISUAL_SETUP_GUIDE.md) | Instructions avec diagrammes | 10 min |
| [PIXEL_SMS_SYNC_GUIDE.md](docs/PIXEL_SMS_SYNC_GUIDE.md) | Configuration synchronisation | 15 min |
| [MIGRATION_GUIDE.md](docs/MIGRATION_GUIDE.md) | Mise à jour et migration | 20 min |
| [EXAMPLE_USERS.sql](docs/EXAMPLE_USERS.sql) | Scripts SQL utilisateurs | - |
| [GUIDE_UTILISATION.md](docs/GUIDE_UTILISATION.md) | Guide d'utilisation complet | 20 min |
| [SUMMARY.md](docs/SUMMARY.md) | Résumé du projet | 10 min |

### Architecture Frontend

L'application utilise une architecture **MVC modulaire** :

- **Model** : Gestion de l'état dans `cpaSmsApp.state`
- **View** : Templates HTML générés dynamiquement
- **Controller** : Méthodes de la classe `cpaSmsApp`

### Architecture Backend

- **Routes** : Endpoints Express avec middleware d'authentification
- **Services** : `PixelSMSSync` pour communication avec Pixel
- **Database** : Pool MySQL2 avec requêtes paramétrées
- **WebSocket** : Socket.IO pour temps réel

---

## 🤝 Contribution

Les contributions sont les bienvenues !

### Comment Contribuer

1. **Fork** le projet
2. **Créer** une branche feature (`git checkout -b feature/amelioration`)
3. **Commit** les changements (`git commit -m 'Ajout fonctionnalité X'`)
4. **Push** vers la branche (`git push origin feature/amelioration`)
5. **Ouvrir** une Pull Request

### Guidelines

- Suivre les conventions de code existantes
- Ajouter des tests si applicable
- Mettre à jour la documentation
- Décrire clairement les changements dans la PR

### Signalement de Bugs

Utiliser les [GitHub Issues](https://github.com/votre-compte/cardio-plein-air-smsgateway/issues) avec :
- Description détaillée du bug
- Étapes pour reproduire
- Comportement attendu vs actuel
- Logs/captures d'écran si pertinent

---

## 🧪 Tests

### Backend

```bash
cd backend
npm test
```

### Frontend

Ouvrir dans un navigateur avec DevTools et vérifier la console.

### Test de Connexion Pixel

```bash
curl http://PIXEL_IP:8080/messages \
  -u username:password
```

---

## 🚢 Déploiement en Production

### 1. Sécuriser les Variables

```env
JWT_SECRET=$(openssl rand -hex 32)
DB_PASS=$(openssl rand -base64 32)
```

### 2. Configurer HTTPS

Ajouter un reverse proxy Nginx avec SSL :

```nginx
server {
    listen 443 ssl http2;
    server_name votredomaine.com;
    
    ssl_certificate /etc/ssl/cert.pem;
    ssl_certificate_key /etc/ssl/key.pem;
    
    location / {
        proxy_pass http://sms_frontend:80;
    }
    
    location /api {
        proxy_pass http://sms_backend:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
    }
}
```

### 3. Backups Automatiques

```bash
# Cron job quotidien
0 2 * * * docker exec sms_db mysqldump -uroot -p$ROOT_PASS sms_gateway > backup-$(date +\%Y\%m\%d).sql
```

---

## 📊 Performances

- **Envoi de masse** : 3-5 secondes de délai entre chaque SMS (anti-spam)
- **WebSocket** : Latence < 100ms pour notifications temps réel
- **Database** : Pool de 10 connexions simultanées
- **Responsive** : Optimisé mobile/tablet/desktop

---

## 🐛 Dépannage

### Le téléphone Android n'est pas accessible

```bash
# Vérifier la connectivité
ping PIXEL_IP

# Tester l'API
curl -u user:pass http://PIXEL_IP:8080/messages
```

### Token JWT invalide

- Vérifier que `JWT_SECRET` est identique entre redémarrages
- Le token expire après 24h, se reconnecter

### Base de données ne démarre pas

```bash
# Vérifier les logs
docker logs sms_db

# Réinitialiser le volume
docker-compose down -v
docker-compose up -d
```

---

## 📝 License

Ce projet est sous licence **MIT**. Voir le fichier [LICENSE](LICENSE) pour plus de détails.

---

## 👥 Auteurs

- **Michael Tétreault** - Développement et maintenance

---

## 🙏 Remerciements

- [SMS Gateway App](https://smsgateway.me/) pour l'API Android
- [Express.js](https://expressjs.com/) pour le framework backend
- [Socket.IO](https://socket.io/) pour les WebSockets
- [Bootstrap](https://getbootstrap.com/) pour le framework UI
- [DataTables](https://datatables.net/) pour les tableaux interactifs

---

<div align="center">

**⭐ Si ce projet vous a été utile, n'hésitez pas à lui donner une étoile ! ⭐**

Made with ❤️ by Michael Tétreault

</div>
