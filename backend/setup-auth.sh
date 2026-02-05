#!/bin/bash

# 🔐 Script de configuration rapide de l'authentification SMS Gateway

echo "======================================"
echo "🔐 Configuration Authentification"
echo "======================================"
echo ""

# Vérifier que nous sommes dans le bon répertoire
if [ ! -f "package.json" ]; then
    echo "❌ Erreur: Exécutez ce script depuis le répertoire 'backend'"
    exit 1
fi

# Installer les dépendances
echo "📦 Installation des dépendances..."
npm install

if [ $? -eq 0 ]; then
    echo "✅ Dépendances installées avec succès"
else
    echo "❌ Erreur lors de l'installation des dépendances"
    exit 1
fi

echo ""
echo "======================================"
echo "🔑 Générateur de mot de passe"
echo "======================================"
echo ""
echo "Pour créer un nouvel utilisateur:"
echo ""
echo "1. Générez un hash du mot de passe:"
echo "   node hash-password.js \"votre_mot_de_passe\""
echo ""
echo "2. Copiez le hash généré"
echo ""
echo "3. Insérez en base de données:"
echo "   INSERT INTO Utilisateurs (Username, Password, Email, CreatedDate)"
echo "   VALUES ('username', 'hash_copied', 'email@example.com', UNIX_TIMESTAMP());"
echo ""
echo "======================================"
echo "✅ Configuration terminée!"
echo "======================================"
