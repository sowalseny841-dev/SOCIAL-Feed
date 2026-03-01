import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { serveStatic } from 'hono/cloudflare-workers'

type Bindings = {
  DB: D1Database
}

type Variables = {
  userId: number
  user: {
    id: number
    username: string
    display_name: string
    avatar_url: string
  }
}

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>()

app.use('*', cors())
app.use('/static/*', serveStatic({ root: './public' }))

// ─── Helpers ───────────────────────────────────────────────────────────────

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(password + 'social_feed_salt_2026')
  const hash = await crypto.subtle.digest('SHA-256', data)
  return btoa(String.fromCharCode(...new Uint8Array(hash)))
}

function generateSessionId(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, '')
}

function timeAgo(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diff = Math.floor((now - then) / 1000)
  if (diff < 60) return `${diff}s`
  if (diff < 3600) return `${Math.floor(diff / 60)}min`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  if (diff < 604800) return `${Math.floor(diff / 86400)}j`
  return new Date(dateStr).toLocaleDateString('fr-FR')
}

// Middleware auth
async function authMiddleware(c: any, next: any) {
  const sessionId = getCookie(c, 'session')
  if (!sessionId) return c.redirect('/login')
  const session = await c.env.DB.prepare(
    'SELECT s.user_id, u.username, u.display_name, u.avatar_url FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.id = ? AND s.expires_at > datetime("now")'
  ).bind(sessionId).first()
  if (!session) {
    deleteCookie(c, 'session')
    return c.redirect('/login')
  }
  c.set('userId', session.user_id)
  c.set('user', { id: session.user_id, username: session.username, display_name: session.display_name, avatar_url: session.avatar_url })
  await next()
}

// ─── HTML Layout ────────────────────────────────────────────────────────────

