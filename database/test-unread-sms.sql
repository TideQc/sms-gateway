-- Test des SMS non lus
-- Exécutez ces requêtes après avoir créé la table ReceivedSMS

-- 1. D'abord, voir quels participants existent
SELECT Id, Prenom, NomDeFamille, NumeroTel FROM Participants LIMIT 10;

-- 2. Insérer des SMS pour les participants existants
-- REMPLACEZ les IDs (1, 2, 3) par les vrais IDs de vos participants!
-- Exemple : si le premier participant a l'ID 5, changez le (1, 'Bonjour...') en (5, 'Bonjour...')

-- Récupérez les vrais IDs avec la requête SELECT ci-dessus, puis modifiez les INSERT ci-dessous

-- OPTION 1 : Utiliser une approche dynamique basée sur les vrais participants
INSERT INTO ReceivedSMS (ParticipantId, Message, SenderNumber, IsRead, ReceivedDate) 
SELECT 
    p.Id,
    'Bonjour, je viens de terminer mon entraînement!',
    p.NumeroTel,
    0,
    NOW()
FROM Participants p
LIMIT 1;

INSERT INTO ReceivedSMS (ParticipantId, Message, SenderNumber, IsRead, ReceivedDate) 
SELECT 
    p.Id,
    'Peux-tu me rappeler l\'heure de la prochaine session?',
    p.NumeroTel,
    0,
    DATE_SUB(NOW(), INTERVAL 2 HOUR)
FROM Participants p
LIMIT 1 OFFSET 0;

INSERT INTO ReceivedSMS (ParticipantId, Message, SenderNumber, IsRead, ReceivedDate) 
SELECT 
    p.Id,
    'Je suis en retard, je serai là dans 10 minutes',
    p.NumeroTel,
    0,
    DATE_SUB(NOW(), INTERVAL 1 HOUR)
FROM Participants p
LIMIT 1 OFFSET 1;

INSERT INTO ReceivedSMS (ParticipantId, Message, SenderNumber, IsRead, ReceivedDate) 
SELECT 
    p.Id,
    'Merci pour ton aide aujourd\'hui!',
    p.NumeroTel,
    1,
    DATE_SUB(NOW(), INTERVAL 3 HOUR)
FROM Participants p
LIMIT 1 OFFSET 2;

-- Vérifier que les SMS ont bien été insérés
SELECT 
    r.Id,
    p.Prenom,
    p.NomDeFamille,
    p.NumeroTel,
    r.Message,
    r.IsRead,
    r.ReceivedDate
FROM ReceivedSMS r
JOIN Participants p ON r.ParticipantId = p.Id
ORDER BY r.ReceivedDate DESC;

-- Compter les SMS non lus par participant
SELECT 
    p.Prenom,
    p.NomDeFamille,
    COUNT(CASE WHEN r.IsRead = 0 THEN 1 END) as UnreadCount,
    COUNT(*) as TotalCount
FROM Participants p
LEFT JOIN ReceivedSMS r ON p.Id = r.ParticipantId
GROUP BY p.Id
ORDER BY UnreadCount DESC;
