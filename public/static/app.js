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

// ═══════════════════════════════════════════════════
// MESSAGERIE
// ═══════════════════════════════════════════════════

let currentConvId = null;
let lastMsgTime = new Date().toISOString();
let pollInterval = null;

async function sendMessage(e, convId, targetUsername) {
  e.preventDefault();
  const input = document.getElementById('msg-input');
  const content = input.value.trim();
  if (!content) return;
  input.value = '';

  try {
    const res = await fetch(`/api/messages/${convId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content })
    });
    const msg = await res.json();
    appendMessage(msg, true);
    lastMsgTime = msg.created_at;
    scrollToBottom();
  } catch (err) {
    console.error('Erreur envoi message:', err);
  }
}

function appendMessage(msg, isMine) {
  const container = document.getElementById('chat-messages');
  if (!container) return;
  const div = document.createElement('div');
  div.className = `msg-row ${isMine ? 'msg-mine' : 'msg-theirs'}`;
  div.innerHTML = `
    <div class="msg-bubble-wrap">
      <div class="msg-bubble">${escapeHtmlJs(msg.content)}</div>
      <span class="msg-time">maintenant</span>
    </div>`;
  container.appendChild(div);
}

function escapeHtmlJs(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br/>');
}

function scrollToBottom() {
  const cm = document.getElementById('chat-messages');
  if (cm) cm.scrollTop = cm.scrollHeight;
}

// Polling pour nouveaux messages
function startMessagePolling(convId, myId) {
  clearInterval(pollInterval);
  pollInterval = setInterval(async () => {
    try {
      const res = await fetch(`/api/messages/${convId}/poll?since=${encodeURIComponent(lastMsgTime)}`);
      const data = await res.json();
      if (data.messages && data.messages.length > 0) {
        data.messages.forEach(msg => {
          if (msg.sender_id != myId) {
            appendMessage(msg, false);
            lastMsgTime = msg.created_at;
          }
        });
        scrollToBottom();
      }
    } catch {}
  }, 3000);
}

// Init polling si on est dans une conv
document.addEventListener('DOMContentLoaded', () => {
  const chatWin = document.getElementById('chat-window');
  if (chatWin) {
    const convIdEl = document.querySelector('[data-conv-id]');
    if (convIdEl) {
      const convId = convIdEl.dataset.convId;
      const myId = convIdEl.dataset.myId;
      startMessagePolling(convId, myId);
    }
    scrollToBottom();

    // Sur mobile : marquer comme ouvert
    document.querySelector('.messages-layout')?.classList.add('chat-open');
  }
});

// Filtre conversations
function filterConvs(query) {
  const items = document.querySelectorAll('.conv-item');
  items.forEach(item => {
    const name = item.querySelector('.conv-name')?.textContent?.toLowerCase() || '';
    item.style.display = name.includes(query.toLowerCase()) ? '' : 'none';
  });
}

// Emoji picker
function toggleEmojiPicker() {
  const picker = document.getElementById('emoji-picker');
  if (picker) picker.classList.toggle('hidden');
}

function insertEmoji(emoji) {
  const input = document.getElementById('msg-input');
  if (input) {
    const pos = input.selectionStart;
    input.value = input.value.slice(0, pos) + emoji + input.value.slice(pos);
    input.focus();
    input.setSelectionRange(pos + emoji.length, pos + emoji.length);
  }
  document.getElementById('emoji-picker')?.classList.add('hidden');
}

// Nouvelle conv : recherche utilisateur
async function searchUsers(query, resultsDivId) {
  if (query.length < 2) {
    document.getElementById(resultsDivId).innerHTML = '';
    return;
  }
  const res = await fetch(`/api/users/search?q=${encodeURIComponent(query)}`);
  const data = await res.json();
  const div = document.getElementById(resultsDivId);
  if (!div) return;
  div.innerHTML = data.users.map(u => `
    <a href="/messages/${u.username}" class="search-result-item">
      <div class="avatar-sm avatar-placeholder">${u.display_name[0].toUpperCase()}</div>
      <div>
        <div class="font-bold">${u.display_name}</div>
        <div class="text-secondary">@${u.username}</div>
      </div>
    </a>`).join('') || '<p class="empty-result">Aucun utilisateur trouvé</p>';
}

function openNewConvModal() {
  document.getElementById('new-conv-modal')?.classList.remove('hidden');
  document.getElementById('user-search-msg')?.focus();
}

function closeNewConvModal() {
  document.getElementById('new-conv-modal')?.classList.add('hidden');
}

// ═══════════════════════════════════════════════════
// APPELS AUDIO / VIDÉO
// ═══════════════════════════════════════════════════

function startCall(username, type, userId) {
  window.location.href = `/call/${username}?type=${type}`;
}

function sendVoiceNote() {
  alert('🎤 Note vocale : fonctionnalité disponible avec l\'abonnement Premium.');
}

// ═══════════════════════════════════════════════════
// MONÉTISATION : PREMIUM & PAIEMENT
// ═══════════════════════════════════════════════════

let selectedPlanId = null;
let selectedPlanName = '';
let selectedPlanPrice = 0;
let selectedProvider = '';

function subscribePlan(planId, planName, planPrice) {
  selectedPlanId = planId;
  selectedPlanName = planName;
  selectedPlanPrice = planPrice;

  const summary = document.getElementById('payment-summary');
  if (summary) {
    summary.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div>
          <strong>${planName}</strong><br/>
          <span style="color:var(--text-secondary);font-size:13px;">Abonnement mensuel</span>
        </div>
        <div style="font-size:22px;font-weight:800;color:var(--blue);">${planPrice.toLocaleString()} XOF</div>
      </div>`;
  }
  document.getElementById('payment-modal')?.classList.remove('hidden');
}

function closePaymentModal() {
  document.getElementById('payment-modal')?.classList.add('hidden');
  selectedProvider = '';
  document.querySelectorAll('.payment-method-btn').forEach(b => b.classList.remove('selected'));
  document.getElementById('payment-form-area')?.classList.add('hidden');
}

function selectPayment(provider) {
  selectedProvider = provider;
  document.querySelectorAll('.payment-method-btn').forEach(b => b.classList.remove('selected'));
  event.currentTarget.classList.add('selected');
  const form = document.getElementById('payment-form-area');
  if (form) {
    form.classList.remove('hidden');
    const placeholders = {
      orange_money: 'Numéro Orange Money (ex: 77 XXX XX XX)',
      wave: 'Numéro Wave (ex: 70 XXX XX XX)',
      mtn: 'Numéro MTN Mobile Money',
      free_money: 'Numéro Free Money'
    };
    const input = document.getElementById('payment-phone');
    if (input) input.placeholder = placeholders[provider] || 'Numéro de téléphone';
  }
}

async function confirmPayment() {
  const phone = document.getElementById('payment-phone')?.value?.trim();
  if (!phone) { alert('Veuillez saisir votre numéro de téléphone.'); return; }
  if (!selectedProvider) { alert('Veuillez choisir une méthode de paiement.'); return; }

  const btn = event.currentTarget;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Traitement en cours…';
  btn.disabled = true;

  try {
    const res = await fetch('/api/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan_id: selectedPlanId, phone, provider: selectedProvider })
    });
    const data = await res.json();
    if (data.success) {
      closePaymentModal();
      showToast(`✅ ${data.message}`, 'success');
      setTimeout(() => location.reload(), 2000);
    } else {
      showToast('❌ ' + (data.error || 'Erreur de paiement'), 'error');
    }
  } catch {
    showToast('❌ Erreur réseau. Réessayez.', 'error');
  } finally {
    btn.innerHTML = '<i class="fas fa-lock"></i> Confirmer et payer';
    btn.disabled = false;
  }
}