function layout(title: string, body: string, user?: any, extraHead = ''): string {
  const isLoggedIn = !!user
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${title} – SocialFeed</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.5.0/css/all.min.css"/>
  <link rel="stylesheet" href="/static/style.css"/>
  ${extraHead}
</head>
<body>
${isLoggedIn ? navbar(user) : ''}
<div class="page-wrapper ${isLoggedIn ? 'with-nav' : ''}">
${body}
</div>
${isLoggedIn ? mobileNav() : ''}
<script src="/static/app.js"></script>
</body>
</html>`
}

function navbar(user: any): string {
  return `
<nav class="navbar">
  <div class="nav-left">
    <a href="/" class="nav-logo"><i class="fas fa-share-alt"></i> SocialFeed</a>
  </div>
  <div class="nav-center">
    <a href="/" class="nav-btn" title="Accueil"><i class="fas fa-home"></i></a>
    <a href="/friends" class="nav-btn" title="Amis"><i class="fas fa-user-friends"></i></a>
    <a href="/messages" class="nav-btn" title="Messages" id="msg-nav-btn">
      <i class="fas fa-comment-dots"></i>
      <span class="notif-badge hidden" id="msg-count"></span>
    </a>
    <a href="/notifications" class="nav-btn" title="Notifications" id="notif-btn">
      <i class="fas fa-bell"></i>
      <span class="notif-badge hidden" id="notif-count"></span>
    </a>
    <a href="/reels" class="nav-btn" title="Reels"><i class="fas fa-film"></i></a>
    <a href="/marketplace" class="nav-btn" title="Marketplace"><i class="fas fa-store"></i></a>
  </div>
  <div class="nav-right">
    <a href="/creator" class="nav-btn nav-creator" title="Dashboard Créateur"><i class="fas fa-dollar-sign"></i></a>
    <a href="/premium" class="nav-btn nav-premium" title="Premium"><i class="fas fa-crown"></i></a>
    <a href="/profile/${user.username}" class="nav-avatar" title="${user.display_name}">
      ${user.avatar_url
        ? `<img src="${user.avatar_url}" alt="avatar" class="avatar-sm"/>`
        : `<div class="avatar-sm avatar-placeholder">${user.display_name[0].toUpperCase()}</div>`}
    </a>
    <a href="/logout" class="nav-btn" title="Déconnexion"><i class="fas fa-sign-out-alt"></i></a>
  </div>
</nav>`
}

function mobileNav(): string {
  return `
<nav class="mobile-nav">
  <a href="/" class="mobile-nav-btn"><i class="fas fa-home"></i><span>Accueil</span></a>
  <a href="/friends" class="mobile-nav-btn"><i class="fas fa-user-friends"></i><span>Amis</span></a>
  <a href="/messages" class="mobile-nav-btn"><i class="fas fa-comment-dots"></i><span>Messages</span></a>
  <a href="/reels" class="mobile-nav-btn"><i class="fas fa-film"></i><span>Reels</span></a>
  <a href="/creator" class="mobile-nav-btn mobile-creator"><i class="fas fa-dollar-sign"></i><span>Revenus</span></a>
  <a href="/premium" class="mobile-nav-btn mobile-premium"><i class="fas fa-crown"></i><span>Premium</span></a>
</nav>`
}

function avatarHtml(user: any, size = 'md'): string {
  if (user.avatar_url) {
    return `<img src="${user.avatar_url}" alt="avatar" class="avatar-${size}"/>`
  }
  const initial = (user.display_name || user.username || '?')[0].toUpperCase()
  return `<div class="avatar-${size} avatar-placeholder" style="background:${stringToColor(user.display_name || user.username)}">${initial}</div>`
}

function stringToColor(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash)
  return `hsl(${Math.abs(hash) % 360}, 60%, 50%)`
}

function postCard(post: any, currentUserId: number): string {
  const liked = post.user_liked == 1
  return `
<article class="post-card" data-post-id="${post.id}">
  <div class="post-header">
    <a href="/profile/${post.username}" class="post-author-link">
      ${avatarHtml(post, 'md')}
      <div class="post-author-info">
        <span class="post-author-name">${post.display_name}</span>
        <span class="post-time"><i class="fas fa-clock"></i> ${timeAgo(post.created_at)}</span>
      </div>
    </a>
    ${post.user_id === currentUserId ? `
    <div class="post-menu">
      <button class="post-menu-btn" onclick="toggleMenu(this)"><i class="fas fa-ellipsis-h"></i></button>
      <div class="post-menu-dropdown hidden">
        <button onclick="deletePost(${post.id})"><i class="fas fa-trash"></i> Supprimer</button>
      </div>
    </div>` : ''}
  </div>
  <div class="post-body">
    <p class="post-content">${escapeHtml(post.content)}</p>
    ${post.image_url ? `<img src="${post.image_url}" alt="image" class="post-image" onerror="this.style.display='none'"/>` : ''}
  </div>
  <div class="post-stats">
    <span class="stat-item">${post.likes_count || 0} <i class="fas fa-heart"></i></span>
    <span class="stat-item">${post.comments_count || 0} commentaire${(post.comments_count || 0) > 1 ? 's' : ''}</span>
  </div>
  <div class="post-actions">
    <button class="action-btn ${liked ? 'liked' : ''}" onclick="toggleLike(${post.id}, this)">
      <i class="${liked ? 'fas' : 'far'} fa-heart"></i>
      <span>J'aime</span>
    </button>
    <button class="action-btn" onclick="toggleComments(${post.id})">
      <i class="far fa-comment"></i>
      <span>Commenter</span>
    </button>
    <button class="action-btn" onclick="sharePost(${post.id})">
      <i class="fas fa-share"></i>
      <span>Partager</span>
    </button>
  </div>
  <div class="comments-section hidden" id="comments-${post.id}">
    <div class="comments-list" id="comments-list-${post.id}"></div>
    <form class="comment-form" onsubmit="addComment(event, ${post.id})">
      <input type="text" placeholder="Écrire un commentaire…" class="comment-input" required/>
      <button type="submit" class="comment-submit"><i class="fas fa-paper-plane"></i></button>
    </form>
  </div>
</article>`
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/\n/g, '<br/>')
}

// ─── Routes publiques ────────────────────────────────────────────────────────

// Page d'inscription
app.get('/register', (c) => {
  const body = `
<div class="auth-container">
  <div class="auth-card">
    <div class="auth-logo"><i class="fas fa-share-alt"></i></div>
    <h1 class="auth-title">SocialFeed</h1>
    <p class="auth-subtitle">Rejoignez la communauté</p>
    <form class="auth-form" method="POST" action="/register">
      <div class="form-group">
        <input type="text" name="display_name" placeholder="Prénom et Nom" required class="form-input" maxlength="50"/>
      </div>
      <div class="form-group">
        <input type="text" name="username" placeholder="Nom d'utilisateur" required class="form-input" maxlength="30" pattern="[a-zA-Z0-9_]+"/>
      </div>
      <div class="form-group">
        <input type="email" name="email" placeholder="Adresse email" required class="form-input"/>
      </div>
      <div class="form-group">
        <input type="password" name="password" placeholder="Mot de passe" required class="form-input" minlength="6"/>
      </div>
      <button type="submit" class="btn-primary btn-full">Créer mon compte</button>
    </form>
    <div class="auth-divider"><span>ou</span></div>
    <a href="/login" class="btn-secondary btn-full">Se connecter</a>
    <p class="auth-terms">En vous inscrivant, vous acceptez nos conditions d'utilisation.</p>
  </div>
</div>`
  return c.html(layout('Inscription', body))
})

app.post('/register', async (c) => {
  const form = await c.req.formData()
  const display_name = (form.get('display_name') as string || '').trim()
  const username = (form.get('username') as string || '').trim().toLowerCase()
  const email = (form.get('email') as string || '').trim().toLowerCase()
  const password = form.get('password') as string || ''
  if (!display_name || !username || !email || !password) {
    return c.html(layout('Inscription', `<div class="auth-container"><div class="auth-card"><p class="error-msg">Tous les champs sont requis.</p><a href="/register" class="btn-primary btn-full">Retour</a></div></div>`))
  }
  const passwordHash = await hashPassword(password)
  try {
    await c.env.DB.prepare(
      'INSERT INTO users (username, email, password_hash, display_name) VALUES (?, ?, ?, ?)'
    ).bind(username, email, passwordHash, display_name).run()
    const user = await c.env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(username).first()
    const sessionId = generateSessionId()
    await c.env.DB.prepare(
      'INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, datetime("now", "+30 days"))'
    ).bind(sessionId, user!.id).run()
    setCookie(c, 'session', sessionId, { httpOnly: true, maxAge: 30 * 24 * 3600, path: '/', sameSite: 'Lax' })
    return c.redirect('/')
  } catch (e: any) {
    const msg = e.message?.includes('UNIQUE') ? 'Cet utilisateur ou email existe déjà.' : 'Erreur lors de la création du compte.'
    return c.html(layout('Inscription', `<div class="auth-container"><div class="auth-card"><p class="error-msg">${msg}</p><a href="/register" class="btn-primary btn-full">Retour</a></div></div>`))
  }
})

// Page de connexion
app.get('/login', (c) => {
  const body = `
<div class="auth-container">
  <div class="auth-card">
    <div class="auth-logo"><i class="fas fa-share-alt"></i></div>
    <h1 class="auth-title">SocialFeed</h1>
    <p class="auth-subtitle">Connectez-vous à votre compte</p>
    <form class="auth-form" method="POST" action="/login">
      <div class="form-group">
        <input type="text" name="identifier" placeholder="Email ou nom d'utilisateur" required class="form-input"/>
      </div>
      <div class="form-group">
        <input type="password" name="password" placeholder="Mot de passe" required class="form-input"/>
      </div>
      <button type="submit" class="btn-primary btn-full">Se connecter</button>
    </form>
    <div class="auth-divider"><span>ou</span></div>
    <a href="/register" class="btn-secondary btn-full">Créer un nouveau compte</a>
  </div>
</div>`
  return c.html(layout('Connexion', body))
})

app.post('/login', async (c) => {
  const form = await c.req.formData()
  const identifier = (form.get('identifier') as string || '').trim().toLowerCase()
  const password = form.get('password') as string || ''
  const passwordHash = await hashPassword(password)
  const user = await c.env.DB.prepare(
    'SELECT * FROM users WHERE (email = ? OR username = ?) AND password_hash = ?'
  ).bind(identifier, identifier, passwordHash).first()
  if (!user) {
    return c.html(layout('Connexion', `<div class="auth-container"><div class="auth-card"><p class="error-msg">Identifiants incorrects.</p><a href="/login" class="btn-primary btn-full">Retour</a></div></div>`))
  }
  const sessionId = generateSessionId()
  await c.env.DB.prepare(
    'INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, datetime("now", "+30 days"))'
  ).bind(sessionId, user.id).run()
  setCookie(c, 'session', sessionId, { httpOnly: true, maxAge: 30 * 24 * 3600, path: '/', sameSite: 'Lax' })
  return c.redirect('/')
})

app.get('/logout', (c) => {
  deleteCookie(c, 'session')
  return c.redirect('/login')
})

// ─── Routes protégées ───────────────────────────────────────────────────────

// Fil d'actualité principal
app.get('/', authMiddleware, async (c) => {
  const user = c.get('user')
  const userId = c.get('userId')
  const posts = await c.env.DB.prepare(`
    SELECT p.*, u.username, u.display_name, u.avatar_url,
      (SELECT COUNT(*) FROM likes WHERE post_id = p.id) AS likes_count,
      (SELECT COUNT(*) FROM comments WHERE post_id = p.id) AS comments_count,
      (SELECT COUNT(*) FROM likes WHERE post_id = p.id AND user_id = ?) AS user_liked
    FROM posts p
    JOIN users u ON p.user_id = u.id
    ORDER BY p.created_at DESC
    LIMIT 50
  `).bind(userId).all()

  const postCards = posts.results.map((p: any) => postCard(p, userId)).join('')
  const body = `
<div class="feed-layout">
  <!-- Sidebar gauche -->
  <aside class="sidebar-left">
    <div class="sidebar-card">
      <a href="/profile/${user.username}" class="sidebar-profile-link">
        ${avatarHtml(user, 'lg')}
        <span class="sidebar-username">${user.display_name}</span>
      </a>
    </div>
    <div class="sidebar-menu">
      <a href="/" class="sidebar-link active"><i class="fas fa-home"></i> Fil d'actualité</a>
      <a href="/friends" class="sidebar-link"><i class="fas fa-user-friends"></i> Amis</a>
      <a href="/notifications" class="sidebar-link"><i class="fas fa-bell"></i> Notifications</a>
      <a href="/profile/${user.username}" class="sidebar-link"><i class="fas fa-user"></i> Mon profil</a>
      <a href="/search" class="sidebar-link"><i class="fas fa-search"></i> Rechercher</a>
    </div>
  </aside>

  <!-- Feed central -->
  <main class="feed-main">
    <!-- Créateur de publication -->
    <div class="create-post-card">
      <div class="create-post-top">
        ${avatarHtml(user, 'md')}
        <button class="create-post-btn" onclick="openPostModal()">Quoi de neuf, ${user.display_name.split(' ')[0]} ?</button>
      </div>
      <div class="create-post-actions">
        <button class="create-action-btn" onclick="openPostModal('photo')"><i class="fas fa-image" style="color:#45BD62"></i> Photo</button>
        <button class="create-action-btn" onclick="openPostModal()"><i class="fas fa-video" style="color:#F3425F"></i> Vidéo</button>
        <button class="create-action-btn" onclick="openPostModal()"><i class="fas fa-smile" style="color:#F7B928"></i> Humeur</button>
      </div>
    </div>

    <!-- Publications -->
    <div id="posts-feed">
      ${posts.results.length ? postCards : `
      <div class="empty-feed">
        <i class="fas fa-newspaper"></i>
        <p>Aucune publication pour l'instant.</p>
        <p>Soyez le premier à publier !</p>
      </div>`}
    </div>
  </main>

  <!-- Sidebar droite -->
  <aside class="sidebar-right">
    <div class="sidebar-card">
      <h3 class="sidebar-title"><i class="fas fa-user-plus"></i> Suggestions</h3>
      <div id="suggestions-list">
        <p class="sidebar-empty"><i class="fas fa-spinner fa-spin"></i> Chargement...</p>
      </div>
    </div>
  </aside>
</div>

<!-- Modal de création de post -->
<div class="modal-overlay hidden" id="post-modal">
  <div class="modal-card">
    <div class="modal-header">
      <h2>Créer une publication</h2>
      <button class="modal-close" onclick="closePostModal()"><i class="fas fa-times"></i></button>
    </div>
    <div class="modal-author">
      ${avatarHtml(user, 'md')}
      <div>
        <span class="modal-author-name">${user.display_name}</span>
        <span class="modal-privacy"><i class="fas fa-globe-europe"></i> Public</span>
      </div>
    </div>
    <form id="post-form" onsubmit="submitPost(event)">
      <textarea id="post-content" name="content" placeholder="Quoi de neuf ?" class="modal-textarea" required maxlength="2000"></textarea>
      <div id="image-preview-container" class="hidden">
        <img id="image-preview" src="" alt="preview" class="post-image-preview"/>
        <button type="button" onclick="removeImage()" class="remove-image-btn"><i class="fas fa-times"></i></button>
      </div>
      <input type="text" id="post-image-url" name="image_url" placeholder="URL d'une image (optionnel)" class="form-input mt-sm"/>
      <div class="modal-footer">
        <span class="char-count"><span id="char-count">0</span>/2000</span>
        <button type="submit" class="btn-primary" id="post-submit-btn">Publier</button>
      </div>
    </form>
  </div>
</div>`

  return c.html(layout('Accueil', body, user, `<script>const CURRENT_USER_ID = ${userId};</script>`))
})

// Page de recherche
app.get('/search', authMiddleware, async (c) => {
  const user = c.get('user')
  const userId = c.get('userId')
  const q = c.req.query('q') || ''
  let results: any[] = []
  if (q) {
    const res = await c.env.DB.prepare(
      'SELECT id, username, display_name, avatar_url, bio FROM users WHERE (username LIKE ? OR display_name LIKE ?) AND id != ? LIMIT 20'
    ).bind(`%${q}%`, `%${q}%`, userId).all()
    results = res.results
  }
  const body = `
<div class="search-container">
  <div class="search-header">
    <form method="GET" action="/search" class="search-form-main">
      <div class="search-input-wrap">
        <i class="fas fa-search search-icon"></i>
        <input type="text" name="q" value="${q}" placeholder="Rechercher des personnes…" class="search-input-main" autofocus/>
      </div>
      <button type="submit" class="btn-primary">Rechercher</button>
    </form>
  </div>
  ${q ? `<h2 class="search-results-title">Résultats pour "${q}" (${results.length})</h2>` : '<h2 class="search-results-title">Trouvez des personnes</h2>'}
  <div class="users-grid">
    ${results.map((u: any) => `
    <div class="user-card">
      <a href="/profile/${u.username}">
        ${avatarHtml(u, 'xl')}
        <span class="user-card-name">${u.display_name}</span>
        <span class="user-card-username">@${u.username}</span>
        ${u.bio ? `<p class="user-card-bio">${escapeHtml(u.bio.substring(0, 60))}${u.bio.length > 60 ? '…' : ''}</p>` : ''}
      </a>
      <button class="btn-primary btn-sm" onclick="addFriend(${u.id}, this)">
        <i class="fas fa-user-plus"></i> Ajouter
      </button>
    </div>`).join('') || (!q ? '' : '<p class="empty-result">Aucun résultat trouvé.</p>')}
  </div>
</div>`
  return c.html(layout('Recherche', body, user))
})

// Page profil utilisateur
app.get('/profile/:username', authMiddleware, async (c) => {
  const user = c.get('user')
  const userId = c.get('userId')
  const username = c.req.param('username')
  const profile = await c.env.DB.prepare('SELECT * FROM users WHERE username = ?').bind(username).first()
  if (!profile) return c.html(layout('Profil introuvable', '<div class="auth-container"><div class="auth-card"><h2>Profil introuvable</h2><a href="/" class="btn-primary">Retour</a></div></div>', user))
  const isOwn = (profile as any).id === userId
  const posts = await c.env.DB.prepare(`
    SELECT p.*, u.username, u.display_name, u.avatar_url,
      (SELECT COUNT(*) FROM likes WHERE post_id = p.id) AS likes_count,
      (SELECT COUNT(*) FROM comments WHERE post_id = p.id) AS comments_count,
      (SELECT COUNT(*) FROM likes WHERE post_id = p.id AND user_id = ?) AS user_liked
    FROM posts p
    JOIN users u ON p.user_id = u.id
    WHERE p.user_id = ?
    ORDER BY p.created_at DESC
    LIMIT 30
  `).bind(userId, (profile as any).id).all()

  const postsCount = posts.results.length
  const p = profile as any

  const body = `
<div class="profile-layout">
  <!-- Cover & Avatar -->
  <div class="profile-cover" style="${p.cover_url ? `background-image:url('${p.cover_url}')` : 'background: linear-gradient(135deg, #1877F2 0%, #42B72A 100%)'}">
    ${isOwn ? `<button class="cover-edit-btn" onclick="document.getElementById('cover-modal').classList.remove('hidden')"><i class="fas fa-camera"></i> Modifier la couverture</button>` : ''}
  </div>
  <div class="profile-info-bar">
    <div class="profile-avatar-wrap">
      ${avatarHtml(p, 'xxl')}
      ${isOwn ? `<button class="avatar-edit-btn" onclick="document.getElementById('avatar-modal').classList.remove('hidden')"><i class="fas fa-camera"></i></button>` : ''}
    </div>
    <div class="profile-details">
      <h1 class="profile-name">${p.display_name}</h1>
      <p class="profile-username">@${p.username}</p>
      ${p.bio ? `<p class="profile-bio">${escapeHtml(p.bio)}</p>` : ''}
      <div class="profile-stats">
        <span><strong>${postsCount}</strong> publications</span>
      </div>
    </div>
    <div class="profile-actions">
      ${isOwn
        ? `<button class="btn-secondary" onclick="document.getElementById('edit-profile-modal').classList.remove('hidden')"><i class="fas fa-edit"></i> Modifier le profil</button>`
        : `<button class="btn-primary" id="friend-btn-${p.id}" onclick="addFriend(${p.id}, this)"><i class="fas fa-user-plus"></i> Ajouter en ami</button>`}
    </div>
  </div>

  <!-- Onglets -->
  <div class="profile-tabs">
    <button class="profile-tab active" onclick="showTab('posts')"><i class="fas fa-th-large"></i> Publications</button>
    <button class="profile-tab" onclick="showTab('about')"><i class="fas fa-info-circle"></i> À propos</button>
  </div>

  <!-- Contenu des onglets -->
  <div class="profile-content">
    <div id="tab-posts" class="tab-content">
      ${posts.results.length
        ? posts.results.map((post: any) => postCard(post, userId)).join('')
        : `<div class="empty-feed"><i class="fas fa-images"></i><p>Aucune publication pour l'instant.</p></div>`}
    </div>
    <div id="tab-about" class="tab-content hidden">
      <div class="about-card">
        <h3><i class="fas fa-user"></i> Informations</h3>
        <p><i class="fas fa-at"></i> <strong>Nom d'utilisateur :</strong> @${p.username}</p>
        <p><i class="fas fa-envelope"></i> <strong>Email :</strong> ${isOwn ? p.email : '***@***.***'}</p>
        <p><i class="fas fa-calendar-alt"></i> <strong>Membre depuis :</strong> ${new Date(p.created_at).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</p>
        ${p.bio ? `<p><i class="fas fa-quote-left"></i> <strong>Bio :</strong> ${escapeHtml(p.bio)}</p>` : ''}
      </div>
    </div>
  </div>
</div>

${isOwn ? editProfileModal(p) : ''}
${isOwn ? avatarModal() : ''}
${isOwn ? coverModal() : ''}`

  return c.html(layout(p.display_name, body, user, `<script>const CURRENT_USER_ID = ${userId};</script>`))
})

function editProfileModal(p: any): string {
  return `
<div class="modal-overlay hidden" id="edit-profile-modal">
  <div class="modal-card">
    <div class="modal-header">
      <h2>Modifier le profil</h2>
      <button class="modal-close" onclick="document.getElementById('edit-profile-modal').classList.add('hidden')"><i class="fas fa-times"></i></button>
    </div>
    <form method="POST" action="/api/profile/update" class="auth-form">
      <div class="form-group">
        <label class="form-label">Prénom et Nom</label>
        <input type="text" name="display_name" value="${p.display_name}" required class="form-input" maxlength="50"/>
      </div>
      <div class="form-group">
        <label class="form-label">Bio</label>
        <textarea name="bio" class="form-input" rows="3" maxlength="200" placeholder="Parlez de vous...">${p.bio || ''}</textarea>
      </div>
      <button type="submit" class="btn-primary btn-full">Enregistrer</button>
    </form>
  </div>
</div>`
}

function avatarModal(): string {
  return `
<div class="modal-overlay hidden" id="avatar-modal">
  <div class="modal-card modal-sm">
    <div class="modal-header">
      <h2>Changer la photo de profil</h2>
      <button class="modal-close" onclick="document.getElementById('avatar-modal').classList.add('hidden')"><i class="fas fa-times"></i></button>
    </div>
    <form method="POST" action="/api/profile/avatar" class="auth-form">
      <input type="url" name="avatar_url" placeholder="URL de votre photo" class="form-input" required/>
      <button type="submit" class="btn-primary btn-full mt-sm">Mettre à jour</button>
    </form>
  </div>
</div>`
}

function coverModal(): string {
  return `
<div class="modal-overlay hidden" id="cover-modal">
  <div class="modal-card modal-sm">
    <div class="modal-header">
      <h2>Changer la photo de couverture</h2>
      <button class="modal-close" onclick="document.getElementById('cover-modal').classList.add('hidden')"><i class="fas fa-times"></i></button>
    </div>
    <form method="POST" action="/api/profile/cover" class="auth-form">
      <input type="url" name="cover_url" placeholder="URL de votre image de couverture" class="form-input" required/>
      <button type="submit" class="btn-primary btn-full mt-sm">Mettre à jour</button>
    </form>
  </div>
</div>`
}

// Page notifications
app.get('/notifications', authMiddleware, async (c) => {
  const user = c.get('user')
  const userId = c.get('userId')
  const notifs = await c.env.DB.prepare(`
    SELECT n.*, u.username AS actor_username, u.display_name AS actor_name, u.avatar_url AS actor_avatar
    FROM notifications n
    JOIN users u ON n.actor_id = u.id
    WHERE n.user_id = ?
    ORDER BY n.created_at DESC
    LIMIT 50
  `).bind(userId).all()
  await c.env.DB.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').bind(userId).run()

  const notifItems = notifs.results.map((n: any) => {
    const icon = n.type === 'like' ? '❤️' : n.type === 'comment' ? '💬' : n.type === 'friend' ? '👥' : '🔔'
    const text = n.type === 'like' ? 'a aimé votre publication' : n.type === 'comment' ? 'a commenté votre publication' : n.type === 'friend' ? 'vous a envoyé une demande d\'ami' : 'vous a notifié'
    return `
    <div class="notif-item ${n.is_read ? '' : 'notif-unread'}">
      <a href="/profile/${n.actor_username}">
        ${avatarHtml({ display_name: n.actor_name, avatar_url: n.actor_avatar }, 'md')}
      </a>
      <div class="notif-content">
        <p><a href="/profile/${n.actor_username}" class="notif-actor">${n.actor_name}</a> ${text}</p>
        <span class="notif-time">${timeAgo(n.created_at)}</span>
      </div>
      <span class="notif-icon">${icon}</span>
    </div>`
  }).join('')

  const body = `
<div class="notif-container">
  <h1 class="page-title"><i class="fas fa-bell"></i> Notifications</h1>
  <div class="notif-list">
    ${notifItems || '<div class="empty-feed"><i class="fas fa-bell-slash"></i><p>Aucune notification pour l\'instant.</p></div>'}
  </div>
</div>`
  return c.html(layout('Notifications', body, user))
})

// Page amis
app.get('/friends', authMiddleware, async (c) => {
  const user = c.get('user')
  const userId = c.get('userId')
  const requests = await c.env.DB.prepare(`
    SELECT f.id, u.username, u.display_name, u.avatar_url, f.created_at
    FROM friendships f
    JOIN users u ON f.requester_id = u.id
    WHERE f.addressee_id = ? AND f.status = 'pending'
    ORDER BY f.created_at DESC
  `).bind(userId).all()

  const friends = await c.env.DB.prepare(`
    SELECT u.username, u.display_name, u.avatar_url
    FROM friendships f
    JOIN users u ON (f.requester_id = u.id OR f.addressee_id = u.id)
    WHERE (f.requester_id = ? OR f.addressee_id = ?) AND f.status = 'accepted' AND u.id != ?
    ORDER BY f.updated_at DESC
  `).bind(userId, userId, userId).all()

  const suggestions = await c.env.DB.prepare(`
    SELECT u.id, u.username, u.display_name, u.avatar_url
    FROM users u
    WHERE u.id != ?
      AND u.id NOT IN (
        SELECT CASE WHEN requester_id = ? THEN addressee_id ELSE requester_id END
        FROM friendships
        WHERE requester_id = ? OR addressee_id = ?
      )
    ORDER BY RANDOM()
    LIMIT 10
  `).bind(userId, userId, userId, userId).all()

  const body = `
<div class="friends-container">
  ${(requests.results as any[]).length > 0 ? `
  <section class="friends-section">
    <h2 class="section-title"><i class="fas fa-user-clock"></i> Demandes d'amis (${requests.results.length})</h2>
    <div class="friends-grid">
      ${(requests.results as any[]).map((r: any) => `
      <div class="friend-card" id="req-${r.id}">
        <a href="/profile/${r.username}">
          ${avatarHtml(r, 'xl')}
          <span class="friend-name">${r.display_name}</span>
          <span class="friend-username">@${r.username}</span>
        </a>
        <div class="friend-btns">
          <button class="btn-primary btn-sm" onclick="respondFriend(${r.id}, 'accept', '${r.id}')">
            <i class="fas fa-check"></i> Accepter
          </button>
          <button class="btn-secondary btn-sm" onclick="respondFriend(${r.id}, 'reject', '${r.id}')">
            <i class="fas fa-times"></i> Refuser
          </button>
        </div>
      </div>`).join('')}
    </div>
  </section>` : ''}

  <section class="friends-section">
    <h2 class="section-title"><i class="fas fa-user-friends"></i> Mes amis (${friends.results.length})</h2>
    <div class="friends-grid">
      ${(friends.results as any[]).map((f: any) => `
      <div class="friend-card">
        <a href="/profile/${f.username}">
          ${avatarHtml(f, 'xl')}
          <span class="friend-name">${f.display_name}</span>
          <span class="friend-username">@${f.username}</span>
        </a>
        <a href="/profile/${f.username}" class="btn-secondary btn-sm"><i class="fas fa-user"></i> Voir le profil</a>
      </div>`).join('') || '<p class="empty-result">Vous n\'avez pas encore d\'amis. Explorez des suggestions !</p>'}
    </div>
  </section>

  <section class="friends-section">
    <h2 class="section-title"><i class="fas fa-user-plus"></i> Suggestions (${suggestions.results.length})</h2>
    <div class="friends-grid">
      ${(suggestions.results as any[]).map((u: any) => `
      <div class="friend-card" id="sug-${u.id}">
        <a href="/profile/${u.username}">
          ${avatarHtml(u, 'xl')}
          <span class="friend-name">${u.display_name}</span>
          <span class="friend-username">@${u.username}</span>
        </a>
        <button class="btn-primary btn-sm" onclick="addFriend(${u.id}, this, 'sug-${u.id}')">
          <i class="fas fa-user-plus"></i> Ajouter
        </button>
      </div>`).join('') || '<p class="empty-result">Aucune suggestion disponible.</p>'}
    </div>
  </section>
</div>`
  return c.html(layout('Amis', body, user))
})

// ─── API Routes ──────────────────────────────────────────────────────────────

// Créer un post
app.post('/api/posts', authMiddleware, async (c) => {
  const userId = c.get('userId')
  const form = await c.req.formData().catch(() => null)
  let content = '', image_url = ''
  if (form) {
    content = (form.get('content') as string || '').trim()
    image_url = (form.get('image_url') as string || '').trim()
  } else {
    const json = await c.req.json().catch(() => ({}))
    content = (json.content || '').trim()
    image_url = (json.image_url || '').trim()
  }
  if (!content) return c.json({ error: 'Contenu requis' }, 400)
  const res = await c.env.DB.prepare(
    'INSERT INTO posts (user_id, content, image_url) VALUES (?, ?, ?)'
  ).bind(userId, content, image_url).run()
  const post = await c.env.DB.prepare(`
    SELECT p.*, u.username, u.display_name, u.avatar_url,
      0 AS likes_count, 0 AS comments_count, 0 AS user_liked
    FROM posts p JOIN users u ON p.user_id = u.id WHERE p.id = ?
  `).bind(res.meta.last_row_id).first()
  return c.json({ success: true, post })
})

// Supprimer un post
app.delete('/api/posts/:id', authMiddleware, async (c) => {
  const userId = c.get('userId')
  const postId = c.req.param('id')
  const post = await c.env.DB.prepare('SELECT user_id FROM posts WHERE id = ?').bind(postId).first()
  if (!post || (post as any).user_id !== userId) return c.json({ error: 'Non autorisé' }, 403)
  await c.env.DB.prepare('DELETE FROM posts WHERE id = ?').bind(postId).run()
  return c.json({ success: true })
})

// Toggle like
app.post('/api/posts/:id/like', authMiddleware, async (c) => {
  const userId = c.get('userId')
  const postId = c.req.param('id')
  const existing = await c.env.DB.prepare('SELECT id FROM likes WHERE user_id = ? AND post_id = ?').bind(userId, postId).first()
  if (existing) {
    await c.env.DB.prepare('DELETE FROM likes WHERE user_id = ? AND post_id = ?').bind(userId, postId).run()
  } else {
    await c.env.DB.prepare('INSERT INTO likes (user_id, post_id) VALUES (?, ?)').bind(userId, postId).run()
    const post = await c.env.DB.prepare('SELECT user_id FROM posts WHERE id = ?').bind(postId).first()
    if (post && (post as any).user_id !== userId) {
      await c.env.DB.prepare(
        'INSERT INTO notifications (user_id, actor_id, type, post_id) VALUES (?, ?, "like", ?)'
      ).bind((post as any).user_id, userId, postId).run()
    }
  }
  const count = await c.env.DB.prepare('SELECT COUNT(*) AS cnt FROM likes WHERE post_id = ?').bind(postId).first()
  return c.json({ liked: !existing, count: (count as any).cnt })
})

// Récupérer les commentaires
app.get('/api/posts/:id/comments', authMiddleware, async (c) => {
  const postId = c.req.param('id')
  const comments = await c.env.DB.prepare(`
    SELECT c.*, u.username, u.display_name, u.avatar_url
    FROM comments c JOIN users u ON c.user_id = u.id
    WHERE c.post_id = ?
    ORDER BY c.created_at ASC
    LIMIT 50
  `).bind(postId).all()
  return c.json({ comments: comments.results })
})

// Ajouter un commentaire
app.post('/api/posts/:id/comments', authMiddleware, async (c) => {
  const userId = c.get('userId')
  const postId = c.req.param('id')
  const body = await c.req.json().catch(() => ({}))
  const content = (body.content || '').trim()
  if (!content) return c.json({ error: 'Commentaire vide' }, 400)
  const res = await c.env.DB.prepare(
    'INSERT INTO comments (user_id, post_id, content) VALUES (?, ?, ?)'
  ).bind(userId, postId, content).run()
  const user = c.get('user')
  const post = await c.env.DB.prepare('SELECT user_id FROM posts WHERE id = ?').bind(postId).first()
  if (post && (post as any).user_id !== userId) {
    await c.env.DB.prepare(
      'INSERT INTO notifications (user_id, actor_id, type, post_id, comment_id) VALUES (?, ?, "comment", ?, ?)'
    ).bind((post as any).user_id, userId, postId, res.meta.last_row_id).run()
  }
  return c.json({
    comment: {
      id: res.meta.last_row_id,
      user_id: userId,
      post_id: postId,
      content,
      username: user.username,
      display_name: user.display_name,
      avatar_url: user.avatar_url,
      created_at: new Date().toISOString()
    }
  })
})

// Ajouter un ami
app.post('/api/friends/add', authMiddleware, async (c) => {
  const userId = c.get('userId')
  const body = await c.req.json()
  const targetId = body.user_id
  if (targetId === userId) return c.json({ error: 'Impossible de vous ajouter vous-même' }, 400)
  try {
    await c.env.DB.prepare(
      'INSERT INTO friendships (requester_id, addressee_id, status) VALUES (?, ?, "pending")'
    ).bind(userId, targetId).run()
    await c.env.DB.prepare(
      'INSERT INTO notifications (user_id, actor_id, type) VALUES (?, ?, "friend")'
    ).bind(targetId, userId).run()
    return c.json({ success: true })
  } catch {
    return c.json({ error: 'Demande déjà envoyée' }, 400)
  }
})

// Répondre à une demande d'ami
app.post('/api/friends/respond', authMiddleware, async (c) => {
  const userId = c.get('userId')
  const body = await c.req.json()
  const { friendship_id, action } = body
  const status = action === 'accept' ? 'accepted' : 'rejected'
  await c.env.DB.prepare(
    'UPDATE friendships SET status = ?, updated_at = datetime("now") WHERE id = ? AND addressee_id = ?'
  ).bind(status, friendship_id, userId).run()
  return c.json({ success: true })
})

// Mettre à jour le profil
app.post('/api/profile/update', authMiddleware, async (c) => {
  const userId = c.get('userId')
  const form = await c.req.formData()
  const display_name = (form.get('display_name') as string || '').trim()
  const bio = (form.get('bio') as string || '').trim()
  await c.env.DB.prepare(
    'UPDATE users SET display_name = ?, bio = ?, updated_at = datetime("now") WHERE id = ?'
  ).bind(display_name, bio, userId).run()
  const user = await c.env.DB.prepare('SELECT username FROM users WHERE id = ?').bind(userId).first()
  return c.redirect(`/profile/${(user as any).username}`)
})

// Mettre à jour l'avatar
app.post('/api/profile/avatar', authMiddleware, async (c) => {
  const userId = c.get('userId')
  const form = await c.req.formData()
  const avatar_url = (form.get('avatar_url') as string || '').trim()
  await c.env.DB.prepare('UPDATE users SET avatar_url = ? WHERE id = ?').bind(avatar_url, userId).run()
  const user = await c.env.DB.prepare('SELECT username FROM users WHERE id = ?').bind(userId).first()
  return c.redirect(`/profile/${(user as any).username}`)
})

// Mettre à jour la couverture
app.post('/api/profile/cover', authMiddleware, async (c) => {
  const userId = c.get('userId')
  const form = await c.req.formData()
  const cover_url = (form.get('cover_url') as string || '').trim()
  await c.env.DB.prepare('UPDATE users SET cover_url = ? WHERE id = ?').bind(cover_url, userId).run()
  const user = await c.env.DB.prepare('SELECT username FROM users WHERE id = ?').bind(userId).first()
  return c.redirect(`/profile/${(user as any).username}`)
})

// API Suggestions
app.get('/api/suggestions', authMiddleware, async (c) => {
  const userId = c.get('userId')
  const res = await c.env.DB.prepare(`
    SELECT u.id, u.username, u.display_name, u.avatar_url
    FROM users u
    WHERE u.id != ?
      AND u.id NOT IN (
        SELECT CASE WHEN requester_id = ? THEN addressee_id ELSE requester_id END
        FROM friendships WHERE requester_id = ? OR addressee_id = ?
      )
    ORDER BY RANDOM() LIMIT 5
  `).bind(userId, userId, userId, userId).all()
  return c.json({ suggestions: res.results })
})

// API Notifications count
app.get('/api/notifications/count', authMiddleware, async (c) => {
  const userId = c.get('userId')
  const res = await c.env.DB.prepare(
    'SELECT COUNT(*) AS cnt FROM notifications WHERE user_id = ? AND is_read = 0'
  ).bind(userId).first()
  return c.json({ count: (res as any).cnt })
})

// ═══════════════════════════════════════════════════════════════════════════════
// ─── MESSAGERIE PRIVÉE ────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/messages', authMiddleware, async (c) => {
  const user = c.get('user')
  const userId = c.get('userId')

  const convs = await c.env.DB.prepare(`
    SELECT 
      c.id, c.last_message_at,
      CASE WHEN c.participant1_id = ? THEN u2.id ELSE u1.id END AS other_id,
      CASE WHEN c.participant1_id = ? THEN u2.username ELSE u1.username END AS other_username,
      CASE WHEN c.participant1_id = ? THEN u2.display_name ELSE u1.display_name END AS other_name,
      CASE WHEN c.participant1_id = ? THEN u2.avatar_url ELSE u1.avatar_url END AS other_avatar,
      (SELECT m.content FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_msg,
      (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id AND m.sender_id != ? AND m.is_read = 0) AS unread_count
    FROM conversations c
    JOIN users u1 ON c.participant1_id = u1.id
    JOIN users u2 ON c.participant2_id = u2.id
    WHERE c.participant1_id = ? OR c.participant2_id = ?
    ORDER BY c.last_message_at DESC
  `).bind(userId, userId, userId, userId, userId, userId, userId).all()

  const convItems = (convs.results as any[]).map(cv => `
    <a href="/messages/${cv.other_username}" class="conv-item ${cv.unread_count > 0 ? 'conv-unread' : ''}">
      <div class="conv-avatar">
        ${cv.other_avatar
          ? `<img src="${cv.other_avatar}" class="avatar-md"/>`
          : `<div class="avatar-md avatar-placeholder" style="background:${stringToColor(cv.other_name)}">${cv.other_name[0].toUpperCase()}</div>`}
        <span class="online-dot"></span>
      </div>
      <div class="conv-info">
        <div class="conv-header">
          <span class="conv-name">${cv.other_name}</span>
          <span class="conv-time">${cv.last_message_at ? timeAgo(cv.last_message_at) : ''}</span>
        </div>
        <div class="conv-preview">
          <span class="conv-last-msg">${cv.last_msg ? escapeHtml(cv.last_msg.substring(0, 40)) + (cv.last_msg.length > 40 ? '…' : '') : 'Démarrer la conversation'}</span>
          ${cv.unread_count > 0 ? `<span class="unread-badge">${cv.unread_count}</span>` : ''}
        </div>
      </div>
    </a>`).join('')

  const body = `
<div class="messages-layout">
  <div class="conv-sidebar">
    <div class="conv-header-top">
      <h1><i class="fas fa-comment-dots"></i> Messages</h1>
      <button class="btn-icon" onclick="openNewConvModal()"><i class="fas fa-edit"></i></button>
    </div>
    <div class="conv-search">
      <input type="text" placeholder="Rechercher dans les messages…" id="conv-search-input" oninput="filterConvs(this.value)"/>
    </div>
    <div class="conv-list" id="conv-list">
      ${convItems || '<div class="empty-conv"><i class="fas fa-comment-slash"></i><p>Aucune conversation. Envoyez un message à un ami !</p></div>'}
    </div>
  </div>
  <div class="chat-empty-state" id="chat-placeholder">
    <i class="fas fa-comment-dots"></i>
    <h2>Vos messages</h2>
    <p>Sélectionnez une conversation ou commencez une nouvelle discussion</p>
    <button class="btn-primary" onclick="openNewConvModal()"><i class="fas fa-edit"></i> Nouveau message</button>
  </div>
</div>

<!-- Modal nouvelle conversation -->
<div class="modal-overlay hidden" id="new-conv-modal">
  <div class="modal-card">
    <div class="modal-header">
      <h3>Nouveau message</h3>
      <button onclick="closeNewConvModal()"><i class="fas fa-times"></i></button>
    </div>
    <input type="text" id="user-search-msg" placeholder="Rechercher un utilisateur…" oninput="searchUsers(this.value, 'msg-results')" class="form-input"/>
    <div id="msg-results" class="search-results"></div>
  </div>
</div>`

  return c.html(layout('Messages', body, user, `<link rel="stylesheet" href="/static/style.css"/>`))
})

app.get('/messages/:username', authMiddleware, async (c) => {
  const user = c.get('user')
  const userId = c.get('userId')
  const targetUsername = c.req.param('username')

  const target = await c.env.DB.prepare('SELECT id, username, display_name, avatar_url FROM users WHERE username = ?').bind(targetUsername).first() as any
  if (!target) return c.redirect('/messages')

  const p1 = Math.min(userId, target.id)
  const p2 = Math.max(userId, target.id)

  let conv = await c.env.DB.prepare(
    'SELECT id FROM conversations WHERE participant1_id = ? AND participant2_id = ?'
  ).bind(p1, p2).first() as any

  if (!conv) {
    const r = await c.env.DB.prepare(
      'INSERT INTO conversations (participant1_id, participant2_id) VALUES (?, ?)'
    ).bind(p1, p2).run()
    conv = { id: r.meta.last_row_id }
  }

  await c.env.DB.prepare(
    'UPDATE messages SET is_read = 1 WHERE conversation_id = ? AND sender_id != ?'
  ).bind(conv.id, userId).run()

  const msgs = await c.env.DB.prepare(`
    SELECT m.*, u.username, u.display_name, u.avatar_url
    FROM messages m JOIN users u ON m.sender_id = u.id
    WHERE m.conversation_id = ? AND m.deleted_at IS NULL
    ORDER BY m.created_at ASC LIMIT 100
  `).bind(conv.id).all()

  const convs = await c.env.DB.prepare(`
    SELECT 
      c.id, c.last_message_at,
      CASE WHEN c.participant1_id = ? THEN u2.id ELSE u1.id END AS other_id,
      CASE WHEN c.participant1_id = ? THEN u2.username ELSE u1.username END AS other_username,
      CASE WHEN c.participant1_id = ? THEN u2.display_name ELSE u1.display_name END AS other_name,
      CASE WHEN c.participant1_id = ? THEN u2.avatar_url ELSE u1.avatar_url END AS other_avatar,
      (SELECT m2.content FROM messages m2 WHERE m2.conversation_id = c.id ORDER BY m2.created_at DESC LIMIT 1) AS last_msg,
      (SELECT COUNT(*) FROM messages m3 WHERE m3.conversation_id = c.id AND m3.sender_id != ? AND m3.is_read = 0) AS unread_count
    FROM conversations c
    JOIN users u1 ON c.participant1_id = u1.id
    JOIN users u2 ON c.participant2_id = u2.id
    WHERE c.participant1_id = ? OR c.participant2_id = ?
    ORDER BY c.last_message_at DESC
  `).bind(userId, userId, userId, userId, userId, userId, userId).all()

  const convItems = (convs.results as any[]).map(cv => `
    <a href="/messages/${cv.other_username}" class="conv-item ${cv.other_username === targetUsername ? 'conv-active' : ''} ${cv.unread_count > 0 ? 'conv-unread' : ''}">
      <div class="conv-avatar">
        ${cv.other_avatar
          ? `<img src="${cv.other_avatar}" class="avatar-md"/>`
          : `<div class="avatar-md avatar-placeholder" style="background:${stringToColor(cv.other_name)}">${cv.other_name[0].toUpperCase()}</div>`}
      </div>
      <div class="conv-info">
        <div class="conv-header">
          <span class="conv-name">${cv.other_name}</span>
          <span class="conv-time">${cv.last_message_at ? timeAgo(cv.last_message_at) : ''}</span>
        </div>
        <div class="conv-preview">
          <span class="conv-last-msg">${cv.last_msg ? escapeHtml(cv.last_msg.substring(0, 35)) + (cv.last_msg.length > 35 ? '…' : '') : '…'}</span>
          ${cv.unread_count > 0 ? `<span class="unread-badge">${cv.unread_count}</span>` : ''}
        </div>
      </div>
    </a>`).join('')

  const msgItems = (msgs.results as any[]).map(m => {
    const isMine = m.sender_id === userId
    return `
    <div class="msg-row ${isMine ? 'msg-mine' : 'msg-theirs'}">
      ${!isMine ? `<div class="msg-avatar">${avatarHtml(m, 'sm')}</div>` : ''}
      <div class="msg-bubble-wrap">
        <div class="msg-bubble">${escapeHtml(m.content)}</div>
        <span class="msg-time">${timeAgo(m.created_at)}</span>
      </div>
    </div>`
  }).join('')

  const body = `
<div class="messages-layout">
  <div class="conv-sidebar">
    <div class="conv-header-top">
      <h1><i class="fas fa-comment-dots"></i> Messages</h1>
      <button class="btn-icon" onclick="openNewConvModal()"><i class="fas fa-edit"></i></button>
    </div>
    <div class="conv-search">
      <input type="text" placeholder="Rechercher…" id="conv-search-input" oninput="filterConvs(this.value)"/>
    </div>
    <div class="conv-list" id="conv-list">
      ${convItems}
    </div>
  </div>

  <div class="chat-window" id="chat-window">
    <div class="chat-header">
      <a href="/profile/${target.username}" class="chat-user-info">
        ${avatarHtml(target, 'md')}
        <div>
          <span class="chat-user-name">${target.display_name}</span>
          <span class="chat-user-status">@${target.username}</span>
        </div>
      </a>
      <div class="chat-actions">
        <button class="btn-icon" title="Appel audio" onclick="startCall('${target.username}', 'audio', ${target.id})">
          <i class="fas fa-phone"></i>
        </button>
        <button class="btn-icon" title="Appel vidéo" onclick="startCall('${target.username}', 'video', ${target.id})">
          <i class="fas fa-video"></i>
        </button>
      </div>
    </div>
    <div class="chat-messages" id="chat-messages">
      ${msgItems || '<div class="chat-start"><i class="fas fa-comment"></i><p>Envoyez votre premier message à <strong>${target.display_name}</strong> !</p></div>'}
    </div>
    <form class="chat-input-form" onsubmit="sendMessage(event, ${conv.id}, '${target.username}')">
      <button type="button" class="btn-icon" title="Emoji" onclick="toggleEmojiPicker()"><i class="fas fa-smile"></i></button>
      <input type="text" id="msg-input" placeholder="Écrivez un message…" class="chat-input" autocomplete="off" maxlength="2000"/>
      <button type="button" class="btn-icon" onclick="sendVoiceNote()"><i class="fas fa-microphone"></i></button>
      <button type="submit" class="btn-send"><i class="fas fa-paper-plane"></i></button>
    </form>
    <div class="emoji-picker hidden" id="emoji-picker">
      ${['😀','😂','❤️','🔥','👍','😍','🙏','😭','😊','🎉','💯','😎','🤔','👏','🥰','😘','💪','✨','😁','🤣'].map(e => `<span onclick="insertEmoji('${e}')">${e}</span>`).join('')}
    </div>
  </div>
</div>

<!-- Modal nouvelle conversation -->
<div class="modal-overlay hidden" id="new-conv-modal">
  <div class="modal-card">
    <div class="modal-header">
      <h3>Nouveau message</h3>
      <button onclick="closeNewConvModal()"><i class="fas fa-times"></i></button>
    </div>
    <input type="text" id="user-search-msg" placeholder="Rechercher un utilisateur…" oninput="searchUsers(this.value, 'msg-results')" class="form-input"/>
    <div id="msg-results" class="search-results"></div>
  </div>
</div>
<script>
  // Auto-scroll to bottom
  document.addEventListener('DOMContentLoaded', () => {
    const cm = document.getElementById('chat-messages')
    if (cm) cm.scrollTop = cm.scrollHeight
  })
</script>`

  return c.html(layout(`Messages – ${target.display_name}`, body, user))
})

// API : Envoyer un message
app.post('/api/messages/:convId', authMiddleware, async (c) => {
  const userId = c.get('userId')
  const convId = c.req.param('convId')
  const { content } = await c.req.json()
  if (!content?.trim()) return c.json({ error: 'Message vide' }, 400)

  const conv = await c.env.DB.prepare(
    'SELECT * FROM conversations WHERE id = ? AND (participant1_id = ? OR participant2_id = ?)'
  ).bind(convId, userId, userId).first()
  if (!conv) return c.json({ error: 'Non autorisé' }, 403)

  const r = await c.env.DB.prepare(
    'INSERT INTO messages (conversation_id, sender_id, content) VALUES (?, ?, ?)'
  ).bind(convId, userId, content.trim()).run()

  await c.env.DB.prepare(
    'UPDATE conversations SET last_message_at = datetime("now") WHERE id = ?'
  ).bind(convId).run()

  const user = c.get('user')
  return c.json({
    id: r.meta.last_row_id,
    content: content.trim(),
    sender_id: userId,
    username: user.username,
    display_name: user.display_name,
    avatar_url: user.avatar_url,
    created_at: new Date().toISOString(),
    is_read: 0
  })
})

// API : Récupérer les nouveaux messages (polling)
app.get('/api/messages/:convId/poll', authMiddleware, async (c) => {
  const userId = c.get('userId')
  const convId = c.req.param('convId')
  const since = c.req.query('since') || '2000-01-01'

  const conv = await c.env.DB.prepare(
    'SELECT * FROM conversations WHERE id = ? AND (participant1_id = ? OR participant2_id = ?)'
  ).bind(convId, userId, userId).first()
  if (!conv) return c.json({ error: 'Non autorisé' }, 403)

  await c.env.DB.prepare(
    'UPDATE messages SET is_read = 1 WHERE conversation_id = ? AND sender_id != ? AND is_read = 0'
  ).bind(convId, userId).run()

  const msgs = await c.env.DB.prepare(`
    SELECT m.*, u.username, u.display_name, u.avatar_url
    FROM messages m JOIN users u ON m.sender_id = u.id
    WHERE m.conversation_id = ? AND m.created_at > ? AND m.deleted_at IS NULL
    ORDER BY m.created_at ASC LIMIT 50
  `).bind(convId, since).all()

  return c.json({ messages: msgs.results })
})

// ═══════════════════════════════════════════════════════════════════════════════
// ─── APPELS AUDIO / VIDÉO (WebRTC via Signaling) ─────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/call/:username', authMiddleware, async (c) => {
  const user = c.get('user')
  const userId = c.get('userId')
  const targetUsername = c.req.param('username')
  const callType = (c.req.query('type') || 'audio') as string

  const target = await c.env.DB.prepare(
    'SELECT id, username, display_name, avatar_url FROM users WHERE username = ?'
  ).bind(targetUsername).first() as any

  if (!target) return c.redirect('/messages')

  // Enregistrer l'appel
  const r = await c.env.DB.prepare(
    'INSERT INTO calls (caller_id, callee_id, call_type, status, started_at) VALUES (?, ?, ?, "ringing", datetime("now"))'
  ).bind(userId, target.id, callType).run()

  const callId = r.meta.last_row_id
  const isVideo = callType === 'video'

  const body = `
<div class="call-screen" id="call-screen" data-call-id="${callId}" data-call-type="${callType}">
  <!-- Vidéo distante (plein écran) -->
  <video id="remote-video" class="remote-video ${isVideo ? '' : 'hidden'}" autoplay playsinline></video>

  <!-- Avatar quand pas de vidéo -->
  <div class="call-avatar-bg ${isVideo ? 'hidden' : ''}" id="call-avatar-bg">
    <div class="call-avatar-circle">
      ${target.avatar_url
        ? `<img src="${target.avatar_url}" alt="avatar" class="call-avatar-img"/>`
        : `<div class="call-avatar-placeholder">${target.display_name[0].toUpperCase()}</div>`}
    </div>
    <div class="call-wave">
      <span></span><span></span><span></span>
    </div>
  </div>

  <!-- Info appelé -->
  <div class="call-info">
    <h2 class="call-name">${target.display_name}</h2>
    <p class="call-status" id="call-status">📞 Appel en cours…</p>
    <p class="call-timer hidden" id="call-timer">00:00</p>
  </div>

  <!-- Petite vidéo locale -->
  <video id="local-video" class="local-video ${isVideo ? '' : 'hidden'}" autoplay playsinline muted></video>

  <!-- Contrôles -->
  <div class="call-controls">
    <button class="call-btn call-btn-mute" id="btn-mute" onclick="toggleMute()" title="Couper le micro">
      <i class="fas fa-microphone"></i>
    </button>
    ${isVideo ? `
    <button class="call-btn call-btn-camera" id="btn-camera" onclick="toggleCamera()" title="Couper la caméra">
      <i class="fas fa-video"></i>
    </button>` : ''}
    <button class="call-btn call-btn-speaker" id="btn-speaker" onclick="toggleSpeaker()" title="Haut-parleur">
      <i class="fas fa-volume-up"></i>
    </button>
    <button class="call-btn call-btn-end" onclick="endCall(${callId})" title="Raccrocher">
      <i class="fas fa-phone-slash"></i>
    </button>
  </div>
</div>

<script>
const CALL_ID = ${callId};
const CALL_TYPE = '${callType}';
const TARGET_USERNAME = '${target.username}';
const TARGET_ID = ${target.id};
const CURRENT_USER_ID = ${userId};
let localStream = null;
let peerConnection = null;
let callTimer = null;
let callSeconds = 0;
let isMuted = false;
let isCameraOff = false;

const iceConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

async function startCall() {
  try {
    const constraints = CALL_TYPE === 'video'
      ? { audio: true, video: { facingMode: 'user', width: 640, height: 480 } }
      : { audio: true, video: false };

    localStream = await navigator.mediaDevices.getUserMedia(constraints);

    if (CALL_TYPE === 'video') {
      document.getElementById('local-video').srcObject = localStream;
    }

    peerConnection = new RTCPeerConnection(iceConfig);

    localStream.getTracks().forEach(track => {
      peerConnection.addTrack(track, localStream);
    });

    peerConnection.ontrack = (event) => {
      if (CALL_TYPE === 'video') {
        document.getElementById('remote-video').srcObject = event.streams[0];
        document.getElementById('call-avatar-bg').classList.add('hidden');
        document.getElementById('remote-video').classList.remove('hidden');
      }
      startTimer();
      document.getElementById('call-status').textContent = '✅ Connecté';
    };

    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        sendSignal({ type: 'ice', candidate: event.candidate });
      }
    };

    peerConnection.oniceconnectionstatechange = () => {
      const state = peerConnection.iceConnectionState;
      if (state === 'disconnected' || state === 'failed' || state === 'closed') {
        endCall(CALL_ID);
      }
    };

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    sendSignal({ type: 'offer', sdp: offer });

  } catch (err) {
    document.getElementById('call-status').textContent = '❌ ' + (err.message || 'Erreur micro/caméra');
    console.error(err);
  }
}

async function sendSignal(data) {
  await fetch('/api/calls/' + CALL_ID + '/signal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...data, to: TARGET_ID })
  });
}

