@echo off
REM 🔐 Script de configuration rapide de l'authentification SMS Gateway (Windows)

echo.
echo ======================================
echo 🔐 Configuration Authentification
echo ======================================
echo.

REM Vérifier que nous sommes dans le bon répertoire
if not exist "package.json" (
    echo ❌ Erreur: Exécutez ce script depuis le répertoire 'backend'
    pause
    exit /b 1
)

REM Installer les dépendances
echo 📦 Installation des dépendances...
call npm install

if errorlevel 1 (
    echo ❌ Erreur lors de l'installation des dépendances
    pause
    exit /b 1
)

echo ✅ Dépendances installées avec succès
echo.
echo ======================================
echo 🔑 Générateur de mot de passe
echo ======================================
echo.
echo Pour créer un nouvel utilisateur:
echo.
echo 1. Générez un hash du mot de passe:
echo    node hash-password.js "votre_mot_de_passe"
echo.
echo 2. Copiez le hash généré
echo.
echo 3. Insérez en base de données:
echo    INSERT INTO Utilisateurs (Username, Password, Email, CreatedDate)
echo    VALUES ('username', 'hash_copied', 'email@example.com', UNIX_TIMESTAMP^(^));
echo.
echo ======================================
echo ✅ Configuration terminée!
echo ======================================
echo.
pause
