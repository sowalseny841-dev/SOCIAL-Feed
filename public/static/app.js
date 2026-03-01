/* SocialFeed - Frontend JS */

// ── Toast notification ──────────────────────────────────────────────────────
function showToast(msg, duration = 3000) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove('show'), duration);
}

// ── Post Modal ──────────────────────────────────────────────────────────────
function openPostModal(mode) {
  const modal = document.getElementById('post-modal');
  if (!modal) return;
  modal.classList.remove('hidden');
  const textarea = document.getElementById('post-content');
  if (textarea) textarea.focus();
  if (mode === 'photo') {
    document.getElementById('post-image-url')?.focus();
  }
}

function closePostModal() {
  const modal = document.getElementById('post-modal');
  if (modal) modal.classList.add('hidden');
}

// Fermer modal si clic sur overlay
document.addEventListener('click', (e) => {
  const modal = document.getElementById('post-modal');
  if (modal && e.target === modal) closePostModal();
});

// Compteur caractères
const postContent = document.getElementById('post-content');
if (postContent) {
  postContent.addEventListener('input', () => {
    const count = document.getElementById('char-count');
    if (count) count.textContent = postContent.value.length;
  });
}

// Preview image URL
const imageUrlInput = document.getElementById('post-image-url');
if (imageUrlInput) {
  imageUrlInput.addEventListener('input', () => {
    const url = imageUrlInput.value.trim();
    const preview = document.getElementById('image-preview');
    const container = document.getElementById('image-preview-container');
    if (url && preview && container) {
      preview.src = url;
      container.classList.remove('hidden');
    } else if (container) {
      container.classList.add('hidden');
    }
  });
}

function removeImage() {
  const input = document.getElementById('post-image-url');
  const container = document.getElementById('image-preview-container');
  if (input) input.value = '';
  if (container) container.classList.add('hidden');
}

// ── Soumettre un post ───────────────────────────────────────────────────────
async function submitPost(e) {
  e.preventDefault();
  const content = document.getElementById('post-content')?.value?.trim();
  const imageUrl = document.getElementById('post-image-url')?.value?.trim() || '';
  if (!content) return;

  const btn = document.getElementById('post-submit-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Publication…'; }

  try {
    const res = await fetch('/api/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, image_url: imageUrl })
    });
    const data = await res.json();
    if (data.success && data.post) {
      closePostModal();
      document.getElementById('post-content').value = '';
      document.getElementById('post-image-url').value = '';
      document.getElementById('image-preview-container')?.classList.add('hidden');
      document.getElementById('char-count').textContent = '0';
      prependPost(data.post);
      showToast('✅ Publication créée !');
    }
  } catch {
    showToast('❌ Erreur lors de la publication');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Publier'; }
  }
}

function prependPost(post) {
  const feed = document.getElementById('posts-feed');
  if (!feed) return;
  const empty = feed.querySelector('.empty-feed');
  if (empty) empty.remove();

  const div = document.createElement('div');
  const liked = false;
  const avatarHtml = post.avatar_url
    ? `<img src="${post.avatar_url}" alt="avatar" class="avatar-md"/>`
    : `<div class="avatar-md avatar-placeholder">${(post.display_name || '?')[0].toUpperCase()}</div>`;

  div.innerHTML = `
  <article class="post-card" data-post-id="${post.id}">
    <div class="post-header">
      <a href="/profile/${post.username}" class="post-author-link">
        ${avatarHtml}
        <div class="post-author-info">
          <span class="post-author-name">${escHtml(post.display_name)}</span>
          <span class="post-time"><i class="fas fa-clock"></i> à l'instant</span>
        </div>
      </a>
      <div class="post-menu">
        <button class="post-menu-btn" onclick="toggleMenu(this)"><i class="fas fa-ellipsis-h"></i></button>
        <div class="post-menu-dropdown hidden">
          <button onclick="deletePost(${post.id})"><i class="fas fa-trash"></i> Supprimer</button>
        </div>
      </div>
    </div>
    <div class="post-body">
      <p class="post-content">${escHtml(post.content)}</p>
      ${post.image_url ? `<img src="${post.image_url}" alt="image" class="post-image" onerror="this.style.display='none'"/>` : ''}
    </div>
    <div class="post-stats">
      <span class="stat-item">0 <i class="fas fa-heart"></i></span>
      <span class="stat-item">0 commentaire</span>
    </div>
    <div class="post-actions">
      <button class="action-btn" onclick="toggleLike(${post.id}, this)">
        <i class="far fa-heart"></i><span>J'aime</span>
      </button>
      <button class="action-btn" onclick="toggleComments(${post.id})">
        <i class="far fa-comment"></i><span>Commenter</span>
      </button>
      <button class="action-btn" onclick="sharePost(${post.id})">
        <i class="fas fa-share"></i><span>Partager</span>
      </button>
    </div>
    <div class="comments-section hidden" id="comments-${post.id}">
      <div class="comments-list" id="comments-list-${post.id}"></div>
      <form class="comment-form" onsubmit="addComment(event, ${post.id})">
        <input type="text" placeholder="Écrire un commentaire…" class="comment-input" required/>
        <button type="submit" class="comment-submit"><i class="fas fa-paper-plane"></i></button>
      </form>
    </div>
  </article>`;
  feed.insertBefore(div.firstElementChild, feed.firstChild);
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/\n/g, '<br/>');
}

