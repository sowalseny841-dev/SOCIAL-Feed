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
    <a href="/notifications" class="nav-btn" title="Notifications" id="notif-btn">
      <i class="fas fa-bell"></i>
      <span class="notif-badge hidden" id="notif-count"></span>
    </a>
  </div>
  <div class="nav-right">
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
  <a href="/notifications" class="mobile-nav-btn"><i class="fas fa-bell"></i><span>Notifs</span></a>
  <a href="/search" class="mobile-nav-btn"><i class="fas fa-search"></i><span>Recherche</span></a>
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

export default app