function startTimer() {
  callTimer = setInterval(() => {
    callSeconds++;
    const m = String(Math.floor(callSeconds / 60)).padStart(2, '0');
    const s = String(callSeconds % 60).padStart(2, '0');
    const timerEl = document.getElementById('call-timer');
    timerEl.textContent = m + ':' + s;
    timerEl.classList.remove('hidden');
  }, 1000);
}

function toggleMute() {
  if (!localStream) return;
  isMuted = !isMuted;
  localStream.getAudioTracks().forEach(t => t.enabled = !isMuted);
  const btn = document.getElementById('btn-mute');
  btn.innerHTML = isMuted ? '<i class="fas fa-microphone-slash"></i>' : '<i class="fas fa-microphone"></i>';
  btn.classList.toggle('active', isMuted);
}

function toggleCamera() {
  if (!localStream) return;
  isCameraOff = !isCameraOff;
  localStream.getVideoTracks().forEach(t => t.enabled = !isCameraOff);
  const btn = document.getElementById('btn-camera');
  btn.innerHTML = isCameraOff ? '<i class="fas fa-video-slash"></i>' : '<i class="fas fa-video"></i>';
  btn.classList.toggle('active', isCameraOff);
}

function toggleSpeaker() {
  const video = document.getElementById('remote-video');
  if (video) video.muted = !video.muted;
}

