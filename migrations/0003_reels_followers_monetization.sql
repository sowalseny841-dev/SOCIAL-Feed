-- ─── SYSTÈME DE FOLLOWERS ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS follows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  follower_id INTEGER NOT NULL,       -- celui qui suit
  following_id INTEGER NOT NULL,      -- celui qui est suivi
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(follower_id, following_id),
  FOREIGN KEY (follower_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (following_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ─── REELS (VIDÉOS COURTES) ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  title TEXT DEFAULT '',
  description TEXT DEFAULT '',
  video_url TEXT NOT NULL,              -- URL de la vidéo hébergée
  thumbnail_url TEXT DEFAULT '',        -- Miniature
  duration_seconds INTEGER DEFAULT 0,
  views_count INTEGER DEFAULT 0,
  likes_count INTEGER DEFAULT 0,
  comments_count INTEGER DEFAULT 0,
  shares_count INTEGER DEFAULT 0,
  is_monetized INTEGER DEFAULT 0,       -- 1 si le reel rapporte des revenus
  ad_revenue_xof REAL DEFAULT 0,        -- Revenus publicitaires accumulés
  privacy TEXT DEFAULT 'public',
  status TEXT DEFAULT 'active',         -- active | deleted | under_review
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ─── VUES DES REELS (pour le comptage unique) ────────────────────────────────
CREATE TABLE IF NOT EXISTS reel_views (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reel_id INTEGER NOT NULL,
  viewer_id INTEGER,                   -- NULL si non connecté
  ip_hash TEXT DEFAULT '',
  watch_duration_seconds INTEGER DEFAULT 0,
  viewed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (reel_id) REFERENCES reels(id) ON DELETE CASCADE
);

-- ─── LIKES DES REELS ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reel_likes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reel_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(reel_id, user_id),
  FOREIGN KEY (reel_id) REFERENCES reels(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ─── COMMENTAIRES DES REELS ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reel_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reel_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  content TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (reel_id) REFERENCES reels(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ─── PROGRAMME DE MONÉTISATION DES CRÉATEURS ────────────────────────────────
CREATE TABLE IF NOT EXISTS creator_monetization (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER UNIQUE NOT NULL,
  status TEXT DEFAULT 'not_eligible',
  -- not_eligible | pending_review | eligible | active | suspended
  
  -- Critères d'éligibilité
  followers_count INTEGER DEFAULT 0,
  views_last_60_days INTEGER DEFAULT 0,
  reels_count INTEGER DEFAULT 0,
  
  -- Seuils requis
  required_followers INTEGER DEFAULT 3000,
  required_views_60d INTEGER DEFAULT 500000,
  
  -- Revenus
  total_earnings_xof REAL DEFAULT 0,
  pending_payout_xof REAL DEFAULT 0,
  total_paid_xof REAL DEFAULT 0,
  
  -- Taux de rémunération (XOF par 1000 vues)
  rpm_xof REAL DEFAULT 25,   -- Revenue Per Mille (25 XOF / 1000 vues)
  
  -- Informations de paiement
  payment_method TEXT DEFAULT '',    -- orange_money | wave | mtn | bank
  payment_phone TEXT DEFAULT '',
  payment_bank_iban TEXT DEFAULT '',
  
  -- Dates
  applied_at DATETIME,
  approved_at DATETIME,
  last_payout_at DATETIME,
  next_payout_date DATETIME,
  last_stats_update DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ─── HISTORIQUE DES PAIEMENTS CRÉATEURS ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS creator_payouts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  amount_xof REAL NOT NULL,
  payment_method TEXT NOT NULL,
  payment_phone TEXT DEFAULT '',
  reference TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'pending',   -- pending | processing | completed | failed
  period_start DATE,
  period_end DATE,
  views_count INTEGER DEFAULT 0,
  reels_count INTEGER DEFAULT 0,
  note TEXT DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  paid_at DATETIME,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ─── STATISTIQUES JOURNALIÈRES DES CRÉATEURS ─────────────────────────────────
CREATE TABLE IF NOT EXISTS creator_daily_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  stat_date DATE NOT NULL,
  views INTEGER DEFAULT 0,
  new_followers INTEGER DEFAULT 0,
  reel_likes INTEGER DEFAULT 0,
  reel_comments INTEGER DEFAULT 0,
  estimated_earnings_xof REAL DEFAULT 0,
  UNIQUE(user_id, stat_date),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ─── INDEX PERFORMANCES ──────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(following_id);
CREATE INDEX IF NOT EXISTS idx_reels_user ON reels(user_id);
CREATE INDEX IF NOT EXISTS idx_reels_created ON reels(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reel_views_reel ON reel_views(reel_id);
CREATE INDEX IF NOT EXISTS idx_reel_views_date ON reel_views(viewed_at);
CREATE INDEX IF NOT EXISTS idx_reel_likes_reel ON reel_likes(reel_id);
CREATE INDEX IF NOT EXISTS idx_creator_stats_user ON creator_daily_stats(user_id, stat_date);
CREATE INDEX IF NOT EXISTS idx_creator_payouts_user ON creator_payouts(user_id);