// ═══════════════════════════════════════════════════
// MARKETPLACE
// ═══════════════════════════════════════════════════

function openSellModal() {
  document.getElementById('sell-modal')?.classList.remove('hidden');
}

function closeSellModal() {
  document.getElementById('sell-modal')?.classList.add('hidden');
}

async function createListing(e) {
  e.preventDefault();
  const form = e.target;
  const data = {
    title: form.title.value.trim(),
    description: form.description.value.trim(),
    price_xof: parseInt(form.price.value),
    category: form.category.value,
    condition: form.condition.value,
    location: form.location?.value?.trim() || '',
    image_url: form.image_url?.value?.trim() || ''
  };

  const btn = form.querySelector('button[type=submit]');
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Publication…';
  btn.disabled = true;

  const res = await fetch('/api/marketplace', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  const result = await res.json();
  if (result.success) {
    showToast('✅ Article mis en vente !', 'success');
    closeSellModal();
    setTimeout(() => location.reload(), 1500);
  } else {
    showToast('❌ ' + (result.error || 'Erreur'), 'error');
    btn.innerHTML = '<i class="fas fa-check"></i> Mettre en vente';
    btn.disabled = false;
  }
}

// ═══════════════════════════════════════════════════
// PUBLICITÉS
// ═══════════════════════════════════════════════════

async function createAd(e) {
  e.preventDefault();
  const form = e.target;
  const data = {
    title: form.title.value.trim(),
    description: form.description.value.trim(),
    target_url: form.target_url.value.trim(),
    image_url: form.image_url?.value?.trim() || '',
    budget: parseInt(form.budget.value),
    ad_type: form.ad_type.value
  };

  const btn = form.querySelector('button[type=submit]');
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Lancement…';
  btn.disabled = true;

  const res = await fetch('/api/ads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  const result = await res.json();
  if (result.success) {
    showToast('🚀 ' + result.message, 'success');
    setTimeout(() => location.href = '/premium', 2000);
  } else {
    showToast('❌ ' + (result.error || 'Erreur'), 'error');
    btn.innerHTML = '<i class="fas fa-rocket"></i> Lancer la publicité';
    btn.disabled = false;
  }
}

async function clickAd(adId) {
  const res = await fetch(`/api/ads/${adId}/click`, { method: 'POST' });
  const data = await res.json();
  if (data.redirect) window.open(data.redirect, '_blank');
}

// ═══════════════════════════════════════════════════
// TOAST NOTIFICATION
// ═══════════════════════════════════════════════════

function showToast(message, type = 'info') {
  const existing = document.querySelector('.toast-notification');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `toast-notification toast-${type}`;
  toast.innerHTML = message;
  toast.style.cssText = `
    position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%);
    background: ${type === 'success' ? '#42B72A' : type === 'error' ? '#e74c3c' : '#1877F2'};
    color: white; padding: 12px 24px; border-radius: 24px;
    font-size: 14px; font-weight: 600; z-index: 10000;
    box-shadow: 0 4px 16px rgba(0,0,0,0.2);
    animation: slideUp .3s ease;
  `;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

// Compter les messages non lus dans la navbar
async function updateMsgCount() {
  try {
    const res = await fetch('/api/notifications/count');
    // TODO: ajouter endpoint messages non lus
  } catch {}
}