async function endCall(callId) {
  clearInterval(callTimer);
  if (localStream) localStream.getTracks().forEach(t => t.stop());
  if (peerConnection) peerConnection.close();
  await fetch('/api/calls/' + callId + '/end', { method: 'POST' });
  history.back();
}

// Démarrer l'appel automatiquement
window.addEventListener('DOMContentLoaded', startCall);
</script>`

  return c.html(layout(`Appel ${isVideo ? 'vidéo' : 'audio'} – ${target.display_name}`, body, user))
})

// API Appel : Signal WebRTC (stockage simple en KV via D1)
app.post('/api/calls/:callId/signal', authMiddleware, async (c) => {
  const callId = c.req.param('callId')
  const userId = c.get('userId')
  const data = await c.req.json()
  // On stocke le signal temporairement dans une table simple
  await c.env.DB.prepare(
    'INSERT INTO notifications (user_id, actor_id, type, post_id) VALUES (?, ?, ?, ?)'
  ).bind(data.to, userId, 'call_signal_' + JSON.stringify(data).substring(0, 100), parseInt(callId)).run().catch(() => {})
  return c.json({ ok: true })
})

// API Appel : Terminer l'appel
app.post('/api/calls/:callId/end', authMiddleware, async (c) => {
  const callId = c.req.param('callId')
  const userId = c.get('userId')
  await c.env.DB.prepare(
    'UPDATE calls SET status = "ended", ended_at = datetime("now"), duration_seconds = CAST((julianday("now") - julianday(started_at)) * 86400 AS INTEGER) WHERE id = ? AND (caller_id = ? OR callee_id = ?)'
  ).bind(callId, userId, userId).run()
  return c.json({ ok: true })
})

// ═══════════════════════════════════════════════════════════════════════════════
// ─── MONÉTISATION : PAGE PREMIUM & ABONNEMENTS ───────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/premium', authMiddleware, async (c) => {
  const user = c.get('user')
  const userId = c.get('userId')

  const plans = await c.env.DB.prepare('SELECT * FROM subscription_plans WHERE is_active = 1 ORDER BY price_xof ASC').all()

  const sub = await c.env.DB.prepare(`
    SELECT us.*, sp.name AS plan_name FROM user_subscriptions us
    JOIN subscription_plans sp ON us.plan_id = sp.id
    WHERE us.user_id = ? AND us.status = 'active' AND us.expires_at > datetime('now')
    ORDER BY us.expires_at DESC LIMIT 1
  `).bind(userId).first() as any

  const planCards = (plans.results as any[]).map(p => {
    const features = JSON.parse(p.features) as string[]
    const isCurrent = sub && sub.plan_id === p.id
    const isPopular = p.price_xof === 2500
    return `
