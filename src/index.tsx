import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { serveStatic } from 'hono/cloudflare-workers'

type Bindings = { DB: D1Database }
type Variables = { userId: number; username: string; displayName: string; avatarUrl: string }

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>()

app.use('*', cors())
app.use('/static/*', serveStatic({ root: './public' }))

// ─── Helpers ───────────────────────────────────────────────────────────────

async function hashPwd(pwd: string): Promise<string> {
  const data = new TextEncoder().encode(pwd + 'sf2026salt')
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2,'0')).join('')
}

function genSid(): string {
  const b = new Uint8Array(24); crypto.getRandomValues(b)
  return Array.from(b).map(x => x.toString(16).padStart(2,'0')).join('')
}

function ago(d: string): string {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000)
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s/60)}min`
  if (s < 86400) return `${Math.floor(s/3600)}h`
  return `${Math.floor(s/86400)}j`
}

function esc(s: string): string {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

function initials(name: string): string {
  return name.split(' ').map(w=>w[0]||'').join('').toUpperCase().slice(0,2) || 'U'
}

function colorFor(s: string): string {
  const colors = ['#1877F2','#E91E63','#9C27B0','#FF5722','#4CAF50','#00BCD4','#FF9800','#3F51B5']
  let h = 0; for (const c of s) h = (h*31 + c.charCodeAt(0)) & 0xffffffff
  return colors[Math.abs(h) % colors.length]
}

function avatar(url: string|null, name: string, size=40): string {
  if (url) return `<img src="${esc(url)}" style="width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;" alt="">`
  const bg = colorFor(name)
  return `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${bg};display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:${Math.floor(size*0.35)}px;flex-shrink:0;">${initials(name)}</div>`
}

// ─── Auth Middleware ────────────────────────────────────────────────────────

app.use('/api/*', async (c, next) => {
  if (c.req.path.startsWith('/api/auth')) return next()
  const sid = getCookie(c, 'sid')
  if (!sid) return c.json({ error: 'Non connecté' }, 401)
  const row = await c.env.DB.prepare(
    'SELECT u.id,u.username,u.display_name,u.avatar_url FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=? AND s.expires_at>datetime("now")'
  ).bind(sid).first<{id:number;username:string;display_name:string;avatar_url:string|null}>()
  if (!row) return c.json({ error: 'Session expirée' }, 401)
  c.set('userId', row.id)
  c.set('username', row.username)
  c.set('displayName', row.display_name)
  c.set('avatarUrl', row.avatar_url || '')
  return next()
})

// ─── Layout ────────────────────────────────────────────────────────────────