// ── Supprimer un post ───────────────────────────────────────────────────────
async function deletePost(postId) {
  if (!confirm('Supprimer cette publication ?')) return;
  try {
    const res = await fetch(`/api/posts/${postId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      const el = document.querySelector(`[data-post-id="${postId}"]`);
      if (el) el.remove();
      showToast('🗑️ Publication supprimée');
    }
  } catch {
    showToast('❌ Erreur lors de la suppression');
  }
}

// ── Toggle Like ─────────────────────────────────────────────────────────────
async function toggleLike(postId, btn) {
  try {
    const res = await fetch(`/api/posts/${postId}/like`, { method: 'POST' });
    const data = await res.json();
    const icon = btn.querySelector('i');
    const card = btn.closest('.post-card');
    const stat = card?.querySelector('.post-stats .stat-item');

    if (data.liked) {
      btn.classList.add('liked');
      if (icon) { icon.className = 'fas fa-heart'; }
    } else {
      btn.classList.remove('liked');
      if (icon) { icon.className = 'far fa-heart'; }
    }
    if (stat) stat.innerHTML = `${data.count} <i class="fas fa-heart"></i>`;
  } catch {
    showToast('❌ Erreur');
  }
}

// ── Commentaires ────────────────────────────────────────────────────────────
async function toggleComments(postId) {
  const section = document.getElementById(`comments-${postId}`);
  if (!section) return;

  if (section.classList.contains('hidden')) {
    section.classList.remove('hidden');
    const listEl = document.getElementById(`comments-list-${postId}`);
    if (listEl && listEl.children.length === 0) {
      listEl.innerHTML = '<div class="spinner"><i class="fas fa-spinner fa-spin"></i></div>';
      try {
        const res = await fetch(`/api/posts/${postId}/comments`);
        const data = await res.json();
        renderComments(listEl, data.comments);
      } catch {
        listEl.innerHTML = '';
      }
    }
  } else {
    section.classList.add('hidden');
  }
}

function renderComments(container, comments) {
  if (!comments || comments.length === 0) {
    container.innerHTML = '<p style="text-align:center;color:#65676B;font-size:13px;padding:8px">Soyez le premier à commenter !</p>';
    return;
  }
  container.innerHTML = comments.map(c => {
    const av = c.avatar_url
      ? `<img src="${c.avatar_url}" alt="av" class="avatar-sm"/>`
      : `<div class="avatar-sm avatar-placeholder">${(c.display_name || '?')[0].toUpperCase()}</div>`;
    return `
    <div class="comment-item">
      <a href="/profile/${c.username}">${av}</a>
      <div>
        <div class="comment-bubble">
          <a href="/profile/${c.username}" class="comment-author">${escHtml(c.display_name)}</a>
          <p class="comment-text">${escHtml(c.content)}</p>
        </div>
        <span class="comment-time">${timeAgo(c.created_at)}</span>
      </div>
    </div>`;
  }).join('');
}

async function addComment(e, postId) {
  e.preventDefault();
  const form = e.target;
  const input = form.querySelector('.comment-input');
  const content = input?.value?.trim();
  if (!content) return;

  try {
    const res = await fetch(`/api/posts/${postId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content })
    });
    const data = await res.json();
    if (data.comment) {
      input.value = '';
      const listEl = document.getElementById(`comments-list-${postId}`);
      if (listEl) {
        const empty = listEl.querySelector('p');
        if (empty) empty.remove();
        const div = document.createElement('div');
        const av = data.comment.avatar_url
          ? `<img src="${data.comment.avatar_url}" alt="av" class="avatar-sm"/>`
          : `<div class="avatar-sm avatar-placeholder">${(data.comment.display_name || '?')[0].toUpperCase()}</div>`;
        div.innerHTML = `
        <div class="comment-item">
          <a href="/profile/${data.comment.username}">${av}</a>
          <div>
            <div class="comment-bubble">
              <a href="/profile/${data.comment.username}" class="comment-author">${escHtml(data.comment.display_name)}</a>
              <p class="comment-text">${escHtml(data.comment.content)}</p>
            </div>
            <span class="comment-time">à l'instant</span>
          </div>
        </div>`;
        listEl.appendChild(div.firstElementChild);
        // Mettre à jour le compteur
        const card = form.closest('.post-card');
        const statItems = card?.querySelectorAll('.post-stats .stat-item');
        if (statItems && statItems[1]) {
          const current = parseInt(statItems[1].textContent) || 0;
          statItems[1].textContent = `${current + 1} commentaire${current + 1 > 1 ? 's' : ''}`;
        }
      }
    }
  } catch {
    showToast('❌ Erreur lors du commentaire');
  }
}