<div class="plan-card ${isPopular ? 'plan-popular' : ''} ${isCurrent ? 'plan-current' : ''}">
  ${isPopular ? '<div class="plan-badge">⭐ POPULAIRE</div>' : ''}
  ${isCurrent ? '<div class="plan-badge plan-badge-green">✅ ACTIF</div>' : ''}
  <h3 class="plan-name">${p.name}</h3>
  <div class="plan-price">
    ${p.price_xof === 0 ? '<span class="price-free">Gratuit</span>' : `
    <span class="price-amount">${p.price_xof.toLocaleString()}</span>
    <span class="price-currency">XOF</span>
    <span class="price-period">/mois</span>`}
  </div>
  <ul class="plan-features">
    ${features.map(f => `<li><i class="fas fa-check"></i> ${f}</li>`).join('')}
  </ul>
  ${p.price_xof > 0 && !isCurrent ? `
  <button class="btn-primary btn-full plan-btn" onclick="subscribePlan(${p.id}, '${p.name}', ${p.price_xof})">
    <i class="fas fa-crown"></i> Choisir ${p.name}
  </button>` : `
  <button class="btn-secondary btn-full" disabled>${isCurrent ? '✅ Plan actuel' : 'Plan actuel'}</button>`}
</div>`
  }).join('')

  const body = `
<div class="premium-container">
  <div class="premium-hero">
    <div class="premium-hero-icon"><i class="fas fa-crown"></i></div>
    <h1>SocialFeed Premium</h1>
    <p>Débloquez toutes les fonctionnalités et profitez d'une expérience sans limite</p>
    ${sub ? `<div class="current-plan-banner"><i class="fas fa-star"></i> Plan actif : <strong>${sub.plan_name}</strong> — expire le ${new Date(sub.expires_at).toLocaleDateString('fr-FR')}</div>` : ''}
  </div>

  <div class="plans-grid">
    ${planCards}
  </div>

  <div class="monetize-section">
    <h2><i class="fas fa-ad"></i> Publicités & Revenus</h2>
    <p>Créez vos propres annonces et boostez votre visibilité sur SocialFeed.</p>
    <div class="ads-features-grid">
      <div class="ads-feature"><i class="fas fa-bullseye"></i><h4>Ciblage précis</h4><p>Atteignez votre audience idéale</p></div>
      <div class="ads-feature"><i class="fas fa-chart-line"></i><h4>Statistiques en temps réel</h4><p>Suivez vos impressions et clics</p></div>
      <div class="ads-feature"><i class="fas fa-wallet"></i><h4>Paiement Mobile Money</h4><p>Orange Money, Wave, MTN Mobile Money</p></div>
      <div class="ads-feature"><i class="fas fa-store"></i><h4>Marketplace</h4><p>Vendez vos produits à la communauté</p></div>
    </div>
    <a href="/ads/create" class="btn-primary"><i class="fas fa-plus"></i> Créer une publicité</a>
  </div>
</div>

<!-- Modal de paiement -->
<div class="modal-overlay hidden" id="payment-modal">
  <div class="modal-card payment-modal-card">
    <div class="modal-header">
      <h3><i class="fas fa-lock"></i> Paiement sécurisé</h3>
      <button onclick="closePaymentModal()"><i class="fas fa-times"></i></button>
    </div>
    <div class="payment-summary" id="payment-summary"></div>
    <div class="payment-methods">
      <h4>Choisissez votre méthode de paiement</h4>
      <div class="payment-grid">
        <button class="payment-method-btn" onclick="selectPayment('orange_money')">
          <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/3/31/Orange_Money_logo.png/320px-Orange_Money_logo.png" alt="Orange Money" onerror="this.style.display='none'"/>
          <span>Orange Money</span>
        </button>
        <button class="payment-method-btn" onclick="selectPayment('wave')">
          <span class="payment-icon wave-icon">W</span>
          <span>Wave</span>
        </button>
        <button class="payment-method-btn" onclick="selectPayment('mtn')">
          <span class="payment-icon mtn-icon">MTN</span>
          <span>MTN Mobile Money</span>
        </button>
        <button class="payment-method-btn" onclick="selectPayment('free_money')">
          <span class="payment-icon free-icon">FM</span>
          <span>Free Money</span>
        </button>
      </div>
    </div>
    <div id="payment-form-area" class="hidden">
      <input type="tel" id="payment-phone" placeholder="Numéro de téléphone (ex: 77 XXX XX XX)" class="form-input" maxlength="15"/>
      <button class="btn-primary btn-full" onclick="confirmPayment()">
        <i class="fas fa-lock"></i> Confirmer et payer
      </button>
    </div>
    <p class="payment-secure-note"><i class="fas fa-shield-alt"></i> Paiement 100% sécurisé – Vos données sont protégées</p>
  </div>
</div>`

  return c.html(layout('Premium', body, user))
})

// API : Initier un abonnement
app.post('/api/subscribe', authMiddleware, async (c) => {
  const userId = c.get('userId')
  const { plan_id, phone, provider } = await c.req.json()

  const plan = await c.env.DB.prepare('SELECT * FROM subscription_plans WHERE id = ? AND is_active = 1').bind(plan_id).first() as any
  if (!plan) return c.json({ error: 'Plan introuvable' }, 404)

  const ref = 'PAY-' + Date.now() + '-' + Math.random().toString(36).substring(2, 8).toUpperCase()

  await c.env.DB.prepare(
    'INSERT INTO payments (user_id, amount_xof, payment_type, reference, status, provider, phone) VALUES (?, ?, "subscription", ?, "pending", ?, ?)'
  ).bind(userId, plan.price_xof, ref, provider, phone).run()

  // Simuler validation paiement (en production : appel API Orange Money / Wave)
  await c.env.DB.prepare(
    'UPDATE payments SET status = "completed", updated_at = datetime("now") WHERE reference = ?'
  ).bind(ref).run()

  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + plan.duration_days)

  await c.env.DB.prepare(
    'INSERT INTO user_subscriptions (user_id, plan_id, status, expires_at, payment_ref, amount_paid) VALUES (?, ?, "active", ?, ?, ?)'
  ).bind(userId, plan_id, expiresAt.toISOString(), ref, plan.price_xof).run()

  return c.json({ success: true, reference: ref, message: `Abonnement ${plan.name} activé avec succès !` })
})

// ─── MARKETPLACE ─────────────────────────────────────────────────────────────

app.get('/marketplace', authMiddleware, async (c) => {
  const user = c.get('user')
  const userId = c.get('userId')
  const cat = c.req.query('cat') || ''

  const items = await c.env.DB.prepare(`
    SELECT mi.*, u.username, u.display_name, u.avatar_url
    FROM marketplace_items mi
    JOIN users u ON mi.seller_id = u.id
    WHERE mi.is_sold = 0 ${cat ? 'AND mi.category = ?' : ''}
    ORDER BY mi.created_at DESC LIMIT 50
  `).bind(...(cat ? [cat] : [])).all()

  const categories = ['électronique', 'vêtements', 'maison', 'voiture', 'immobilier', 'agriculture', 'services', 'autre']

  const body = `
<div class="marketplace-container">
  <div class="marketplace-header">
    <h1><i class="fas fa-store"></i> Marketplace</h1>
    <button class="btn-primary" onclick="openSellModal()"><i class="fas fa-plus"></i> Vendre un article</button>
  </div>

  <div class="category-filters">
    <button class="cat-btn ${!cat ? 'active' : ''}" onclick="location.href='/marketplace'">Tout</button>
    ${categories.map(c2 => `<button class="cat-btn ${cat === c2 ? 'active' : ''}" onclick="location.href='/marketplace?cat=${c2}'">${c2.charAt(0).toUpperCase() + c2.slice(1)}</button>`).join('')}
  </div>

  <div class="marketplace-grid">
    ${(items.results as any[]).map(item => `
    <div class="market-card" onclick="location.href='/marketplace/item/${item.id}'">
      <div class="market-img-wrap">
        ${item.image_url
          ? `<img src="${item.image_url}" alt="${item.title}" class="market-img" onerror="this.parentElement.innerHTML='<div class=market-img-placeholder><i class=fas fa-image></i></div>'"/>`
          : `<div class="market-img-placeholder"><i class="fas fa-image"></i></div>`}
        <span class="market-condition ${item.condition}">${item.condition}</span>
      </div>
      <div class="market-info">
        <h3 class="market-title">${escapeHtml(item.title)}</h3>
        <p class="market-price"><i class="fas fa-tag"></i> ${item.price_xof.toLocaleString()} XOF</p>
        <p class="market-location"><i class="fas fa-map-marker-alt"></i> ${item.location || 'Non précisé'}</p>
        <div class="market-seller">
          ${avatarHtml(item, 'sm')}
          <span>${item.display_name}</span>
        </div>
      </div>
    </div>`).join('') || '<div class="empty-feed"><i class="fas fa-store-slash"></i><p>Aucun article disponible.</p></div>'}
  </div>
</div>

<!-- Modal vendre -->
<div class="modal-overlay hidden" id="sell-modal">
  <div class="modal-card">
    <div class="modal-header">
      <h3><i class="fas fa-tag"></i> Vendre un article</h3>
      <button onclick="closeSellModal()"><i class="fas fa-times"></i></button>
    </div>
    <form onsubmit="createListing(event)" class="sell-form">
      <input type="text" name="title" placeholder="Titre de l'article *" required class="form-input"/>
      <textarea name="description" placeholder="Description *" required class="form-input" rows="3"></textarea>
      <div class="form-row">
        <input type="number" name="price" placeholder="Prix (XOF) *" required class="form-input" min="1"/>
        <select name="category" class="form-input">
          ${categories.map(c2 => `<option value="${c2}">${c2.charAt(0).toUpperCase() + c2.slice(1)}</option>`).join('')}
        </select>
      </div>
      <div class="form-row">
        <select name="condition" class="form-input">
          <option value="neuf">Neuf</option>
          <option value="bon" selected>Bon état</option>
          <option value="correct">État correct</option>
          <option value="mauvais">Mauvais état</option>
        </select>
        <input type="text" name="location" placeholder="Localisation" class="form-input"/>
      </div>
      <input type="url" name="image_url" placeholder="URL de l'image (optionnel)" class="form-input"/>
      <button type="submit" class="btn-primary btn-full"><i class="fas fa-check"></i> Mettre en vente</button>
    </form>
  </div>
</div>`

  return c.html(layout('Marketplace', body, user))
})

// API : Créer une annonce
app.post('/api/marketplace', authMiddleware, async (c) => {
  const userId = c.get('userId')
  const { title, description, price_xof, category, condition, location, image_url } = await c.req.json()
  if (!title || !description || !price_xof) return c.json({ error: 'Champs requis manquants' }, 400)
  const r = await c.env.DB.prepare(
    'INSERT INTO marketplace_items (seller_id, title, description, price_xof, category, condition, location, image_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(userId, title, description, price_xof, category || 'autre', condition || 'bon', location || '', image_url || '').run()
  return c.json({ success: true, id: r.meta.last_row_id })
})

// ─── PAGE PUBLICITÉS ──────────────────────────────────────────────────────────

app.get('/ads/create', authMiddleware, async (c) => {
  const user = c.get('user')

  const body = `
<div class="ads-container">
  <div class="ads-header">
    <h1><i class="fas fa-bullhorn"></i> Créer une publicité</h1>
    <p>Atteignez des milliers d'utilisateurs SocialFeed</p>
  </div>

  <div class="ads-stats-banner">
    <div class="ads-stat"><i class="fas fa-users"></i><span>Audience potentielle</span><strong>50K+ utilisateurs</strong></div>
    <div class="ads-stat"><i class="fas fa-eye"></i><span>Impressions/jour</span><strong>200K+</strong></div>
    <div class="ads-stat"><i class="fas fa-mouse-pointer"></i><span>Taux de clic moyen</span><strong>3.5%</strong></div>
  </div>

  <form class="ads-form" onsubmit="createAd(event)">
    <div class="form-section">
      <h3>📋 Informations de la publicité</h3>
      <input type="text" name="title" placeholder="Titre de votre publicité *" required class="form-input"/>
      <textarea name="description" placeholder="Description (max 200 caractères) *" required class="form-input" rows="3" maxlength="200"></textarea>
      <input type="url" name="target_url" placeholder="Lien de destination *" required class="form-input"/>
      <input type="url" name="image_url" placeholder="URL de l'image publicitaire (optionnel)" class="form-input"/>
    </div>

    <div class="form-section">
      <h3>🎯 Format & Budget</h3>
      <div class="form-row">
        <select name="ad_type" class="form-input">
          <option value="banner">Bannière dans le fil</option>
          <option value="story">Story sponsorisée</option>
          <option value="sidebar">Barre latérale</option>
        </select>
        <input type="number" name="budget" placeholder="Budget total (XOF)" required class="form-input" min="1000" step="500"/>
      </div>
      <div class="budget-guide">
        <p>💡 Recommandations de budget :</p>
        <ul>
          <li>🥉 1 000 – 5 000 XOF → ~500 impressions/jour</li>
          <li>🥈 5 000 – 20 000 XOF → ~2 000 impressions/jour</li>
          <li>🥇 20 000+ XOF → ~10 000+ impressions/jour</li>
        </ul>
      </div>
    </div>

    <button type="submit" class="btn-primary btn-full">
      <i class="fas fa-rocket"></i> Lancer la publicité
    </button>
  </form>
</div>`

  return c.html(layout('Créer une publicité', body, user))
})

// API : Créer une publicité
app.post('/api/ads', authMiddleware, async (c) => {
  const userId = c.get('userId')
  const { title, description, target_url, image_url, budget, ad_type } = await c.req.json()
  if (!title || !description || !target_url || !budget) return c.json({ error: 'Champs requis manquants' }, 400)
  const r = await c.env.DB.prepare(
    'INSERT INTO ads (advertiser_id, title, description, image_url, target_url, budget_xof, ad_type, status) VALUES (?, ?, ?, ?, ?, ?, ?, "active")'
  ).bind(userId, title, description, image_url || '', target_url, budget, ad_type || 'banner').run()
  return c.json({ success: true, id: r.meta.last_row_id, message: 'Publicité créée et en cours de diffusion !' })
})

// API : Clic sur une publicité
app.post('/api/ads/:id/click', authMiddleware, async (c) => {
  const adId = c.req.param('id')
  const userId = c.get('userId')
  await c.env.DB.prepare('UPDATE ads SET clicks = clicks + 1 WHERE id = ?').bind(adId).run()
  await c.env.DB.prepare('INSERT INTO ad_clicks (ad_id, user_id) VALUES (?, ?)').bind(adId, userId).run().catch(() => {})
  const ad = await c.env.DB.prepare('SELECT target_url FROM ads WHERE id = ?').bind(adId).first() as any
  return c.json({ redirect: ad?.target_url || '/' })
})

// ═══════════════════════════════════════════════════════════════════════════════
// ─── POLITIQUE DE CONFIDENTIALITÉ ────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/privacy', (c) => {
  const user = c.get('user') // peut être null
  const body = `
