-- Données de test SocialFeed

INSERT OR IGNORE INTO users(username,display_name,email,password_hash,bio,avatar_url) VALUES
('alice','Alice Martin','alice@test.com','ccf5355ef562a04a348fbb984054b1de57e1e9a082339258c807a7346f3c1d51','Passionnée de photo 📸 et de voyages 🌍',''),
('bob','Bob Dupont','bob@test.com','ccf5355ef562a04a348fbb984054b1de57e1e9a082339258c807a7346f3c1d51','Dev Android & café ☕',''),
('charlie','Charlie Lebrun','charlie@test.com','ccf5355ef562a04a348fbb984054b1de57e1e9a082339258c807a7346f3c1d51','Footballeur amateur ⚽','');

-- Mot de passe par défaut : "password" pour tous les comptes de test (hash: sha256("password"+"sf2026salt"))

INSERT OR IGNORE INTO posts(user_id,content,created_at) VALUES
(1,'Bonjour tout le monde ! 👋 Bienvenue sur SocialFeed, le réseau social français !',datetime('now','-2 hours')),
(2,'Je viens de tester SocialFeed sur mobile... et ça marche parfaitement ! 🚀',datetime('now','-1 hour')),
(1,'Belle journée aujourd''hui ☀️ Profitez-en !',datetime('now','-30 minutes')),
(3,'Premier post ! Heureux de rejoindre la communauté 🎉',datetime('now','-15 minutes'));

INSERT OR IGNORE INTO likes(post_id,user_id,created_at) VALUES
(1,2,datetime('now','-1 hour')),(1,3,datetime('now','-45 minutes')),
(2,1,datetime('now','-50 minutes')),(2,3,datetime('now','-40 minutes')),
(3,2,datetime('now','-25 minutes'));

INSERT OR IGNORE INTO comments(post_id,user_id,content,created_at) VALUES
(1,2,'Bienvenue ! Super réseau 👍',datetime('now','-55 minutes')),
(1,3,'Hâte de voir les prochaines fonctionnalités !',datetime('now','-40 minutes')),
(2,1,'Merci ! L''équipe a travaillé dur 💪',datetime('now','-45 minutes'));