// ── Amis ────────────────────────────────────────────────────────────────────
async function addFriend(userId, btn, cardId) {
  try {
    const res = await fetch('/api/friends/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId })
    });
    const data = await res.json();
    if (data.success) {
      if (btn) {
        btn.textContent = '✓ Demande envoyée';
        btn.disabled = true;
        btn.className = 'btn-secondary btn-sm';
      }
      showToast('👥 Demande d\'ami envoyée !');
    } else {
      showToast('⚠️ ' + (data.error || 'Erreur'));
    }
  } catch {
    showToast('❌ Erreur réseau');
  }
}

async function respondFriend(friendshipId, action, cardId) {
  try {
    const res = await fetch('/api/friends/respond', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ friendship_id: friendshipId, action })
    });
    const data = await res.json();
    if (data.success) {
      const card = document.getElementById(`req-${cardId}`);
      if (card) card.remove();
      showToast(action === 'accept' ? '✅ Ami accepté !' : '❌ Demande refusée');
    }
  } catch {
    showToast('❌ Erreur réseau');
  }
}

// ── Menu post ────────────────────────────────────────────────────────────────
function toggleMenu(btn) {
  const dropdown = btn.nextElementSibling;
  if (dropdown) dropdown.classList.toggle('hidden');
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('.post-menu')) {
    document.querySelectorAll('.post-menu-dropdown').forEach(d => d.classList.add('hidden'));
  }
});

// ── Partager ─────────────────────────────────────────────────────────────────
function sharePost(postId) {
  const url = `${window.location.origin}`;
  if (navigator.share) {
    navigator.share({ title: 'SocialFeed', url }).catch(() => {});
  } else {
    navigator.clipboard.writeText(url).then(() => showToast('🔗 Lien copié !'));
  }
}

// ── Onglets profil ───────────────────────────────────────────────────────────
function showTab(name) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.add('hidden'));
  document.querySelectorAll('.profile-tab').forEach(t => t.classList.remove('active'));
  const tab = document.getElementById(`tab-${name}`);
  if (tab) tab.classList.remove('hidden');
  const btn = document.querySelector(`[onclick="showTab('${name}')"]`);
  if (btn) btn.classList.add('active');
}

// ── Helper timeAgo ───────────────────────────────────────────────────────────
function timeAgo(dateStr) {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 5) return 'à l\'instant';
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}j`;
  return new Date(dateStr).toLocaleDateString('fr-FR');
}

// ── Suggestions (sidebar) ────────────────────────────────────────────────────
async function loadSuggestions() {
  const container = document.getElementById('suggestions-list');
  if (!container) return;
  try {
    const res = await fetch('/api/suggestions');
    const data = await res.json();
    if (data.suggestions && data.suggestions.length) {
      container.innerHTML = data.suggestions.map(u => `
      <div class="suggestion-item">
        <a href="/profile/${u.username}">
          ${u.avatar_url
            ? `<img src="${u.avatar_url}" alt="av" class="avatar-sm"/>`
            : `<div class="avatar-sm avatar-placeholder">${(u.display_name || '?')[0].toUpperCase()}</div>`}
        </a>
        <div class="suggestion-info">
          <a href="/profile/${u.username}" class="suggestion-name">${escHtml(u.display_name)}</a>
          <div class="suggestion-username">@${u.username}</div>
        </div>
        <button class="btn-primary btn-sm" onclick="addFriend(${u.id}, this)">+</button>
      </div>`).join('');
    } else {
      container.innerHTML = '<p class="sidebar-empty">Aucune suggestion</p>';
    }
  } catch {
    container.innerHTML = '<p class="sidebar-empty">Erreur de chargement</p>';
  }
}

// ── Notifications count ──────────────────────────────────────────────────────
async function loadNotifCount() {
  try {
    const res = await fetch('/api/notifications/count');
    const data = await res.json();
    const badge = document.getElementById('notif-count');
    if (badge && data.count > 0) {
      badge.textContent = data.count > 9 ? '9+' : data.count;
      badge.classList.remove('hidden');
    }
  } catch {}
}

// ── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadSuggestions();
  loadNotifCount();
  // Rafraîchir le compteur de notifs toutes les 30s
  setInterval(loadNotifCount, 30000);
});
