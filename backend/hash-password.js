#!/usr/bin/env node

/**
 * SCRIPT POUR HACHER UN MOT DE PASSE
 * Utilisation: node hash-password.js "votre_mot_de_passe"
 * 
 * Copie le hash généré dans la base de données pour la table Utilisateurs
 */

const bcrypt = require('bcryptjs');

const password = process.argv[2];

if (!password) {
    console.error('❌ Usage: node hash-password.js "votre_mot_de_passe"');
    process.exit(1);
}

bcrypt.hash(password, 10, (err, hash) => {
    if (err) {
        console.error('❌ Erreur:', err.message);
        process.exit(1);
    }
    
    console.log('✅ Hash généré avec succès:');
    console.log('');
    console.log(hash);
    console.log('');
    console.log('📝 Utilise ce hash dans la base de données pour la colonne Password');
});
