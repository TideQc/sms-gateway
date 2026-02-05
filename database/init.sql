-- ========================================
-- SMS Gateway - Database Initialization
-- ========================================
-- This script creates the database and all required tables
-- Safe to run multiple times (uses IF NOT EXISTS)

-- Create database
CREATE DATABASE IF NOT EXISTS `sms_gateway` 
DEFAULT CHARACTER SET utf8mb4 
DEFAULT COLLATE utf8mb4_general_ci;

USE `sms_gateway`;

-- ========================================
-- Table: Participants
-- ========================================
CREATE TABLE IF NOT EXISTS `Participants` (
	`Id` INT(11) NOT NULL AUTO_INCREMENT,
	`NomDeFamille` VARCHAR(100) NULL DEFAULT NULL COLLATE 'utf8mb4_general_ci',
	`Prenom` VARCHAR(100) NULL DEFAULT NULL COLLATE 'utf8mb4_general_ci',
	`Email` VARCHAR(150) NULL DEFAULT NULL COLLATE 'utf8mb4_general_ci',
	`NumeroTel` VARCHAR(20) NULL DEFAULT NULL COLLATE 'utf8mb4_general_ci',
	`Inscrit` VARCHAR(50) NULL DEFAULT NULL COLLATE 'utf8mb4_general_ci',
	`Parc` VARCHAR(100) NULL DEFAULT NULL COLLATE 'utf8mb4_general_ci',
	`TypeEntrainement` VARCHAR(100) NULL DEFAULT NULL COLLATE 'utf8mb4_general_ci',
	`JourInscrit` VARCHAR(20) NULL DEFAULT NULL COLLATE 'utf8mb4_general_ci',
	`HeureInscrit` TIME NULL DEFAULT NULL,
	`NomEntraineur` VARCHAR(100) NULL DEFAULT NULL COLLATE 'utf8mb4_general_ci',
	PRIMARY KEY (`Id`) USING BTREE,
	UNIQUE INDEX `NumeroTel` (`NumeroTel`) USING BTREE
)
COLLATE='utf8mb4_general_ci'
ENGINE=InnoDB;

-- ========================================
-- Table: Utilisateurs (Authentication)
-- ========================================
CREATE TABLE IF NOT EXISTS `Utilisateurs` (
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

-- ========================================
-- Table: ReceivedSMS
-- ========================================
CREATE TABLE IF NOT EXISTS `ReceivedSMS` (
	`Id` INT(11) NOT NULL AUTO_INCREMENT,
	`ParticipantId` INT(11) NULL DEFAULT NULL,
	`Message` LONGTEXT NOT NULL COLLATE 'utf8mb4_general_ci',
	`SenderNumber` VARCHAR(20) NULL DEFAULT NULL COLLATE 'utf8mb4_general_ci',
	`IsRead` TINYINT(4) NULL DEFAULT '0',
	`ReceivedDate` TIMESTAMP NULL DEFAULT current_timestamp(),
	`ReadDate` TIMESTAMP NULL DEFAULT NULL,
	`CreatedAt` TIMESTAMP NULL DEFAULT current_timestamp(),
	PRIMARY KEY (`Id`) USING BTREE,
	INDEX `idx_participant_read` (`ParticipantId`, `IsRead`) USING BTREE,
	INDEX `idx_received_date` (`ReceivedDate`) USING BTREE,
	CONSTRAINT `ReceivedSMS_ibfk_1` FOREIGN KEY (`ParticipantId`) REFERENCES `Participants` (`Id`) ON UPDATE RESTRICT ON DELETE CASCADE
)
COLLATE='utf8mb4_general_ci'
ENGINE=InnoDB;

-- ========================================
-- Table: SentSMS
-- ========================================
CREATE TABLE IF NOT EXISTS `SentSMS` (
	`Id` INT(11) NOT NULL AUTO_INCREMENT,
	`ParticipantId` INT(11) NULL DEFAULT NULL,
	`Message` LONGTEXT NOT NULL COLLATE 'utf8mb4_general_ci',
	`RecipientNumber` VARCHAR(20) NULL DEFAULT NULL COLLATE 'utf8mb4_general_ci',
	`Statut` VARCHAR(20) NULL DEFAULT 'succès' COLLATE 'utf8mb4_general_ci',
	`SentDate` TIMESTAMP NULL DEFAULT current_timestamp(),
	`CreatedAt` TIMESTAMP NULL DEFAULT current_timestamp(),
	PRIMARY KEY (`Id`) USING BTREE,
	INDEX `idx_participant` (`ParticipantId`) USING BTREE,
	INDEX `idx_sent_date` (`SentDate`) USING BTREE,
	CONSTRAINT `SentSMS_ibfk_1` FOREIGN KEY (`ParticipantId`) REFERENCES `Participants` (`Id`) ON UPDATE RESTRICT ON DELETE CASCADE
)
COLLATE='utf8mb4_general_ci'
ENGINE=InnoDB;

-- ========================================
-- Initialization Complete
-- ========================================
-- Database and tables are ready to use!
-- 
-- Next steps:
-- 1. Create an admin user (see docs/EXAMPLE_USERS.sql)
-- 2. Import participants data if needed
-- 3. Configure your .env file with database credentials
