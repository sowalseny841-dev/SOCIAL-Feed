-- ─── MESSAGERIE PRIVÉE ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  participant1_id INTEGER NOT NULL,
  participant2_id INTEGER NOT NULL,
  last_message_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(participant1_id, participant2_id),
  FOREIGN KEY (participant1_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (participant2_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL,
  sender_id INTEGER NOT NULL,
  content TEXT NOT NULL,
  message_type TEXT DEFAULT 'text',
  is_read INTEGER DEFAULT 0,
  deleted_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ─── APPELS AUDIO / VIDÉO ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  caller_id INTEGER NOT NULL,
  callee_id INTEGER NOT NULL,
  call_type TEXT DEFAULT 'audio',
  status TEXT DEFAULT 'pending',
  started_at DATETIME,
  ended_at DATETIME,
  duration_seconds INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (caller_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (callee_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ─── MONÉTISATION ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscription_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  price_xof INTEGER NOT NULL,
  price_usd REAL NOT NULL,
  duration_days INTEGER NOT NULL,
  features TEXT NOT NULL,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  plan_id INTEGER NOT NULL,
  status TEXT DEFAULT 'active',
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  payment_ref TEXT,
  amount_paid INTEGER,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (plan_id) REFERENCES subscription_plans(id)
);

CREATE TABLE IF NOT EXISTS ads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  advertiser_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  image_url TEXT DEFAULT '',
  target_url TEXT NOT NULL,
  budget_xof INTEGER DEFAULT 0,
  spent_xof INTEGER DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending',
  ad_type TEXT DEFAULT 'banner',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME,
  FOREIGN KEY (advertiser_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ad_clicks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ad_id INTEGER NOT NULL,
  user_id INTEGER,
  ip_hash TEXT,
  clicked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (ad_id) REFERENCES ads(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS marketplace_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  seller_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  price_xof INTEGER NOT NULL,
  category TEXT DEFAULT 'autre',
  image_url TEXT DEFAULT '',
  condition TEXT DEFAULT 'bon',
  is_sold INTEGER DEFAULT 0,
  location TEXT DEFAULT '',
  views INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  amount_xof INTEGER NOT NULL,
  payment_type TEXT NOT NULL,
  reference TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'pending',
  provider TEXT DEFAULT 'orange_money',
  phone TEXT,
  metadata TEXT DEFAULT '{}',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ─── DONNÉES INITIALES : PLANS D'ABONNEMENT ─────────────────────────────────
INSERT OR IGNORE INTO subscription_plans (name, price_xof, price_usd, duration_days, features) VALUES
  ('Gratuit', 0, 0, 36500, '["Publications","Likes","Commentaires","Amis (max 500)","Messages (max 50/jour)"]'),
  ('Premium', 2500, 4, 30, '["Tout Gratuit","Amis illimités","Messages illimités","Appels audio","Badge Premium","Sans publicités","Priorité dans le fil"]'),
  ('Business', 9900, 16, 30, '["Tout Premium","Appels vidéo HD","Statistiques avancées","Publicités (budget 5000 XOF inclus)","Support prioritaire","Page entreprise vérifiée"]');

-- ─── INDEX PERFORMANCES ──────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_conversations_p1 ON conversations(participant1_id);
CREATE INDEX IF NOT EXISTS idx_conversations_p2 ON conversations(participant2_id);
CREATE INDEX IF NOT EXISTS idx_calls_caller ON calls(caller_id);
CREATE INDEX IF NOT EXISTS idx_calls_callee ON calls(callee_id);
CREATE INDEX IF NOT EXISTS idx_ads_status ON ads(status);
CREATE INDEX IF NOT EXISTS idx_marketplace_seller ON marketplace_items(seller_id);
CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);