<div class="legal-container">
  <div class="legal-header">
    <h1><i class="fas fa-shield-alt"></i> Politique de Confidentialité</h1>
    <p class="legal-date">Dernière mise à jour : 1er mars 2026</p>
  </div>

  <div class="legal-toc">
    <h3>Sommaire</h3>
    <ol>
      <li><a href="#collecte">Données collectées</a></li>
      <li><a href="#utilisation">Utilisation des données</a></li>
      <li><a href="#partage">Partage des données</a></li>
      <li><a href="#cookies">Cookies et traceurs</a></li>
      <li><a href="#droits">Vos droits</a></li>
      <li><a href="#securite">Sécurité</a></li>
      <li><a href="#contact">Nous contacter</a></li>
    </ol>
  </div>

  <div class="legal-content">
    <section id="collecte">
      <h2>1. Données que nous collectons</h2>
      <p>SocialFeed collecte les catégories de données suivantes :</p>
      <h3>1.1 Données que vous nous fournissez</h3>
      <ul>
        <li><strong>Informations de compte :</strong> nom, prénom, nom d'utilisateur, adresse e-mail, mot de passe (chiffré SHA-256)</li>
        <li><strong>Informations de profil :</strong> photo de profil, biographie, localisation (optionnelle)</li>
        <li><strong>Contenu :</strong> publications, photos, commentaires, messages privés</li>
        <li><strong>Communications :</strong> messages envoyés et reçus via la messagerie</li>
        <li><strong>Transactions :</strong> informations de paiement pour les abonnements Premium (numéro de téléphone Mobile Money, référence de transaction)</li>
      </ul>
      <h3>1.2 Données collectées automatiquement</h3>
      <ul>
        <li>Adresse IP (anonymisée après 30 jours)</li>
        <li>Type de navigateur et système d'exploitation</li>
        <li>Pages visitées et durée des sessions</li>
        <li>Interactions avec les publications (likes, commentaires, clics sur publicités)</li>
      </ul>
    </section>

    <section id="utilisation">
      <h2>2. Utilisation de vos données</h2>
      <p>Nous utilisons vos données pour :</p>
      <ul>
        <li>✅ Fournir et améliorer nos services</li>
        <li>✅ Personnaliser votre fil d'actualité</li>
        <li>✅ Vous envoyer des notifications pertinentes</li>
        <li>✅ Traiter vos paiements Premium</li>
        <li>✅ Afficher des publicités ciblées (avec votre consentement)</li>
        <li>✅ Détecter et prévenir les fraudes et abus</li>
        <li>✅ Respecter nos obligations légales</li>
        <li>❌ Vendre vos données personnelles à des tiers</li>
        <li>❌ Utiliser vos messages privés à des fins publicitaires</li>
      </ul>
    </section>

    <section id="partage">
      <h2>3. Partage des données</h2>
      <p>Nous ne partageons vos données qu'avec :</p>
      <ul>
        <li><strong>Autres utilisateurs :</strong> les informations publiques de votre profil (nom, photo, publications publiques)</li>
        <li><strong>Prestataires de services :</strong> hébergement (Cloudflare), paiements (Orange Money, Wave), notifications push (Firebase FCM)</li>
        <li><strong>Autorités compétentes :</strong> uniquement si requis par la loi ou une décision de justice</li>
      </ul>
      <p>Nous ne vendons jamais vos données personnelles.</p>
    </section>

    <section id="cookies">
      <h2>4. Cookies et technologies de suivi</h2>
      <p>SocialFeed utilise les technologies suivantes :</p>
      <table class="legal-table">
        <thead><tr><th>Type</th><th>Nom</th><th>Durée</th><th>Finalité</th></tr></thead>
        <tbody>
          <tr><td>Essentiel</td><td>session</td><td>30 jours</td><td>Maintenir votre connexion</td></tr>
          <tr><td>Analytique</td><td>_sf_analytics</td><td>90 jours</td><td>Améliorer l'application</td></tr>
          <tr><td>Publicité</td><td>_sf_ad_prefs</td><td>180 jours</td><td>Publicités pertinentes</td></tr>
        </tbody>
      </table>
      <p>Vous pouvez désactiver les cookies non essentiels dans vos paramètres.</p>
    </section>

    <section id="droits">
      <h2>5. Vos droits</h2>
      <p>Conformément aux lois applicables sur la protection des données (RGPD, loi sénégalaise sur les données personnelles), vous avez le droit de :</p>
      <ul>
        <li>🔍 <strong>Accéder</strong> à vos données personnelles</li>
        <li>✏️ <strong>Rectifier</strong> des données inexactes</li>
        <li>🗑️ <strong>Supprimer</strong> votre compte et vos données</li>
        <li>📦 <strong>Portabilité</strong> : exporter vos données en format JSON</li>
        <li>⛔ <strong>Opposition</strong> au traitement à des fins de marketing</li>
        <li>🔒 <strong>Limitation</strong> du traitement</li>
      </ul>
      <p>Pour exercer ces droits : <a href="mailto:privacy@socialfeed.app">privacy@socialfeed.app</a></p>
    </section>

    <section id="securite">
      <h2>6. Sécurité des données</h2>
      <p>Nous protégeons vos données avec :</p>
      <ul>
        <li>🔐 Chiffrement SSL/TLS pour toutes les communications</li>
        <li>🔑 Mots de passe hachés (SHA-256 + salt)</li>
        <li>🍪 Sessions sécurisées (httpOnly, SameSite=Lax)</li>
        <li>🛡️ Protection contre les attaques CSRF et XSS</li>
        <li>🗄️ Base de données chiffrée (Cloudflare D1)</li>
        <li>📱 Firebase App Check pour les applications mobiles</li>
      </ul>
    </section>

    <section id="contact">
      <h2>7. Nous contacter</h2>
      <div class="contact-card">
        <p><strong>SocialFeed – Responsable du traitement des données</strong></p>
        <p><i class="fas fa-envelope"></i> Email : <a href="mailto:privacy@socialfeed.app">privacy@socialfeed.app</a></p>
        <p><i class="fas fa-globe"></i> Site : <a href="https://socialfeed.app">socialfeed.app</a></p>
        <p>Délai de réponse : 30 jours maximum</p>
      </div>
    </section>
  </div>
</div>`
  return c.html(layout('Politique de Confidentialité', body))
})

app.get('/terms', (c) => {
  const body = `
<div class="legal-container">
  <div class="legal-header">
    <h1><i class="fas fa-file-contract"></i> Conditions Générales d'Utilisation</h1>
    <p class="legal-date">Dernière mise à jour : 1er mars 2026</p>
  </div>
  <div class="legal-content">
    <section>
      <h2>1. Acceptation des conditions</h2>
      <p>En utilisant SocialFeed, vous acceptez les présentes CGU. Si vous n'acceptez pas ces conditions, n'utilisez pas l'application.</p>
    </section>
    <section>
      <h2>2. Services proposés</h2>
      <p>SocialFeed est un réseau social permettant de partager du contenu, communiquer avec d'autres utilisateurs et accéder à des fonctionnalités Premium payantes.</p>
    </section>
    <section>
      <h2>3. Contenu interdit</h2>
      <ul>
        <li>Contenu haineux, discriminatoire ou violent</li>
        <li>Contenu sexuellement explicite</li>
        <li>Harcèlement ou intimidation</li>
        <li>Spam ou publicité non autorisée</li>
        <li>Informations fausses ou trompeuses</li>
        <li>Violation de droits d'auteur</li>
      </ul>
    </section>
    <section>
      <h2>4. Propriété intellectuelle</h2>
      <p>Vous conservez la propriété de votre contenu. En publiant sur SocialFeed, vous nous accordez une licence non exclusive pour diffuser ce contenu sur la plateforme.</p>
    </section>
    <section>
      <h2>5. Responsabilité</h2>
      <p>SocialFeed n'est pas responsable du contenu publié par les utilisateurs. Chaque utilisateur est responsable de son propre contenu.</p>
    </section>
    <section>
      <h2>6. Contact</h2>
      <p>Pour toute question : <a href="mailto:support@socialfeed.app">support@socialfeed.app</a></p>
    </section>
  </div>
</div>`
  return c.html(layout('CGU', body))
})

// ─── RECHERCHE UTILISATEURS (API) ─────────────────────────────────────────────

app.get('/api/users/search', authMiddleware, async (c) => {
  const q = c.req.query('q') || ''
  if (q.length < 2) return c.json({ users: [] })
  const res = await c.env.DB.prepare(`
    SELECT id, username, display_name, avatar_url
    FROM users WHERE username LIKE ? OR display_name LIKE ?
    LIMIT 10
  `).bind(`%${q}%`, `%${q}%`).all()
  return c.json({ users: res.results })
})

// ═══════════════════════════════════════════════════════════════════════════════
// ─── SYSTÈME DE FOLLOWERS ─────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

// Toggle follow/unfollow
app.post('/api/follow/:userId', authMiddleware, async (c) => {
  const myId = c.get('userId')
  const targetId = parseInt(c.req.param('userId'))
  if (myId === targetId) return c.json({ error: 'Impossible de vous suivre vous-même' }, 400)

  const existing = await c.env.DB.prepare(
    'SELECT id FROM follows WHERE follower_id = ? AND following_id = ?'
  ).bind(myId, targetId).first()

  if (existing) {
    await c.env.DB.prepare('DELETE FROM follows WHERE follower_id = ? AND following_id = ?').bind(myId, targetId).run()
    // Décrémenter stats créateur
    await c.env.DB.prepare(`
      UPDATE creator_monetization SET followers_count = MAX(0, followers_count - 1),
      last_stats_update = datetime('now') WHERE user_id = ?
    `).bind(targetId).run().catch(() => {})
    return c.json({ following: false })
  } else {
    await c.env.DB.prepare('INSERT INTO follows (follower_id, following_id) VALUES (?, ?)').bind(myId, targetId).run()
    // Notification
    await c.env.DB.prepare(
      'INSERT INTO notifications (user_id, actor_id, type) VALUES (?, ?, "follow")'
    ).bind(targetId, myId).run().catch(() => {})
    // Incrémenter stats créateur & recalculer éligibilité
    await updateCreatorStats(c.env.DB, targetId)
    return c.json({ following: true })
  }
})

// Récupérer le statut de follow
app.get('/api/follow/:userId/status', authMiddleware, async (c) => {
  const myId = c.get('userId')
  const targetId = c.req.param('userId')
  const f = await c.env.DB.prepare('SELECT id FROM follows WHERE follower_id = ? AND following_id = ?').bind(myId, targetId).first()
  const counts = await c.env.DB.prepare(`
    SELECT
      (SELECT COUNT(*) FROM follows WHERE following_id = ?) AS followers,
      (SELECT COUNT(*) FROM follows WHERE follower_id = ?) AS following
  `).bind(targetId, targetId).first() as any
  return c.json({ following: !!f, followers: counts?.followers || 0, following_count: counts?.following || 0 })
})

// Helper : recalculer les stats créateur et vérifier l'éligibilité
async function updateCreatorStats(db: D1Database, userId: number) {
  const followers = await db.prepare('SELECT COUNT(*) AS cnt FROM follows WHERE following_id = ?').bind(userId).first() as any
  const views60d = await db.prepare(`
    SELECT COALESCE(SUM(rv.id),0) AS cnt FROM reel_views rv
    JOIN reels r ON rv.reel_id = r.id
    WHERE r.user_id = ? AND rv.viewed_at >= datetime('now', '-60 days')
  `).bind(userId).first() as any
  const reelsCount = await db.prepare('SELECT COUNT(*) AS cnt FROM reels WHERE user_id = ? AND status = "active"').bind(userId).first() as any

  const followersCnt = followers?.cnt || 0
  const viewsCnt = views60d?.cnt || 0
  const reelsCnt = reelsCount?.cnt || 0

  // Vérifier si le créateur existe dans la table
  const existing = await db.prepare('SELECT id, status FROM creator_monetization WHERE user_id = ?').bind(userId).first() as any

  if (!existing) {
    await db.prepare(`
      INSERT INTO creator_monetization (user_id, followers_count, views_last_60_days, reels_count, status)
      VALUES (?, ?, ?, ?, 'not_eligible')
    `).bind(userId, followersCnt, viewsCnt, reelsCnt).run()
  } else {
    // Déterminer le nouveau statut
    let newStatus = existing.status
    if (existing.status === 'not_eligible' || existing.status === 'eligible') {
      if (followersCnt >= 3000 && viewsCnt >= 500000 && reelsCnt >= 1) {
        newStatus = 'eligible'
      } else {
        newStatus = 'not_eligible'
      }
    }
    await db.prepare(`
      UPDATE creator_monetization SET
        followers_count = ?, views_last_60_days = ?, reels_count = ?,
        status = ?, last_stats_update = datetime('now')
      WHERE user_id = ?
    `).bind(followersCnt, viewsCnt, reelsCnt, newStatus, userId).run()
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── PAGE REELS ───────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/reels', authMiddleware, async (c) => {
  const user = c.get('user')
  const userId = c.get('userId')

  // Reels recommandés : d'abord les créateurs suivis, puis les populaires
  const reels = await c.env.DB.prepare(`
    SELECT r.*, u.username, u.display_name, u.avatar_url,
      (SELECT COUNT(*) FROM reel_likes rl WHERE rl.reel_id = r.id) AS likes_count,
      (SELECT COUNT(*) FROM reel_comments rc WHERE rc.reel_id = r.id) AS comments_count,
      (SELECT COUNT(*) FROM reel_likes rl2 WHERE rl2.reel_id = r.id AND rl2.user_id = ?) AS user_liked,
      (SELECT COUNT(*) FROM follows f WHERE f.follower_id = ? AND f.following_id = r.user_id) AS is_following
    FROM reels r
    JOIN users u ON r.user_id = u.id
    WHERE r.status = 'active' AND r.privacy = 'public'
    ORDER BY
      CASE WHEN r.user_id IN (SELECT following_id FROM follows WHERE follower_id = ?) THEN 0 ELSE 1 END,
      (r.views_count * 0.3 + r.likes_count * 0.5 + r.shares_count * 0.2) DESC,
      r.created_at DESC
    LIMIT 30
  `).bind(userId, userId, userId).all()

  const reelCards = (reels.results as any[]).map((r, idx) => `
<div class="reel-card" id="reel-${r.id}" data-reel-id="${r.id}">
  <div class="reel-video-wrap">
    <video
      class="reel-video"
      src="${r.video_url}"
      poster="${r.thumbnail_url || ''}"
      loop playsinline preload="${idx === 0 ? 'auto' : 'none'}"
      onclick="toggleReelPlay(this)"
    ></video>
    <div class="reel-play-overlay" id="overlay-${r.id}">
      <i class="fas fa-play"></i>
    </div>
    ${r.is_monetized ? '<div class="reel-monetized-badge"><i class="fas fa-dollar-sign"></i> Monétisé</div>' : ''}
  </div>

  <div class="reel-sidebar">
    <a href="/profile/${r.username}" class="reel-avatar">
      ${r.avatar_url
        ? `<img src="${r.avatar_url}" class="avatar-md"/>`
        : `<div class="avatar-md avatar-placeholder" style="background:${stringToColor(r.display_name)}">${r.display_name[0].toUpperCase()}</div>`}
    </a>
    <button class="reel-action-btn ${r.user_liked ? 'liked' : ''}" onclick="toggleReelLike(${r.id}, this)" title="J'aime">
      <i class="${r.user_liked ? 'fas' : 'far'} fa-heart"></i>
      <span class="reel-action-count" id="reel-likes-${r.id}">${r.likes_count}</span>
    </button>
    <button class="reel-action-btn" onclick="toggleReelComments(${r.id})" title="Commenter">
      <i class="far fa-comment"></i>
      <span class="reel-action-count">${r.comments_count}</span>
    </button>
    <button class="reel-action-btn" onclick="shareReel(${r.id})" title="Partager">
      <i class="fas fa-share"></i>
      <span class="reel-action-count">${r.shares_count}</span>
    </button>
    <button class="reel-action-btn" onclick="toggleFollow(${r.user_id}, this)" title="${r.is_following ? 'Ne plus suivre' : 'Suivre'}">
      <i class="fas fa-${r.is_following ? 'user-check' : 'user-plus'}"></i>
    </button>
  </div>

  <div class="reel-info">
    <a href="/profile/${r.username}" class="reel-author">
      <strong>${r.display_name}</strong>
      <span class="reel-username">@${r.username}</span>
    </a>
    ${r.description ? `<p class="reel-description">${escapeHtml(r.description.substring(0, 100))}</p>` : ''}
    <span class="reel-views"><i class="fas fa-eye"></i> ${formatCount(r.views_count)} vues</span>
  </div>

  <!-- Panel commentaires -->
  <div class="reel-comments-panel hidden" id="reel-comments-panel-${r.id}">
    <div class="reel-comments-header">
      <span>Commentaires</span>
      <button onclick="toggleReelComments(${r.id})"><i class="fas fa-times"></i></button>
    </div>
    <div class="reel-comments-list" id="reel-comments-list-${r.id}"></div>
    <form class="reel-comment-form" onsubmit="addReelComment(event, ${r.id})">
      <input type="text" placeholder="Ajouter un commentaire…" class="reel-comment-input" required/>
      <button type="submit"><i class="fas fa-paper-plane"></i></button>
    </form>
  </div>