function layout(title: string, body: string, user?: {username:string;displayName:string;avatarUrl:string}): string {
  const nav = user ? `
  <nav style="background:#1877F2;padding:0 16px;height:56px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:100;box-shadow:0 2px 8px rgba(0,0,0,.2);">
    <a href="/" style="color:#fff;font-weight:900;font-size:20px;text-decoration:none;">📱 SocialFeed</a>
    <div style="display:flex;gap:8px;align-items:center;">
      <a href="/notifications" style="color:#fff;text-decoration:none;padding:8px;border-radius:50%;background:rgba(255,255,255,.15);">🔔</a>
      <a href="/profile/${esc(user.username)}" style="text-decoration:none;display:flex;align-items:center;gap:8px;background:rgba(255,255,255,.15);padding:4px 10px 4px 4px;border-radius:20px;">
        ${avatar(user.avatarUrl||null, user.displayName, 28)}
        <span style="color:#fff;font-weight:600;font-size:14px;">${esc(user.displayName)}</span>
      </a>
      <a href="/logout" style="color:#fff;text-decoration:none;padding:8px;border-radius:50%;background:rgba(255,255,255,.15);" title="Déconnexion">🚪</a>
    </div>
  </nav>` : `
  <nav style="background:#1877F2;padding:0 16px;height:56px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:100;">
    <span style="color:#fff;font-weight:900;font-size:20px;">📱 SocialFeed</span>
    <a href="/auth" style="color:#fff;text-decoration:none;font-weight:600;">Connexion</a>
  </nav>`

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<meta name="theme-color" content="#1877F2">
<title>${esc(title)} - SocialFeed</title>
<link rel="manifest" href="/manifest.json">
<link rel="icon" href="/favicon.ico" type="image/svg+xml">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f0f2f5;min-height:100vh}
.container{max-width:680px;margin:0 auto;padding:16px}
.card{background:#fff;border-radius:12px;padding:16px;margin-bottom:12px;box-shadow:0 1px 3px rgba(0,0,0,.1)}
input,textarea{width:100%;padding:12px;border:1.5px solid #ddd;border-radius:8px;font-size:15px;font-family:inherit;outline:none;transition:border .2s}
input:focus,textarea:focus{border-color:#1877F2}
button{cursor:pointer;border:none;border-radius:8px;padding:10px 20px;font-size:15px;font-weight:600;transition:all .15s}
.btn-primary{background:#1877F2;color:#fff;width:100%;padding:14px}
.btn-primary:hover{background:#166FE5}
.btn-secondary{background:#e7f3ff;color:#1877F2}
.btn-like{background:none;border:none;cursor:pointer;font-size:14px;color:#65676B;padding:6px 12px;border-radius:6px;}
.btn-like:hover,.btn-like.liked{color:#1877F2;background:#e7f3ff}
.btn-comment{background:none;border:none;cursor:pointer;font-size:14px;color:#65676B;padding:6px 12px;border-radius:6px;}
.btn-comment:hover{color:#1877F2;background:#e7f3ff}
.btn-delete{background:none;border:none;cursor:pointer;color:#c0392b;font-size:13px;padding:4px 8px}
a{color:#1877F2;text-decoration:none}
a:hover{text-decoration:underline}
.error{background:#fff5f5;border:1px solid #f87171;color:#c0392b;padding:12px;border-radius:8px;margin-bottom:12px}
.success{background:#f0fff4;border:1px solid #86efac;color:#166534;padding:12px;border-radius:8px;margin-bottom:12px}
.spinner{display:inline-block;width:20px;height:20px;border:3px solid #e7f3ff;border-top:3px solid #1877F2;border-radius:50%;animation:spin .8s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.divider{border:none;border-top:1px solid #e4e6eb;margin:8px 0}
@media(max-width:680px){.container{padding:8px}}
.post-header{display:flex;align-items:center;gap:10px;margin-bottom:10px}
.post-actions{display:flex;gap:4px;border-top:1px solid #e4e6eb;padding-top:8px;margin-top:8px}
.post-stats{display:flex;justify-content:space-between;font-size:13px;color:#65676B;padding:4px 0}
.comment-item{display:flex;gap:8px;margin-bottom:10px;align-items:flex-start}
.comment-bubble{background:#f0f2f5;border-radius:12px;padding:8px 12px;flex:1}
</style>
</head>
<body>
${nav}
${body}
<script>
// Animations légères
document.querySelectorAll('form').forEach(f=>{
  f.addEventListener('submit',()=>{
    const btn=f.querySelector('button[type=submit]')
    if(btn){btn.disabled=true;btn.innerHTML='<span class="spinner"></span>'}
  })
})
</script>
</body>
</html>`
}

// ─── Page d'accueil (Feed) ──────────────────────────────────────────────────

app.get('/', async (c) => {
  const sid = getCookie(c, 'sid')
  let user = null
  if (sid) {
    const row = await c.env.DB.prepare(
      'SELECT u.id,u.username,u.display_name,u.avatar_url FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=? AND s.expires_at>datetime("now")'
    ).bind(sid).first<any>()
    if (row) user = { id: row.id, username: row.username, displayName: row.display_name, avatarUrl: row.avatar_url }
  }

  if (!user) {
    return c.html(layout('Accueil', `
    <div class="container" style="max-width:480px;padding-top:40px">
      <div class="card" style="text-align:center;padding:40px 24px">
        <div style="font-size:64px;margin-bottom:16px">📱</div>
        <h1 style="color:#1877F2;font-size:28px;margin-bottom:8px">SocialFeed</h1>
        <p style="color:#65676B;margin-bottom:24px">Rejoignez la communauté. Partagez, aimez, commentez.</p>
        <a href="/auth" style="display:block;background:#1877F2;color:#fff;padding:14px;border-radius:8px;font-weight:700;font-size:16px;margin-bottom:12px">Se connecter</a>
        <a href="/auth?mode=register" style="display:block;background:#42B72A;color:#fff;padding:14px;border-radius:8px;font-weight:700;font-size:16px">Créer un compte</a>
      </div>
    </div>`))
  }

  // Charger les posts
  const posts = await c.env.DB.prepare(`
    SELECT p.id,p.content,p.image_url,p.created_at,
           u.username,u.display_name,u.avatar_url,
           (SELECT COUNT(*) FROM likes WHERE post_id=p.id) as likes_count,
           (SELECT COUNT(*) FROM comments WHERE post_id=p.id) as comments_count,
           (SELECT 1 FROM likes WHERE post_id=p.id AND user_id=?) as liked_by_me
    FROM posts p JOIN users u ON u.id=p.user_id
    ORDER BY p.created_at DESC LIMIT 30
  `).bind(user.id).all<any>()

  const postsHtml = posts.results.length === 0
    ? `<div class="card" style="text-align:center;padding:40px;color:#65676B">
        <div style="font-size:40px;margin-bottom:12px">🌟</div>
        <p>Aucune publication pour l'instant.<br>Soyez le premier à publier !</p>
       </div>`
    : posts.results.map(p => `
    <div class="card" id="post-${p.id}">
      <div class="post-header">
        <a href="/profile/${esc(p.username)}">${avatar(p.avatar_url, p.display_name)}</a>
        <div style="flex:1">
          <a href="/profile/${esc(p.username)}" style="font-weight:700;color:#050505">${esc(p.display_name)}</a>
          <div style="font-size:12px;color:#65676B">@${esc(p.username)} · ${ago(p.created_at)}</div>
        </div>
        ${p.user_id === user.id ? `<form method="POST" action="/api/posts/${p.id}/delete" style="display:inline" onsubmit="return confirm('Supprimer ?')"><button class="btn-delete" type="submit">🗑️</button></form>` : ''}
      </div>
      <p style="font-size:15px;line-height:1.5;white-space:pre-wrap;margin-bottom:10px">${esc(p.content)}</p>
      ${p.image_url ? `<img src="${esc(p.image_url)}" style="width:100%;border-radius:8px;margin-bottom:10px;max-height:400px;object-fit:cover;" loading="lazy">` : ''}
      <div class="post-stats">
        <span>${p.likes_count} J'aime</span>
        <span>${p.comments_count} commentaire${p.comments_count>1?'s':''}</span>
      </div>
      <div class="post-actions">
        <form method="POST" action="/api/posts/${p.id}/like" style="flex:1">
          <button class="btn-like ${p.liked_by_me?'liked':''}" type="submit" style="width:100%">
            ${p.liked_by_me ? '❤️' : '🤍'} J'aime
          </button>
        </form>
        <button class="btn-comment" onclick="toggleComments(${p.id})" style="flex:1">
          💬 Commenter
        </button>
      </div>
      <div id="comments-${p.id}" style="display:none;margin-top:12px">
        <form method="POST" action="/api/posts/${p.id}/comment" style="display:flex;gap:8px;margin-bottom:12px">
          ${avatar(user.avatarUrl||null, user.displayName, 32)}
          <input name="content" placeholder="Écrire un commentaire…" required style="flex:1;padding:8px 12px;border-radius:20px;border:1.5px solid #ddd">
          <button type="submit" style="background:#1877F2;color:#fff;border:none;border-radius:20px;padding:8px 16px;cursor:pointer">→</button>
        </form>
        <div id="comments-list-${p.id}">
          <a href="/post/${p.id}" style="font-size:13px;color:#65676B">Voir les ${p.comments_count} commentaire${p.comments_count>1?'s':''}…</a>
        </div>
      </div>
    </div>`).join('')

  const html = `
  <div class="container">
    <!-- Créer un post -->
    <div class="card">
      <div style="display:flex;gap:10px;align-items:flex-start">
        ${avatar(user.avatarUrl||null, user.displayName)}
        <div style="flex:1">
          <form method="POST" action="/api/posts">
            <textarea name="content" placeholder="Quoi de neuf, ${esc(user.displayName)} ?" rows="3" required style="resize:none;border-radius:20px;background:#f0f2f5;border:1.5px solid #e4e6eb;padding:10px 16px;font-size:15px"></textarea>
            <div style="display:flex;justify-content:flex-end;margin-top:8px">
              <button type="submit" style="background:#1877F2;color:#fff;border:none;border-radius:20px;padding:8px 20px;font-weight:600;cursor:pointer">Publier</button>
            </div>
          </form>
        </div>
      </div>
    </div>
    ${postsHtml}
  </div>
  <script>
  function toggleComments(id) {
    const el = document.getElementById('comments-'+id)
    el.style.display = el.style.display === 'none' ? 'block' : 'none'
  }
  </script>`

  return c.html(layout('Fil d\'actualité', html, user))
})

// ─── Auth ───────────────────────────────────────────────────────────────────

app.get('/auth', (c) => {
  const mode = c.req.query('mode') || 'login'
  const err = c.req.query('error') || ''
  const isReg = mode === 'register'

  const html = `
  <div class="container" style="max-width:460px;padding-top:32px">
    <div class="card" style="padding:32px">
      <div style="text-align:center;margin-bottom:24px">
        <div style="font-size:48px">📱</div>
        <h1 style="color:#1877F2;font-size:24px;margin-top:8px">${isReg ? 'Créer un compte' : 'Connexion'}</h1>
        <p style="color:#65676B;font-size:14px;margin-top:4px">${isReg ? 'Rejoignez SocialFeed' : 'Bienvenue sur SocialFeed'}</p>
      </div>
      ${err ? `<div class="error">${esc(err)}</div>` : ''}
      <form method="POST" action="/api/auth/${isReg ? 'register' : 'login'}">
        ${isReg ? `
        <div style="margin-bottom:12px">
          <input name="display_name" placeholder="Prénom et Nom" required autocomplete="name">
        </div>
        <div style="margin-bottom:12px">
          <input name="username" placeholder="Nom d'utilisateur (sans espaces)" required pattern="[a-zA-Z0-9_]+" title="Lettres, chiffres et _ seulement" autocomplete="username">
        </div>` : ''}
        <div style="margin-bottom:12px">
          <input name="email" type="email" placeholder="Adresse email" required autocomplete="email">
        </div>
        <div style="margin-bottom:20px">
          <input name="password" type="password" placeholder="Mot de passe" required minlength="6" autocomplete="${isReg?'new-password':'current-password'}">
        </div>
        <button type="submit" class="btn-primary">${isReg ? 'Créer mon compte' : 'Se connecter'}</button>
      </form>
      <hr class="divider" style="margin:20px 0">
      <a href="/auth?mode=${isReg?'login':'register'}" style="display:block;text-align:center;background:${isReg?'#f0f2f5':'#42B72A'};color:${isReg?'#1877F2':'#fff'};padding:12px;border-radius:8px;font-weight:600">
        ${isReg ? 'Déjà un compte ? Se connecter' : 'Créer un nouveau compte'}
      </a>
    </div>
  </div>`

  return c.html(layout(isReg ? 'Inscription' : 'Connexion', html))
})

app.post('/api/auth/login', async (c) => {
  const body = await c.req.parseBody()
  const email = (body.email as string || '').trim().toLowerCase()
  const password = body.password as string || ''

  if (!email || !password) return c.redirect('/auth?error=Champs manquants')

  const user = await c.env.DB.prepare('SELECT * FROM users WHERE email=?').bind(email).first<any>()
  if (!user) return c.redirect('/auth?error=Email ou mot de passe incorrect')

  const hashed = await hashPwd(password)
  if (user.password_hash !== hashed) return c.redirect('/auth?error=Email ou mot de passe incorrect')

  const sid = genSid()
  await c.env.DB.prepare('INSERT INTO sessions(id,user_id,expires_at) VALUES(?,?,datetime("now","+30 days"))').bind(sid, user.id).run()

  setCookie(c, 'sid', sid, { httpOnly: true, sameSite: 'Lax', maxAge: 2592000, path: '/' })
  return c.redirect('/')
})

app.post('/api/auth/register', async (c) => {
  const body = await c.req.parseBody()
  const displayName = (body.display_name as string || '').trim()
  const username = (body.username as string || '').trim().toLowerCase()
  const email = (body.email as string || '').trim().toLowerCase()
  const password = body.password as string || ''

  if (!displayName || !username || !email || !password) return c.redirect('/auth?mode=register&error=Tous les champs sont requis')
  if (!/^[a-zA-Z0-9_]+$/.test(username)) return c.redirect('/auth?mode=register&error=Nom d\'utilisateur invalide')
  if (password.length < 6) return c.redirect('/auth?mode=register&error=Mot de passe trop court (6 min)')

  const existing = await c.env.DB.prepare('SELECT id FROM users WHERE email=? OR username=?').bind(email, username).first<any>()
  if (existing) return c.redirect('/auth?mode=register&error=Email ou nom d\'utilisateur déjà utilisé')

  const hash = await hashPwd(password)
  const result = await c.env.DB.prepare(
    'INSERT INTO users(username,display_name,email,password_hash,bio,avatar_url,created_at) VALUES(?,?,?,?,"","",datetime("now")) RETURNING id'
  ).bind(username, displayName, email, hash).first<{id:number}>()

  if (!result) return c.redirect('/auth?mode=register&error=Erreur lors de l\'inscription')

  const sid = genSid()
  await c.env.DB.prepare('INSERT INTO sessions(id,user_id,expires_at) VALUES(?,?,datetime("now","+30 days"))').bind(sid, result.id).run()

  setCookie(c, 'sid', sid, { httpOnly: true, sameSite: 'Lax', maxAge: 2592000, path: '/' })
  return c.redirect('/')
})

app.get('/logout', (c) => {
  const sid = getCookie(c, 'sid')
  if (sid) c.env.DB.prepare('DELETE FROM sessions WHERE id=?').bind(sid).run()
  deleteCookie(c, 'sid', { path: '/' })
  return c.redirect('/auth')
})

// ─── API Posts ──────────────────────────────────────────────────────────────

app.post('/api/posts', async (c) => {
  const sid = getCookie(c, 'sid')
  if (!sid) return c.redirect('/auth')
  const row = await c.env.DB.prepare(
    'SELECT u.id FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=? AND s.expires_at>datetime("now")'
  ).bind(sid).first<{id:number}>()
  if (!row) return c.redirect('/auth')

  const body = await c.req.parseBody()
  const content = (body.content as string || '').trim()
  if (!content || content.length > 2000) return c.redirect('/')

  await c.env.DB.prepare('INSERT INTO posts(user_id,content,image_url,created_at) VALUES(?,?,NULL,datetime("now"))').bind(row.id, content).run()
  return c.redirect('/')
})

app.post('/api/posts/:id/like', async (c) => {
  const sid = getCookie(c, 'sid')
  if (!sid) return c.redirect('/auth')
  const row = await c.env.DB.prepare(
    'SELECT u.id FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=? AND s.expires_at>datetime("now")'
  ).bind(sid).first<{id:number}>()
  if (!row) return c.redirect('/auth')

  const postId = parseInt(c.req.param('id'))
  const existing = await c.env.DB.prepare('SELECT id FROM likes WHERE post_id=? AND user_id=?').bind(postId, row.id).first()
  if (existing) {
    await c.env.DB.prepare('DELETE FROM likes WHERE post_id=? AND user_id=?').bind(postId, row.id).run()
  } else {
    await c.env.DB.prepare('INSERT INTO likes(post_id,user_id,created_at) VALUES(?,?,datetime("now"))').bind(postId, row.id).run()
  }
  const ref = c.req.header('referer') || '/'
  return c.redirect(ref)
})

app.post('/api/posts/:id/comment', async (c) => {
  const sid = getCookie(c, 'sid')
  if (!sid) return c.redirect('/auth')
  const row = await c.env.DB.prepare(
    'SELECT u.id FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=? AND s.expires_at>datetime("now")'
  ).bind(sid).first<{id:number}>()
  if (!row) return c.redirect('/auth')

  const postId = parseInt(c.req.param('id'))
  const body = await c.req.parseBody()
  const content = (body.content as string || '').trim()
  if (!content) return c.redirect(c.req.header('referer') || '/')

  await c.env.DB.prepare('INSERT INTO comments(post_id,user_id,content,created_at) VALUES(?,?,?,datetime("now"))').bind(postId, row.id, content).run()
  return c.redirect(c.req.header('referer') || '/')
})

app.post('/api/posts/:id/delete', async (c) => {
  const sid = getCookie(c, 'sid')
  if (!sid) return c.redirect('/auth')
  const row = await c.env.DB.prepare(
    'SELECT u.id FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=? AND s.expires_at>datetime("now")'
  ).bind(sid).first<{id:number}>()
  if (!row) return c.redirect('/auth')

  const postId = parseInt(c.req.param('id'))
  await c.env.DB.prepare('DELETE FROM posts WHERE id=? AND user_id=?').bind(postId, row.id).run()
  await c.env.DB.prepare('DELETE FROM likes WHERE post_id=?').bind(postId).run()
  await c.env.DB.prepare('DELETE FROM comments WHERE post_id=?').bind(postId).run()
  return c.redirect('/')
})

// ─── Page post détail ───────────────────────────────────────────────────────

app.get('/post/:id', async (c) => {
  const sid = getCookie(c, 'sid')
  let user: any = null
  if (sid) {
    const row = await c.env.DB.prepare(
      'SELECT u.id,u.username,u.display_name,u.avatar_url FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=? AND s.expires_at>datetime("now")'
    ).bind(sid).first<any>()
    if (row) user = { id: row.id, username: row.username, displayName: row.display_name, avatarUrl: row.avatar_url }
  }

  const postId = parseInt(c.req.param('id'))
  const post = await c.env.DB.prepare(`
    SELECT p.*,u.username,u.display_name,u.avatar_url,
           (SELECT COUNT(*) FROM likes WHERE post_id=p.id) as likes_count,
           (SELECT COUNT(*) FROM comments WHERE post_id=p.id) as comments_count
           ${user ? `,(SELECT 1 FROM likes WHERE post_id=p.id AND user_id=${user.id}) as liked_by_me` : ''}
    FROM posts p JOIN users u ON u.id=p.user_id WHERE p.id=?
  `).bind(postId).first<any>()

  if (!post) return c.html(layout('Post introuvable', '<div class="container"><div class="card" style="text-align:center;padding:40px">Post introuvable</div></div>'))

  const comments = await c.env.DB.prepare(`
    SELECT c.*,u.username,u.display_name,u.avatar_url
    FROM comments c JOIN users u ON u.id=c.user_id
    WHERE c.post_id=? ORDER BY c.created_at ASC
  `).bind(postId).all<any>()

  const commentsHtml = comments.results.map(cm => `
    <div class="comment-item">
      <a href="/profile/${esc(cm.username)}">${avatar(cm.avatar_url, cm.display_name, 32)}</a>
      <div class="comment-bubble">
        <div style="font-weight:700;font-size:13px">${esc(cm.display_name)} <span style="font-weight:400;color:#65676B">· ${ago(cm.created_at)}</span></div>
        <div style="font-size:14px;margin-top:2px">${esc(cm.content)}</div>
      </div>
    </div>`).join('')

  const html = `
  <div class="container" style="max-width:600px">
    <a href="/" style="display:inline-flex;align-items:center;gap:4px;margin-bottom:12px;color:#65676B">← Retour</a>
    <div class="card">
      <div class="post-header">
        <a href="/profile/${esc(post.username)}">${avatar(post.avatar_url, post.display_name)}</a>
        <div>
          <a href="/profile/${esc(post.username)}" style="font-weight:700;color:#050505">${esc(post.display_name)}</a>
          <div style="font-size:12px;color:#65676B">@${esc(post.username)} · ${ago(post.created_at)}</div>
        </div>
      </div>
      <p style="font-size:16px;line-height:1.6;white-space:pre-wrap">${esc(post.content)}</p>
      ${post.image_url ? `<img src="${esc(post.image_url)}" style="width:100%;border-radius:8px;margin-top:12px">` : ''}
      <div class="post-stats" style="margin-top:12px">
        <span>${post.likes_count} J'aime</span>
        <span>${post.comments_count} commentaire${post.comments_count>1?'s':''}</span>
      </div>
      ${user ? `<div class="post-actions">
        <form method="POST" action="/api/posts/${post.id}/like" style="flex:1">
          <button class="btn-like ${post.liked_by_me?'liked':''}" type="submit" style="width:100%">${post.liked_by_me?'❤️':'🤍'} J'aime</button>
        </form>
      </div>` : ''}
    </div>

    <div class="card">
      <h3 style="margin-bottom:16px;font-size:16px">💬 Commentaires (${post.comments_count})</h3>
      ${commentsHtml || '<p style="color:#65676B;text-align:center;padding:20px 0">Aucun commentaire. Soyez le premier !</p>'}
      ${user ? `
      <hr class="divider" style="margin:16px 0">
      <form method="POST" action="/api/posts/${postId}/comment" style="display:flex;gap:8px;align-items:center">
        ${avatar(user.avatarUrl||null, user.displayName, 36)}
        <input name="content" placeholder="Écrire un commentaire…" required style="flex:1;border-radius:20px;padding:10px 16px">
        <button type="submit" style="background:#1877F2;color:#fff;border:none;border-radius:20px;padding:10px 18px;cursor:pointer;font-weight:600">Envoyer</button>
      </form>` : `<p style="text-align:center;margin-top:12px"><a href="/auth">Connectez-vous pour commenter</a></p>`}
    </div>
  </div>`

  return c.html(layout('Publication', html, user || undefined))
})

// ─── Profil ─────────────────────────────────────────────────────────────────

app.get('/profile/:username', async (c) => {
  const sid = getCookie(c, 'sid')
  let viewer: any = null
  if (sid) {
    const row = await c.env.DB.prepare(
      'SELECT u.id,u.username,u.display_name,u.avatar_url FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=? AND s.expires_at>datetime("now")'
    ).bind(sid).first<any>()
    if (row) viewer = { id: row.id, username: row.username, displayName: row.display_name, avatarUrl: row.avatar_url }
  }

  const profileUser = await c.env.DB.prepare('SELECT * FROM users WHERE username=?').bind(c.req.param('username')).first<any>()
  if (!profileUser) return c.html(layout('Profil introuvable', '<div class="container"><div class="card" style="padding:40px;text-align:center">Profil introuvable</div></div>'))

  const userPosts = await c.env.DB.prepare(`
    SELECT p.*,(SELECT COUNT(*) FROM likes WHERE post_id=p.id) as likes_count,
           (SELECT COUNT(*) FROM comments WHERE post_id=p.id) as comments_count
    FROM posts p WHERE p.user_id=? ORDER BY p.created_at DESC LIMIT 20
  `).bind(profileUser.id).all<any>()

  const isOwn = viewer && viewer.id === profileUser.id
  const postsHtml = userPosts.results.map(p => `
    <a href="/post/${p.id}" style="display:block;text-decoration:none;color:inherit">
      <div class="card" style="margin-bottom:8px">
        <p style="font-size:15px;line-height:1.4;margin-bottom:8px">${esc(p.content)}</p>
        <div style="font-size:13px;color:#65676B;display:flex;gap:16px">
          <span>❤️ ${p.likes_count}</span>
          <span>💬 ${p.comments_count}</span>
          <span>${ago(p.created_at)}</span>
        </div>
      </div>
    </a>`).join('')

  const html = `
  <div class="container" style="max-width:600px">
    <div class="card" style="padding:0;overflow:hidden">
      <div style="background:linear-gradient(135deg,#1877F2,#42B72A);height:120px;position:relative">
        <div style="position:absolute;bottom:-30px;left:20px">
          ${avatar(profileUser.avatar_url, profileUser.display_name, 80)}
        </div>
        ${isOwn ? `<a href="/settings" style="position:absolute;top:12px;right:12px;background:rgba(255,255,255,.9);color:#050505;padding:6px 12px;border-radius:20px;font-size:13px;font-weight:600">✏️ Modifier</a>` : ''}
      </div>
      <div style="padding:48px 20px 20px">
        <h2 style="font-size:20px;font-weight:800">${esc(profileUser.display_name)}</h2>
        <p style="color:#65676B;margin-bottom:4px">@${esc(profileUser.username)}</p>
        ${profileUser.bio ? `<p style="margin-top:8px;font-size:14px">${esc(profileUser.bio)}</p>` : ''}
        <p style="margin-top:8px;font-size:13px;color:#65676B">Membre depuis ${new Date(profileUser.created_at).toLocaleDateString('fr-FR')}</p>
      </div>
    </div>
    <h3 style="margin:16px 0 8px;font-size:16px">Publications (${userPosts.results.length})</h3>
    ${postsHtml || '<div class="card" style="text-align:center;padding:32px;color:#65676B">Aucune publication</div>'}
  </div>`

  return c.html(layout(`Profil de ${profileUser.display_name}`, html, viewer || undefined))
})

// ─── Paramètres profil ──────────────────────────────────────────────────────

app.get('/settings', async (c) => {
  const sid = getCookie(c, 'sid')
  if (!sid) return c.redirect('/auth')
  const row = await c.env.DB.prepare(
    'SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=? AND s.expires_at>datetime("now")'
  ).bind(sid).first<any>()
  if (!row) return c.redirect('/auth')

  const user = { id: row.id, username: row.username, displayName: row.display_name, avatarUrl: row.avatar_url || '' }
  const err = c.req.query('error') || ''
  const ok = c.req.query('ok') || ''

  const html = `
  <div class="container" style="max-width:520px">
    <div class="card">
      <h2 style="margin-bottom:20px">✏️ Modifier mon profil</h2>
      ${err ? `<div class="error">${esc(err)}</div>` : ''}
      ${ok ? `<div class="success">✅ Profil mis à jour !</div>` : ''}
      <form method="POST" action="/api/settings">
        <div style="margin-bottom:12px">
          <label style="display:block;font-weight:600;margin-bottom:6px">Nom d'affichage</label>
          <input name="display_name" value="${esc(row.display_name)}" required>
        </div>
        <div style="margin-bottom:12px">
          <label style="display:block;font-weight:600;margin-bottom:6px">Bio</label>
          <textarea name="bio" rows="3" style="resize:none">${esc(row.bio||'')}</textarea>
        </div>
        <div style="margin-bottom:20px">
          <label style="display:block;font-weight:600;margin-bottom:6px">URL avatar (image)</label>
          <input name="avatar_url" type="url" value="${esc(row.avatar_url||'')}" placeholder="https://...">
        </div>
        <button type="submit" class="btn-primary">Enregistrer</button>
      </form>
      <hr class="divider" style="margin:20px 0">
      <a href="/profile/${esc(row.username)}" style="display:block;text-align:center;color:#65676B">← Voir mon profil</a>
    </div>
  </div>`

  return c.html(layout('Paramètres', html, user))
})

app.post('/api/settings', async (c) => {
  const sid = getCookie(c, 'sid')
  if (!sid) return c.redirect('/auth')
  const row = await c.env.DB.prepare(
    'SELECT u.id FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=? AND s.expires_at>datetime("now")'
  ).bind(sid).first<{id:number}>()
  if (!row) return c.redirect('/auth')

  const body = await c.req.parseBody()
  const displayName = (body.display_name as string || '').trim()
  const bio = (body.bio as string || '').trim()
  const avatarUrl = (body.avatar_url as string || '').trim()

  if (!displayName) return c.redirect('/settings?error=Le nom ne peut pas être vide')

  await c.env.DB.prepare('UPDATE users SET display_name=?,bio=?,avatar_url=? WHERE id=?').bind(displayName, bio, avatarUrl || null, row.id).run()
  return c.redirect('/settings?ok=1')
})

// ─── Notifications ──────────────────────────────────────────────────────────

app.get('/notifications', async (c) => {
  const sid = getCookie(c, 'sid')
  if (!sid) return c.redirect('/auth')
  const row = await c.env.DB.prepare(
    'SELECT u.id,u.username,u.display_name,u.avatar_url FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=? AND s.expires_at>datetime("now")'
  ).bind(sid).first<any>()
  if (!row) return c.redirect('/auth')

  const user = { id: row.id, username: row.username, displayName: row.display_name, avatarUrl: row.avatar_url || '' }

  // Derniers likes sur mes posts
  const likes = await c.env.DB.prepare(`
    SELECT l.created_at, u.display_name, u.username, u.avatar_url, p.id as post_id, p.content
    FROM likes l
    JOIN users u ON u.id=l.user_id
    JOIN posts p ON p.id=l.post_id
    WHERE p.user_id=? AND l.user_id!=?
    ORDER BY l.created_at DESC LIMIT 20
  `).bind(row.id, row.id).all<any>()

  // Derniers commentaires sur mes posts
  const comments = await c.env.DB.prepare(`
    SELECT c.created_at, c.content as comment_content, u.display_name, u.username, u.avatar_url, p.id as post_id, p.content as post_content
    FROM comments c
    JOIN users u ON u.id=c.user_id
    JOIN posts p ON p.id=c.post_id
    WHERE p.user_id=? AND c.user_id!=?
    ORDER BY c.created_at DESC LIMIT 20
  `).bind(row.id, row.id).all<any>()

  // Fusionner et trier
  const notifs = [
    ...likes.results.map(l => ({ type:'like', ...l })),
    ...comments.results.map(c => ({ type:'comment', ...c }))
  ].sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0,30)

  const notifsHtml = notifs.length === 0
    ? '<div class="card" style="text-align:center;padding:40px;color:#65676B">Aucune notification</div>'
    : notifs.map(n => `
      <div class="card" style="display:flex;align-items:center;gap:12px;padding:12px 16px">
        <a href="/profile/${esc(n.username)}">${avatar(n.avatar_url, n.display_name, 44)}</a>
        <div style="flex:1">
          <span style="font-weight:700">${esc(n.display_name)}</span>
          ${n.type === 'like'
            ? ` a aimé votre <a href="/post/${n.post_id}">publication</a>`
            : ` a commenté : <em>"${esc(n.comment_content)}"</em> sur votre <a href="/post/${n.post_id}">publication</a>`}
          <div style="font-size:12px;color:#65676B;margin-top:2px">${ago(n.created_at)}</div>
        </div>
        <span style="font-size:20px">${n.type==='like'?'❤️':'💬'}</span>
      </div>`).join('')

  const html = `
  <div class="container" style="max-width:600px">
    <h2 style="margin-bottom:16px">🔔 Notifications</h2>
    ${notifsHtml}
  </div>`

  return c.html(layout('Notifications', html, user))
})

// ─── Manifest PWA ───────────────────────────────────────────────────────────

app.get('/manifest.json', (c) => {
  return c.json({
    name: 'SocialFeed',
    short_name: 'SocialFeed',
    description: 'Réseau social - Partagez et connectez-vous',
    start_url: '/',
    display: 'standalone',
    background_color: '#f0f2f5',
    theme_color: '#1877F2',
    orientation: 'portrait',
    icons: [
      { src: '/static/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/static/icon-512.png', sizes: '512x512', type: 'image/png' }
    ]
  })
})

// ─── Favicon ─────────────────────────────────────────────────────────────────

app.get('/favicon.ico', (c) => {
  // SVG favicon encoded as ICO-compatible response
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#1877F2"/><text y="24" x="16" text-anchor="middle" font-size="22" fill="white">📱</text></svg>`
  return new Response(svg, { headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public,max-age=86400' } })
})

// ─── 404 ─────────────────────────────────────────────────────────────────────

app.notFound((c) => {
  return c.html(layout('Page introuvable', `
    <div class="container" style="text-align:center;padding-top:60px">
      <div style="font-size:64px;margin-bottom:16px">🔍</div>
      <h2 style="margin-bottom:12px">Page introuvable</h2>
      <a href="/" class="btn-secondary" style="display:inline-block;padding:12px 24px;border-radius:8px">← Retour à l'accueil</a>
    </div>`), 404)
})

export default app
