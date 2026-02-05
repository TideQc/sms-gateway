-- 🔐 EXEMPLE DE SETUP D'AUTHENTIFICATION
-- Étapes pour créer des utilisateurs de test

-- =========================================
-- ÉTAPE 1: Générer les hashs des mots de passe
-- =========================================
-- Exécutez dans le terminal:
-- node hash-password.js "admin123"
-- node hash-password.js "user123"

-- Les hashs générés seront similaires à:
-- Admin: $2b$10$xL8X7u8X7u8X7u8X7u8X7u8X7u8X7u8X7u8X7u8X7u8X7u8X
-- User:  $2b$10$aL9Y9v9Y9v9Y9v9Y9v9Y9v9Y9v9Y9v9Y9v9Y9v9Y9v9Y9v9Y

-- =========================================
-- ÉTAPE 2: Créer les utilisateurs en base de données
-- =========================================

-- Créer l'administrateur principal
INSERT INTO Utilisateurs (Username, Password, Email, CreatedDate) 
VALUES (
    'admin', 
    '$2b$10$xL8X7u8X7u8X7u8X7u8X7u8X7u8X7u8X7u8X7u8X7u8X7u8X7u8X',
    'admin@cardio.com', 
    UNIX_TIMESTAMP()
);

-- Créer un utilisateur standard
INSERT INTO Utilisateurs (Username, Password, Email, CreatedDate) 
VALUES (
    'operator1', 
    '$2b$10$aL9Y9v9Y9v9Y9v9Y9v9Y9v9Y9v9Y9v9Y9v9Y9v9Y9v9Y9v9Y9v9Y',
    'operator1@cardio.com', 
    UNIX_TIMESTAMP()
);

-- =========================================
-- ÉTAPE 3: Vérifier les utilisateurs créés
-- =========================================

-- Voir tous les utilisateurs
SELECT Id, Username, Email, CreatedDate FROM Utilisateurs;

-- Voir un utilisateur spécifique
SELECT * FROM Utilisateurs WHERE Username = 'admin';

-- =========================================
-- ÉTAPE 4: Réinitialiser un mot de passe
-- =========================================

-- Exemple: Changer le mot de passe de admin
-- D'abord, générez le nouveau hash: node hash-password.js "nouveau_mdp_123"
-- Puis exécutez:
UPDATE Utilisateurs 
SET Password = '$2b$10$newHashHerexxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' 
WHERE Username = 'admin';

-- =========================================
-- ÉTAPE 5: Supprimer un utilisateur
-- =========================================

-- Attention: Cette action est définitive
DELETE FROM Utilisateurs WHERE Username = 'operator1';

-- =========================================
-- ÉTAPE 6: Voir l'historique de connexion
-- =========================================

-- Voir les dernières connexions
SELECT 
    Username, 
    FROM_UNIXTIME(LastLoginDate) as LastLogin
FROM Utilisateurs 
WHERE LastLoginDate IS NOT NULL
ORDER BY LastLoginDate DESC;

-- =========================================
-- NOTES IMPORTANTES
-- =========================================

-- ⚠️ Les hashes générés ci-dessus sont des EXEMPLES
-- Vous DEVEZ générer vos propres hashs avec:
-- node hash-password.js "votreMotDePasse"

-- ⚠️ N'oubliez pas le Comma (,) entre les rows si vous en ajoutez plusieurs
-- Exemple avec plusieurs insertions:
/*
INSERT INTO Utilisateurs (Username, Password, Email, CreatedDate) VALUES
('admin', 'hash1', 'admin@cardio.com', UNIX_TIMESTAMP()),
('user1', 'hash2', 'user1@cardio.com', UNIX_TIMESTAMP()),
('user2', 'hash3', 'user2@cardio.com', UNIX_TIMESTAMP());
*/

-- =========================================
-- IDENTIFIANTS DE TEST
-- =========================================

-- Après avoir exécuté les INSERT ci-dessus:
-- 
-- Username: admin
-- Password: admin123 (remplacez par votre mot de passe)
--
-- Username: operator1
-- Password: user123 (remplacez par votre mot de passe)
--
-- Testez avec ces identifiants dans la page de connexion

-- =========================================
-- SÉCURITÉ
-- =========================================

-- ✅ Les mots de passe sont hachés avec Bcrypt
-- ✅ Les hashs ne peuvent pas être inversés
-- ✅ Chaque connexion met à jour LastLoginDate
-- ✅ Email est unique (pas deux comptes avec le même email)
-- ✅ Username est unique (pas deux comptes avec le même nom d'utilisateur)

-- ✓ Vous pouvez maintenant vous connecter à l'application !