</div>`).join('')

  const body = `
<div class="reels-page">
  <div class="reels-header">
    <h1><i class="fas fa-film"></i> Reels</h1>
    <a href="/reels/create" class="btn-primary btn-sm"><i class="fas fa-plus"></i> Créer un Reel</a>
  </div>

  <div class="reels-feed" id="reels-feed">
    ${reelCards || `
    <div class="empty-reels">
      <i class="fas fa-film"></i>
      <h2>Aucun Reel pour l'instant</h2>
      <p>Soyez le premier à publier une vidéo courte !</p>
      <a href="/reels/create" class="btn-primary"><i class="fas fa-plus"></i> Créer mon premier Reel</a>
    </div>`}
  </div>
</div>
<script>
// Auto-play du premier reel
document.addEventListener('DOMContentLoaded', () => {
  const first = document.querySelector('.reel-video');
  if (first) {
    first.play().then(() => {
      document.querySelector('.reel-play-overlay')?.classList.add('hidden');
    }).catch(() => {});
  }
  // Intersection observer pour auto-play/pause
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      const video = entry.target.querySelector('.reel-video');
      const reelId = entry.target.dataset.reelId;
      if (entry.isIntersecting) {
        video?.play().catch(() => {});
        entry.target.querySelector('.reel-play-overlay')?.classList.add('hidden');
        // Compter la vue
        if (reelId) countReelView(reelId);
      } else {
        video?.pause();
      }
    });
  }, { threshold: 0.6 });
  document.querySelectorAll('.reel-card').forEach(card => observer.observe(card));
});
</script>`

  return c.html(layout('Reels', body, user))
})

// ─── PAGE CRÉER UN REEL ───────────────────────────────────────────────────────

app.get('/reels/create', authMiddleware, async (c) => {
  const user = c.get('user')
  const body = `
<div class="create-reel-container">
  <div class="create-reel-header">
    <a href="/reels" class="btn-icon"><i class="fas fa-arrow-left"></i></a>
    <h1><i class="fas fa-film"></i> Créer un Reel</h1>
  </div>

  <div class="create-reel-card">
    <div class="reel-preview-zone" id="reel-preview-zone">
      <div class="reel-preview-placeholder" id="reel-placeholder">
        <i class="fas fa-video"></i>
        <p>Collez l'URL de votre vidéo</p>
        <span>YouTube, TikTok, Streamable, ou lien direct .mp4</span>
      </div>
      <video id="reel-preview-video" class="reel-preview-video hidden" controls></video>
    </div>

    <form class="create-reel-form" onsubmit="publishReel(event)">
      <div class="form-group">
        <label><i class="fas fa-link"></i> URL de la vidéo *</label>
        <input
          type="url" id="reel-video-url" name="video_url"
          placeholder="https://... (lien direct vers une vidéo .mp4 ou URL YouTube)"
          class="form-input" required
          oninput="previewReelVideo(this.value)"
        />
        <small class="form-hint">💡 Hébergez votre vidéo sur Streamable, Cloudinary, ou tout hébergeur de fichiers</small>
      </div>

      <div class="form-group">
        <label><i class="fas fa-image"></i> URL de la miniature (optionnel)</label>
        <input type="url" id="reel-thumbnail" name="thumbnail_url" placeholder="https://... image de couverture" class="form-input"/>
      </div>

      <div class="form-group">
        <label><i class="fas fa-pen"></i> Description</label>
        <textarea name="description" placeholder="Décrivez votre Reel, ajoutez des #hashtags…" class="form-input" rows="3" maxlength="500"></textarea>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label><i class="fas fa-clock"></i> Durée (secondes)</label>
          <input type="number" name="duration" placeholder="Ex: 30" class="form-input" min="1" max="600"/>
        </div>
        <div class="form-group">
          <label><i class="fas fa-lock"></i> Visibilité</label>
          <select name="privacy" class="form-input">
            <option value="public">Public 🌍</option>
            <option value="friends">Amis seulement 👥</option>
            <option value="private">Privé 🔒</option>
          </select>
        </div>
      </div>

      <div class="reel-tips">
        <h4><i class="fas fa-lightbulb"></i> Conseils pour monétiser vos Reels</h4>
        <ul>
          <li>📱 Vidéo verticale 9:16 recommandée (comme TikTok/Reels Facebook)</li>
          <li>⏱️ Durée idéale : 15 à 60 secondes</li>
          <li>🎯 Contenu original = plus de vues = plus de revenus</li>
          <li>🔥 Les 3 premières secondes sont cruciales pour retenir l'attention</li>
          <li>💰 Objectif : 3 000 abonnés + 500 000 vues en 60 jours</li>
        </ul>
      </div>

      <button type="submit" class="btn-primary btn-full">
        <i class="fas fa-rocket"></i> Publier le Reel
      </button>
    </form>
  </div>
</div>
<script>
function previewReelVideo(url) {
  const video = document.getElementById('reel-preview-video');
  const placeholder = document.getElementById('reel-placeholder');
  if (!url) { video.classList.add('hidden'); placeholder.classList.remove('hidden'); return; }
  video.src = url;
  video.classList.remove('hidden');
  placeholder.classList.add('hidden');
}

async function publishReel(e) {
  e.preventDefault();
  const form = e.target;
  const data = {
    video_url: form.video_url.value.trim(),
    thumbnail_url: form.thumbnail_url?.value?.trim() || '',
    description: form.description.value.trim(),
    duration_seconds: parseInt(form.duration.value) || 0,
    privacy: form.privacy.value
  };
  const btn = form.querySelector('button[type=submit]');
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Publication…';
  btn.disabled = true;
  const res = await fetch('/api/reels', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data) });
  const result = await res.json();
  if (result.success) {
    window.location.href = '/reels';
  } else {
    alert('Erreur : ' + (result.error || 'Inconnue'));
    btn.innerHTML = '<i class="fas fa-rocket"></i> Publier le Reel';
    btn.disabled = false;
  }
}
</script>`
  return c.html(layout('Créer un Reel', body, user))
})

// ─── API REELS ────────────────────────────────────────────────────────────────

app.post('/api/reels', authMiddleware, async (c) => {
  const userId = c.get('userId')
  const { video_url, thumbnail_url, description, duration_seconds, privacy } = await c.req.json()
  if (!video_url) return c.json({ error: 'URL vidéo requise' }, 400)

  const r = await c.env.DB.prepare(`
    INSERT INTO reels (user_id, video_url, thumbnail_url, description, duration_seconds, privacy)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(userId, video_url, thumbnail_url || '', description || '', duration_seconds || 0, privacy || 'public').run()

  await updateCreatorStats(c.env.DB, userId)
  return c.json({ success: true, id: r.meta.last_row_id })
})

// Vue sur un reel
app.post('/api/reels/:id/view', authMiddleware, async (c) => {
  const userId = c.get('userId')
  const reelId = c.req.param('id')
  const { duration } = await c.req.json().catch(() => ({ duration: 0 }))

  await c.env.DB.prepare(
    'INSERT INTO reel_views (reel_id, viewer_id, watch_duration_seconds) VALUES (?, ?, ?)'
  ).bind(reelId, userId, duration || 0).run()

  await c.env.DB.prepare('UPDATE reels SET views_count = views_count + 1 WHERE id = ?').bind(reelId).run()

  // Mettre à jour les stats créateur pour éligibilité monétisation
  const reel = await c.env.DB.prepare('SELECT user_id FROM reels WHERE id = ?').bind(reelId).first() as any
  if (reel) await updateCreatorStats(c.env.DB, reel.user_id)

  // Calculer revenu estimé (25 XOF / 1000 vues) si créateur monétisé
  await c.env.DB.prepare(`
    UPDATE creator_monetization SET
      total_earnings_xof = total_earnings_xof + (rpm_xof / 1000.0),
      pending_payout_xof = pending_payout_xof + (rpm_xof / 1000.0)
    WHERE user_id = ? AND status = 'active'
  `).bind(reel?.user_id).run().catch(() => {})

  return c.json({ ok: true })
})

// Like reel
app.post('/api/reels/:id/like', authMiddleware, async (c) => {
  const userId = c.get('userId')
  const reelId = c.req.param('id')
  const existing = await c.env.DB.prepare('SELECT id FROM reel_likes WHERE reel_id = ? AND user_id = ?').bind(reelId, userId).first()
  if (existing) {
    await c.env.DB.prepare('DELETE FROM reel_likes WHERE reel_id = ? AND user_id = ?').bind(reelId, userId).run()
    await c.env.DB.prepare('UPDATE reels SET likes_count = MAX(0, likes_count - 1) WHERE id = ?').bind(reelId).run()
    const cnt = await c.env.DB.prepare('SELECT COUNT(*) AS cnt FROM reel_likes WHERE reel_id = ?').bind(reelId).first() as any
    return c.json({ liked: false, count: cnt?.cnt || 0 })
  } else {
    await c.env.DB.prepare('INSERT INTO reel_likes (reel_id, user_id) VALUES (?, ?)').bind(reelId, userId).run()
    await c.env.DB.prepare('UPDATE reels SET likes_count = likes_count + 1 WHERE id = ?').bind(reelId).run()
    const cnt = await c.env.DB.prepare('SELECT COUNT(*) AS cnt FROM reel_likes WHERE reel_id = ?').bind(reelId).first() as any
    return c.json({ liked: true, count: cnt?.cnt || 0 })
  }
})

// Commentaires reel
app.get('/api/reels/:id/comments', authMiddleware, async (c) => {
  const reelId = c.req.param('id')
  const comments = await c.env.DB.prepare(`
    SELECT rc.*, u.username, u.display_name, u.avatar_url
    FROM reel_comments rc JOIN users u ON rc.user_id = u.id
    WHERE rc.reel_id = ? ORDER BY rc.created_at DESC LIMIT 30
  `).bind(reelId).all()
  return c.json({ comments: comments.results })
})

app.post('/api/reels/:id/comments', authMiddleware, async (c) => {
  const userId = c.get('userId')
  const reelId = c.req.param('id')
  const { content } = await c.req.json()
  if (!content?.trim()) return c.json({ error: 'Commentaire vide' }, 400)
  const r = await c.env.DB.prepare('INSERT INTO reel_comments (reel_id, user_id, content) VALUES (?, ?, ?)').bind(reelId, userId, content.trim()).run()
  await c.env.DB.prepare('UPDATE reels SET comments_count = comments_count + 1 WHERE id = ?').bind(reelId).run()
  const user = c.get('user')
  return c.json({ id: r.meta.last_row_id, content: content.trim(), display_name: user.display_name, avatar_url: user.avatar_url, created_at: new Date().toISOString() })
})

