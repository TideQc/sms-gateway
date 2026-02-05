-- Migration: Ajouter le support des SMS non lus
-- Créer la table ReceivedSMS pour tracker les SMS reçus

CREATE TABLE IF NOT EXISTS `ReceivedSMS` (
    `Id` INT PRIMARY KEY AUTO_INCREMENT,
    `ParticipantId` INT NOT NULL,
    `Message` LONGTEXT NOT NULL,
    `SenderNumber` VARCHAR(20) NULL,
    `IsRead` TINYINT DEFAULT 0,
    `ReceivedDate` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `ReadDate` TIMESTAMP NULL,
    `CreatedAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`ParticipantId`) REFERENCES `Participants`(`Id`) ON DELETE CASCADE,
    INDEX `idx_participant_read` (`ParticipantId`, `IsRead`),
    INDEX `idx_received_date` (`ReceivedDate`)
);

-- Alter la table Participants pour ajouter le support des SMS reçus (optionnel)
-- ALTER TABLE `Participants` ADD COLUMN `LastReceivedSMSDate` TIMESTAMP NULL;

-- Exemple de requête pour récupérer le nombre de SMS non lus par participant:
-- SELECT p.Id, p.Prenom, p.NomDeFamille, COUNT(r.Id) as UnreadCount
-- FROM Participants p
-- LEFT JOIN ReceivedSMS r ON p.Id = r.ParticipantId AND r.IsRead = 0
-- GROUP BY p.Id
-- ORDER BY UnreadCount DESC;