// ═══════════════════════════════════════════════════════════════════════════════
// ─── DASHBOARD MONÉTISATION CRÉATEUR ─────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/creator', authMiddleware, async (c) => {
  const user = c.get('user')
  const userId = c.get('userId')

  // Mettre à jour les stats avant affichage
  await updateCreatorStats(c.env.DB, userId)

  const cm = await c.env.DB.prepare('SELECT * FROM creator_monetization WHERE user_id = ?').bind(userId).first() as any

  // Créer l'entrée si elle n'existe pas
  const stats = cm || {
    status: 'not_eligible',
    followers_count: 0,
    views_last_60_days: 0,
    reels_count: 0,
    required_followers: 3000,
    required_views_60d: 500000,
    total_earnings_xof: 0,
    pending_payout_xof: 0,
    total_paid_xof: 0,
    rpm_xof: 25
  }

  const followersCount = await c.env.DB.prepare('SELECT COUNT(*) AS cnt FROM follows WHERE following_id = ?').bind(userId).first() as any
  const reelsCount = await c.env.DB.prepare('SELECT COUNT(*) AS cnt FROM reels WHERE user_id = ? AND status = "active"').bind(userId).first() as any
  const views60d = await c.env.DB.prepare(`
    SELECT COALESCE(COUNT(*), 0) AS cnt FROM reel_views rv
    JOIN reels r ON rv.reel_id = r.id
    WHERE r.user_id = ? AND rv.viewed_at >= datetime('now', '-60 days')
  `).bind(userId).first() as any

  const fCount = followersCount?.cnt || 0
  const vCount = views60d?.cnt || 0
  const rCount = reelsCount?.cnt || 0

  // Calcul progression vers éligibilité
  const followersPct = Math.min(100, Math.round((fCount / 3000) * 100))
  const viewsPct = Math.min(100, Math.round((vCount / 500000) * 100))
  const isEligible = fCount >= 3000 && vCount >= 500000 && rCount >= 1
  const isActive = stats.status === 'active'

  // Stats journalières 30 derniers jours
  const dailyStats = await c.env.DB.prepare(`
    SELECT stat_date, views, new_followers, estimated_earnings_xof
    FROM creator_daily_stats
    WHERE user_id = ? AND stat_date >= date('now', '-30 days')
    ORDER BY stat_date ASC
  `).bind(userId).all()

  // Historique paiements
  const payouts = await c.env.DB.prepare(`
    SELECT * FROM creator_payouts WHERE user_id = ? ORDER BY created_at DESC LIMIT 10
  `).bind(userId).all()

  const statusBadge: Record<string, string> = {
    'not_eligible': '<span class="status-badge status-grey">❌ Non éligible</span>',
    'eligible': '<span class="status-badge status-yellow">⏳ Éligible – Candidature possible</span>',
    'pending_review': '<span class="status-badge status-orange">🔍 En cours d\'examen</span>',
    'active': '<span class="status-badge status-green">✅ Monétisation ACTIVE</span>',
    'suspended': '<span class="status-badge status-red">🚫 Suspendu</span>'
  }

  const body = `
<div class="creator-dashboard">

  <!-- ── En-tête ── -->
  <div class="creator-hero">
    <div class="creator-hero-left">
      ${avatarHtml(user, 'xl')}
      <div>
        <h1>${user.display_name}</h1>
        <span class="creator-username">@${user.username}</span>
        ${statusBadge[stats.status] || ''}
      </div>
    </div>
    <a href="/reels/create" class="btn-primary">
      <i class="fas fa-plus"></i> Nouveau Reel
    </a>
  </div>

  <!-- ── Métriques clés ── -->
  <div class="creator-metrics">
    <div class="metric-card">
      <div class="metric-icon"><i class="fas fa-users"></i></div>
      <div class="metric-value">${formatNum(fCount)}</div>
      <div class="metric-label">Abonnés</div>
    </div>
    <div class="metric-card">
      <div class="metric-icon"><i class="fas fa-eye"></i></div>
      <div class="metric-value">${formatNum(vCount)}</div>
      <div class="metric-label">Vues (60 jours)</div>
    </div>
    <div class="metric-card">
      <div class="metric-icon"><i class="fas fa-film"></i></div>
      <div class="metric-value">${rCount}</div>
      <div class="metric-label">Reels publiés</div>
    </div>
    <div class="metric-card ${isActive ? 'metric-earnings' : ''}">
      <div class="metric-icon"><i class="fas fa-coins"></i></div>
      <div class="metric-value">${isActive ? formatNum(Math.round(stats.total_earnings_xof)) + ' XOF' : '–'}</div>
      <div class="metric-label">Revenus totaux</div>
    </div>
  </div>

  <!-- ── Progression éligibilité ── -->
  <div class="eligibility-card">
    <div class="eligibility-header">
      <h2><i class="fas fa-trophy"></i> Programme de Monétisation</h2>
      ${isEligible && !isActive
        ? `<button class="btn-primary" onclick="applyMonetization()"><i class="fas fa-paper-plane"></i> Postuler maintenant</button>`
        : isActive
        ? `<button class="btn-success" onclick="requestPayout()"><i class="fas fa-wallet"></i> Demander un paiement</button>`
        : ''}
    </div>

    <div class="eligibility-criteria">
      <!-- Critère 1 : Abonnés -->
      <div class="criterion ${fCount >= 3000 ? 'criterion-met' : ''}">
        <div class="criterion-header">
          <div class="criterion-title">
            <i class="fas ${fCount >= 3000 ? 'fa-check-circle' : 'fa-circle'}"></i>
            <span>Abonnés</span>
          </div>
          <span class="criterion-count">${formatNum(fCount)} / 3 000</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill ${fCount >= 3000 ? 'progress-complete' : ''}"
               style="width:${followersPct}%"></div>
        </div>
        <span class="criterion-hint">
          ${fCount >= 3000
            ? '✅ Critère atteint !'
            : `Encore ${formatNum(3000 - fCount)} abonnés nécessaires`}
        </span>
      </div>

      <!-- Critère 2 : Vues 60 jours -->
      <div class="criterion ${vCount >= 500000 ? 'criterion-met' : ''}">
        <div class="criterion-header">
          <div class="criterion-title">
            <i class="fas ${vCount >= 500000 ? 'fa-check-circle' : 'fa-circle'}"></i>
            <span>Vues de Reels (60 derniers jours)</span>
          </div>
          <span class="criterion-count">${formatNum(vCount)} / 500 000</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill ${vCount >= 500000 ? 'progress-complete' : ''}"
               style="width:${viewsPct}%"></div>
        </div>
        <span class="criterion-hint">
          ${vCount >= 500000
            ? '✅ Critère atteint !'
            : `Encore ${formatNum(500000 - vCount)} vues nécessaires en 60 jours`}
        </span>
      </div>

      <!-- Critère 3 : Reels publiés -->
      <div class="criterion ${rCount >= 1 ? 'criterion-met' : ''}">
        <div class="criterion-header">
          <div class="criterion-title">
            <i class="fas ${rCount >= 1 ? 'fa-check-circle' : 'fa-circle'}"></i>
            <span>Au moins 1 Reel publié</span>
          </div>
          <span class="criterion-count">${rCount} Reel${rCount > 1 ? 's' : ''}</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill ${rCount >= 1 ? 'progress-complete' : ''}"
               style="width:${Math.min(100, rCount * 100)}%"></div>
        </div>
        <span class="criterion-hint">
          ${rCount >= 1 ? '✅ Critère atteint !' : 'Publiez votre premier Reel'}
        </span>
      </div>
    </div>

    ${isEligible ? `
    <div class="eligibility-ready">
      <i class="fas fa-star"></i>
      <div>
        <h3>🎉 Vous êtes éligible à la monétisation !</h3>
        <p>Tous les critères sont atteints. Postulez pour commencer à gagner de l'argent avec vos Reels.</p>
      </div>
    </div>` : `
    <div class="eligibility-tips">
      <h4><i class="fas fa-lightbulb"></i> Comment atteindre l'éligibilité plus vite ?</h4>
      <div class="tips-grid">
        <div class="tip"><i class="fas fa-clock"></i><span>Publiez 1 à 3 Reels par jour</span></div>
        <div class="tip"><i class="fas fa-hashtag"></i><span>Utilisez des hashtags tendance</span></div>
        <div class="tip"><i class="fas fa-share-alt"></i><span>Partagez sur d'autres réseaux</span></div>
        <div class="tip"><i class="fas fa-comments"></i><span>Répondez aux commentaires</span></div>
        <div class="tip"><i class="fas fa-fire"></i><span>Contenu viral = explosion des vues</span></div>
        <div class="tip"><i class="fas fa-calendar"></i><span>Publiez aux heures de pointe (18h–22h)</span></div>
      </div>
    </div>`}
  </div>

  ${isActive ? `
  <!-- ── Revenus & Paiements ── -->
  <div class="earnings-section">
    <h2><i class="fas fa-wallet"></i> Revenus & Paiements</h2>
    <div class="earnings-grid">
      <div class="earnings-card">
        <span class="earnings-label">Solde disponible</span>
        <span class="earnings-amount">${Math.round(stats.pending_payout_xof).toLocaleString()} XOF</span>
        <button class="btn-primary btn-sm" onclick="requestPayout()"><i class="fas fa-paper-plane"></i> Retirer</button>
      </div>
      <div class="earnings-card">
        <span class="earnings-label">Total gagné</span>
        <span class="earnings-amount">${Math.round(stats.total_earnings_xof).toLocaleString()} XOF</span>
      </div>
      <div class="earnings-card">
        <span class="earnings-label">Déjà payé</span>
        <span class="earnings-amount">${Math.round(stats.total_paid_xof).toLocaleString()} XOF</span>
      </div>
      <div class="earnings-card">
        <span class="earnings-label">Taux (RPM)</span>
        <span class="earnings-amount">${stats.rpm_xof} XOF<small>/1000 vues</small></span>
      </div>
    </div>

    <div class="payout-history">
      <h3>Historique des paiements</h3>
      ${(payouts.results as any[]).length > 0 ? `
      <table class="payout-table">
        <thead><tr><th>Date</th><th>Montant</th><th>Méthode</th><th>Statut</th><th>Référence</th></tr></thead>
        <tbody>
          ${(payouts.results as any[]).map(p => `
          <tr>
            <td>${new Date(p.created_at).toLocaleDateString('fr-FR')}</td>
            <td><strong>${Math.round(p.amount_xof).toLocaleString()} XOF</strong></td>
            <td>${p.payment_method}</td>
            <td><span class="payout-status payout-${p.status}">${p.status}</span></td>
            <td><code>${p.reference}</code></td>
          </tr>`).join('')}
        </tbody>
      </table>` : '<p class="empty-result">Aucun paiement pour l\'instant.</p>'}
    </div>
  </div>` : ''}

  <!-- ── Mes Reels ── -->
  <div class="my-reels-section">
    <div class="section-header">
      <h2><i class="fas fa-film"></i> Mes Reels</h2>
      <a href="/reels/create" class="btn-secondary btn-sm"><i class="fas fa-plus"></i> Nouveau</a>
    </div>
    <div id="my-reels-list" class="my-reels-grid">
      <div class="loading"><i class="fas fa-spinner fa-spin"></i></div>
    </div>
  </div>
</div>

<!-- Modal candidature monétisation -->
<div class="modal-overlay hidden" id="apply-modal">
  <div class="modal-card">
    <div class="modal-header">
      <h3><i class="fas fa-crown"></i> Activer la monétisation</h3>
      <button onclick="closeApplyModal()"><i class="fas fa-times"></i></button>
    </div>
    <p style="margin-bottom:16px;color:var(--text-secondary)">Choisissez votre méthode de paiement pour recevoir vos revenus.</p>
    <select id="apply-method" class="form-input" style="margin-bottom:12px">
      <option value="orange_money">Orange Money</option>
      <option value="wave">Wave</option>
      <option value="mtn">MTN Mobile Money</option>
      <option value="free_money">Free Money</option>
    </select>
    <input type="tel" id="apply-phone" placeholder="Numéro de téléphone" class="form-input" style="margin-bottom:16px"/>
    <button class="btn-primary btn-full" onclick="confirmApplyMonetization()">
      <i class="fas fa-check"></i> Confirmer et activer
    </button>
  </div>
</div>

<!-- Modal retrait -->
<div class="modal-overlay hidden" id="payout-modal">
  <div class="modal-card">
    <div class="modal-header">
      <h3><i class="fas fa-wallet"></i> Retirer mes revenus</h3>
      <button onclick="closePayoutModal()"><i class="fas fa-times"></i></button>
    </div>
    <div id="payout-balance" style="background:var(--bg);padding:16px;border-radius:8px;margin-bottom:16px;font-size:18px;text-align:center;font-weight:700;"></div>
    <select id="payout-method" class="form-input" style="margin-bottom:12px">
      <option value="orange_money">Orange Money</option>
      <option value="wave">Wave</option>
      <option value="mtn">MTN Mobile Money</option>
    </select>
    <input type="tel" id="payout-phone" placeholder="Numéro de réception" class="form-input" style="margin-bottom:16px"/>
    <button class="btn-primary btn-full" onclick="confirmPayout()">
      <i class="fas fa-paper-plane"></i> Envoyer
    </button>
  </div>
</div>

<script>
// Charger mes reels
fetch('/api/reels/mine').then(r=>r.json()).then(data => {
  const el = document.getElementById('my-reels-list');
  if (!el) return;
  if (!data.reels?.length) { el.innerHTML = '<p class="empty-result">Aucun Reel publié. <a href="/reels/create">Créez votre premier !</a></p>'; return; }
  el.innerHTML = data.reels.map(r => \`
    <div class="my-reel-thumb">
      <div class="my-reel-img" style="background:#000;position:relative">
        \${r.thumbnail_url ? \`<img src="\${r.thumbnail_url}" style="width:100%;height:100%;object-fit:cover"/>\` : '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#fff;font-size:28px"><i class="fas fa-film"></i></div>'}
        <div style="position:absolute;bottom:4px;right:4px;background:rgba(0,0,0,.7);color:white;font-size:11px;padding:2px 6px;border-radius:4px">
          <i class="fas fa-eye"></i> \${r.views_count}
        </div>
        \${r.is_monetized ? '<div style="position:absolute;top:4px;left:4px;background:#f7b928;color:#000;font-size:10px;padding:2px 6px;border-radius:4px;font-weight:700">💰 Monétisé</div>' : ''}
      </div>
      <div class="my-reel-info">
        <span class="my-reel-views"><i class="fas fa-eye"></i> \${r.views_count}</span>
        <span><i class="fas fa-heart"></i> \${r.likes_count}</span>
      </div>
    </div>
  \`).join('');
});

function applyMonetization() { document.getElementById('apply-modal').classList.remove('hidden'); }
function closeApplyModal() { document.getElementById('apply-modal').classList.add('hidden'); }

async function confirmApplyMonetization() {
  const method = document.getElementById('apply-method').value;
  const phone = document.getElementById('apply-phone').value.trim();
  if (!phone) { alert('Numéro requis'); return; }
  const res = await fetch('/api/creator/apply', {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ payment_method: method, payment_phone: phone })
  });
  const data = await res.json();
  if (data.success) { alert('✅ ' + data.message); location.reload(); }
  else alert('❌ ' + data.error);
}

function requestPayout() {
  const balance = ${isActive ? Math.round(stats.pending_payout_xof) : 0};
  document.getElementById('payout-balance').innerHTML = 'Solde disponible : <strong>' + balance.toLocaleString() + ' XOF</strong>';
  document.getElementById('payout-modal').classList.remove('hidden');
}
function closePayoutModal() { document.getElementById('payout-modal').classList.add('hidden'); }

async function confirmPayout() {
  const method = document.getElementById('payout-method').value;
  const phone = document.getElementById('payout-phone').value.trim();
  if (!phone) { alert('Numéro requis'); return; }
  const res = await fetch('/api/creator/payout', {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ payment_method: method, payment_phone: phone })
  });
  const data = await res.json();
  if (data.success) { alert('✅ ' + data.message); location.reload(); }
  else alert('❌ ' + data.error);
}
</script>`

  return c.html(layout('Dashboard Créateur', body, user))
})

// ─── API CRÉATEUR : Mes reels ─────────────────────────────────────────────────
app.get('/api/reels/mine', authMiddleware, async (c) => {
  const userId = c.get('userId')
  const reels = await c.env.DB.prepare(`
    SELECT id, video_url, thumbnail_url, description, views_count, likes_count,
           comments_count, is_monetized, created_at
    FROM reels WHERE user_id = ? AND status = 'active'
    ORDER BY created_at DESC LIMIT 50
  `).bind(userId).all()
  return c.json({ reels: reels.results })
})

// ─── API CRÉATEUR : Candidature monétisation ──────────────────────────────────
app.post('/api/creator/apply', authMiddleware, async (c) => {
  const userId = c.get('userId')
  const { payment_method, payment_phone } = await c.req.json()

  await updateCreatorStats(c.env.DB, userId)
  const cm = await c.env.DB.prepare('SELECT * FROM creator_monetization WHERE user_id = ?').bind(userId).first() as any

  if (!cm || (cm.followers_count < 3000 || cm.views_last_60_days < 500000)) {
    return c.json({ error: 'Vous ne remplissez pas encore tous les critères d\'éligibilité.' }, 400)
  }

  if (cm.status === 'active') return c.json({ error: 'Votre monétisation est déjà active.' }, 400)

  await c.env.DB.prepare(`
    UPDATE creator_monetization SET
      status = 'active',
      payment_method = ?,
      payment_phone = ?,
      approved_at = datetime('now'),
      applied_at = datetime('now'),
      next_payout_date = datetime('now', '+30 days')
    WHERE user_id = ?
  `).bind(payment_method, payment_phone, userId).run()

  // Marquer les reels existants comme monétisés
  await c.env.DB.prepare('UPDATE reels SET is_monetized = 1 WHERE user_id = ? AND status = "active"').bind(userId).run()

  return c.json({ success: true, message: 'Félicitations ! Votre monétisation est maintenant active. Vos Reels rapportent 25 XOF par 1000 vues.' })
})

// ─── API CRÉATEUR : Demande de paiement ───────────────────────────────────────
app.post('/api/creator/payout', authMiddleware, async (c) => {
  const userId = c.get('userId')
  const { payment_method, payment_phone } = await c.req.json()

  const cm = await c.env.DB.prepare('SELECT * FROM creator_monetization WHERE user_id = ? AND status = "active"').bind(userId).first() as any
  if (!cm) return c.json({ error: 'Monétisation non active' }, 400)
  if (cm.pending_payout_xof < 5000) return c.json({ error: `Solde insuffisant. Minimum de retrait : 5 000 XOF (vous avez ${Math.round(cm.pending_payout_xof)} XOF)` }, 400)

  const ref = 'PAYOUT-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7).toUpperCase()
  const amount = cm.pending_payout_xof

  await c.env.DB.prepare(`
    INSERT INTO creator_payouts (user_id, amount_xof, payment_method, payment_phone, reference, status, views_count)
    VALUES (?, ?, ?, ?, ?, 'processing', ?)
  `).bind(userId, amount, payment_method, payment_phone, ref, cm.views_last_60_days).run()

  await c.env.DB.prepare(`
    UPDATE creator_monetization SET
      pending_payout_xof = 0,
      total_paid_xof = total_paid_xof + ?,
      last_payout_at = datetime('now'),
      next_payout_date = datetime('now', '+30 days')
    WHERE user_id = ?
  `).bind(amount, userId).run()

  return c.json({
    success: true,
    message: `Paiement de ${Math.round(amount).toLocaleString()} XOF en cours de traitement vers votre ${payment_method}. Référence : ${ref}`
  })
})

// ─── API : Vérifier l'éligibilité (endpoint rapide) ──────────────────────────
app.get('/api/creator/eligibility', authMiddleware, async (c) => {
  const userId = c.get('userId')
  await updateCreatorStats(c.env.DB, userId)
  const cm = await c.env.DB.prepare('SELECT * FROM creator_monetization WHERE user_id = ?').bind(userId).first() as any
  if (!cm) return c.json({ eligible: false, followers: 0, views: 0, reels: 0 })
  return c.json({
    eligible: cm.status === 'eligible' || cm.status === 'active',
    active: cm.status === 'active',
    status: cm.status,
    followers: cm.followers_count,
    views: cm.views_last_60_days,
    reels: cm.reels_count,
    earnings: cm.total_earnings_xof,
    pending: cm.pending_payout_xof
  })
})

// Helper formatage
function formatNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return String(n)
}

function formatCount(n: number): string { return formatNum(n) }

export default app
