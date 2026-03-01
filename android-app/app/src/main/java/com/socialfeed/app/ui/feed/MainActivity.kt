package com.socialfeed.app.ui.feed

import android.content.Intent
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import androidx.lifecycle.viewModelScope
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.bumptech.glide.Glide
import com.bumptech.glide.load.engine.DiskCacheStrategy
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Query
import com.socialfeed.app.databinding.ActivityMainBinding
import com.socialfeed.app.databinding.ItemPostBinding
import com.socialfeed.app.ui.auth.AuthActivity
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await

// ── Modèle Post ───────────────────────────────────────────────────────────────
data class Post(
    val id: String = "",
    val userId: String = "",
    val username: String = "",
    val displayName: String = "",
    val userAvatarUrl: String = "",
    val content: String = "",
    val imageUrl: String = "",
    var likesCount: Int = 0,
    var commentsCount: Int = 0,
    var isLikedByMe: Boolean = false,
    val createdAt: com.google.firebase.Timestamp? = null
)

// ── DiffUtil ──────────────────────────────────────────────────────────────────
class PostDiffCallback(
    private val oldList: List<Post>,
    private val newList: List<Post>
) : DiffUtil.Callback() {
    override fun getOldListSize() = oldList.size
    override fun getNewListSize() = newList.size
    override fun areItemsTheSame(o: Int, n: Int) = oldList[o].id == newList[n].id
    override fun areContentsTheSame(o: Int, n: Int): Boolean {
        val old = oldList[o]; val new = newList[n]
        return old.content == new.content &&
                old.likesCount == new.likesCount &&
                old.commentsCount == new.commentsCount &&
                old.isLikedByMe == new.isLikedByMe
    }
}

// ── ViewModel Feed (sans Hilt) ────────────────────────────────────────────────
class FeedViewModel : ViewModel() {

    private val auth = FirebaseAuth.getInstance()
    private val db = FirebaseFirestore.getInstance()

    private val _posts = MutableStateFlow<List<Post>>(emptyList())
    val posts: StateFlow<List<Post>> = _posts

    private val _loading = MutableStateFlow(false)
    val loading: StateFlow<Boolean> = _loading

    val currentUserId get() = auth.currentUser?.uid ?: ""

    init { loadPosts() }

    fun loadPosts() {
        viewModelScope.launch {
            _loading.value = true
            try {
                val uid = currentUserId
                val snapshot = db.collection("posts")
                    .orderBy("createdAt", Query.Direction.DESCENDING)
                    .limit(30)
                    .get().await()

                val postList = snapshot.documents.mapNotNull { doc ->
                    try {
                        Post(
                            id = doc.id,
                            userId = doc.getString("userId") ?: "",
                            username = doc.getString("username") ?: "",
                            displayName = doc.getString("displayName") ?: "",
                            userAvatarUrl = doc.getString("userAvatarUrl") ?: "",
                            content = doc.getString("content") ?: "",
                            imageUrl = doc.getString("imageUrl") ?: "",
                            likesCount = (doc.getLong("likesCount") ?: 0).toInt(),
                            commentsCount = (doc.getLong("commentsCount") ?: 0).toInt(),
                            createdAt = doc.getTimestamp("createdAt")
                        )
                    } catch (e: Exception) { null }
                }

                // Charger les likes en une seule requête
                val likedPostIds = if (uid.isNotEmpty()) {
                    try {
                        db.collection("userLikes").document(uid)
                            .collection("likedPosts")
                            .get().await()
                            .documents.map { it.id }.toSet()
                    } catch (e: Exception) { emptySet() }
                } else emptySet<String>()

                _posts.value = postList.map { it.copy(isLikedByMe = it.id in likedPostIds) }

            } catch (e: Exception) {
                // Ne pas crasher — garder l'état actuel
            } finally {
                _loading.value = false
            }
        }
    }

    fun createPost(content: String, imageUrl: String = "", onDone: (Boolean) -> Unit) {
        viewModelScope.launch {
            try {
                val user = auth.currentUser ?: run { onDone(false); return@launch }
                val userDoc = db.collection("users").document(user.uid).get().await()
                db.collection("posts").add(
                    mapOf(
                        "userId" to user.uid,
                        "username" to (userDoc.getString("username") ?: ""),
                        "displayName" to (userDoc.getString("displayName") ?: user.displayName ?: ""),
                        "userAvatarUrl" to (userDoc.getString("avatarUrl") ?: ""),
                        "content" to content,
                        "imageUrl" to imageUrl,
                        "likesCount" to 0,
                        "commentsCount" to 0,
                        "createdAt" to com.google.firebase.Timestamp.now()
                    )
                ).await()
                db.collection("users").document(user.uid)
                    .update("postsCount", com.google.firebase.firestore.FieldValue.increment(1))
                loadPosts()
                onDone(true)
            } catch (e: Exception) {
                onDone(false)
            }
        }
    }

    fun toggleLike(post: Post) {
        viewModelScope.launch {
            val uid = currentUserId
            if (uid.isEmpty()) return@launch
            try {
                // Mise à jour optimiste locale immédiate
                val currentPosts = _posts.value.toMutableList()
                val idx = currentPosts.indexOfFirst { it.id == post.id }
                if (idx >= 0) {
                    currentPosts[idx] = currentPosts[idx].copy(
                        isLikedByMe = !post.isLikedByMe,
                        likesCount = if (post.isLikedByMe) post.likesCount - 1 else post.likesCount + 1
                    )
                    _posts.value = currentPosts.toList()
                }

                val likeRef = db.collection("userLikes").document(uid)
                    .collection("likedPosts").document(post.id)
                val postRef = db.collection("posts").document(post.id)

                if (post.isLikedByMe) {
                    likeRef.delete()
                    postRef.update("likesCount", com.google.firebase.firestore.FieldValue.increment(-1))
                } else {
                    likeRef.set(mapOf("timestamp" to com.google.firebase.Timestamp.now()))
                    postRef.update("likesCount", com.google.firebase.firestore.FieldValue.increment(1))
                }
            } catch (e: Exception) {
                loadPosts()
            }
        }
    }

    fun deletePost(postId: String, onDone: () -> Unit) {
        viewModelScope.launch {
            try {
                db.collection("posts").document(postId).delete().await()
                _posts.value = _posts.value.filter { it.id != postId }
                onDone()
            } catch (e: Exception) {
                onDone()
            }
        }
    }

    fun addComment(postId: String, content: String, onDone: (Boolean) -> Unit) {
        viewModelScope.launch {
            val uid = currentUserId
            if (uid.isEmpty()) { onDone(false); return@launch }
            try {
                val userDoc = db.collection("users").document(uid).get().await()
                db.collection("posts").document(postId)
                    .collection("comments").add(
                        mapOf(
                            "userId" to uid,
                            "username" to (userDoc.getString("username") ?: ""),
                            "displayName" to (userDoc.getString("displayName") ?: ""),
                            "userAvatarUrl" to (userDoc.getString("avatarUrl") ?: ""),
                            "content" to content,
                            "createdAt" to com.google.firebase.Timestamp.now()
                        )
                    ).await()
                db.collection("posts").document(postId)
                    .update("commentsCount", com.google.firebase.firestore.FieldValue.increment(1))
                // Mise à jour locale
                val currentPosts = _posts.value.toMutableList()
                val idx = currentPosts.indexOfFirst { it.id == postId }
                if (idx >= 0) {
                    currentPosts[idx] = currentPosts[idx].copy(
                        commentsCount = currentPosts[idx].commentsCount + 1
                    )
                    _posts.value = currentPosts.toList()
                }
                onDone(true)
            } catch (e: Exception) {
                onDone(false)
            }
        }
    }

    fun logout() { auth.signOut() }
}

// ── Adapter RecyclerView ──────────────────────────────────────────────────────
class PostAdapter(
    private var posts: List<Post>,
    private val currentUserId: String,
    private val onLike: (Post) -> Unit,
    private val onComment: (Post) -> Unit,
    private val onDelete: (Post) -> Unit,
    private val onProfile: (Post) -> Unit
) : RecyclerView.Adapter<PostAdapter.PostViewHolder>() {

    inner class PostViewHolder(val binding: ItemPostBinding) :
        RecyclerView.ViewHolder(binding.root)

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): PostViewHolder {
        val binding = ItemPostBinding.inflate(
            LayoutInflater.from(parent.context), parent, false
        )
        return PostViewHolder(binding)
    }

    override fun getItemCount() = posts.size

    override fun onBindViewHolder(holder: PostViewHolder, position: Int) {
        val post = posts[position]
        val b = holder.binding

        b.tvDisplayName.text = post.displayName.ifEmpty { "Utilisateur" }
        b.tvUsername.text = if (post.username.isNotEmpty()) "@${post.username}" else ""
        b.tvContent.text = post.content
        b.tvLikesCount.text = "${post.likesCount} J'aime"
        b.tvCommentsCount.text = "${post.commentsCount} commentaires"
        b.tvTime.text = post.createdAt?.toDate()?.let {
            android.text.format.DateUtils.getRelativeTimeSpanString(
                it.time, System.currentTimeMillis(),
                android.text.format.DateUtils.MINUTE_IN_MILLIS
            ).toString()
        } ?: "À l'instant"

        if (post.userAvatarUrl.isNotEmpty()) {
            Glide.with(b.root)
                .load(post.userAvatarUrl)
                .diskCacheStrategy(DiskCacheStrategy.ALL)
                .circleCrop()
                .placeholder(com.socialfeed.app.R.drawable.ic_default_avatar)
                .error(com.socialfeed.app.R.drawable.ic_default_avatar)
                .into(b.ivAvatar)
        } else {
            b.ivAvatar.setImageResource(com.socialfeed.app.R.drawable.ic_default_avatar)
        }

        if (post.imageUrl.isNotEmpty()) {
            b.ivPostImage.visibility = View.VISIBLE
            Glide.with(b.root)
                .load(post.imageUrl)
                .diskCacheStrategy(DiskCacheStrategy.ALL)
                .centerCrop()
                .into(b.ivPostImage)
        } else {
            b.ivPostImage.visibility = View.GONE
        }

        b.btnLike.text = if (post.isLikedByMe) "❤️ J'aime" else "🤍 J'aime"
        b.btnLike.setOnClickListener { onLike(post) }
        b.btnComment.setOnClickListener { onComment(post) }
        b.btnDelete.visibility = if (post.userId == currentUserId) View.VISIBLE else View.GONE
        b.btnDelete.setOnClickListener { onDelete(post) }
        b.ivAvatar.setOnClickListener { onProfile(post) }
        b.tvDisplayName.setOnClickListener { onProfile(post) }
    }

    fun updatePosts(newPosts: List<Post>) {
        val diff = DiffUtil.calculateDiff(PostDiffCallback(posts, newPosts))
        posts = newPosts
        diff.dispatchUpdatesTo(this)
    }
}

// ── MainActivity (sans Hilt) ──────────────────────────────────────────────────
class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private lateinit var viewModel: FeedViewModel
    private lateinit var adapter: PostAdapter

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        // Créer le ViewModel sans Hilt
        viewModel = ViewModelProvider(this)[FeedViewModel::class.java]

        setupRecyclerView()
        setupCreatePost()
        setupBottomNav()
        observeData()
    }

    private fun setupRecyclerView() {
        adapter = PostAdapter(
            posts = emptyList(),
            currentUserId = viewModel.currentUserId,
            onLike = { post -> viewModel.toggleLike(post) },
            onComment = { post -> showCommentDialog(post) },
            onDelete = { post ->
                viewModel.deletePost(post.id) {
                    Toast.makeText(this, "Publication supprimée", Toast.LENGTH_SHORT).show()
                }
            },
            onProfile = { post ->
                Toast.makeText(this, "@${post.username}", Toast.LENGTH_SHORT).show()
            }
        )
        binding.rvFeed.layoutManager = LinearLayoutManager(this)
        binding.rvFeed.adapter = adapter
        binding.rvFeed.setHasFixedSize(false)
        binding.rvFeed.recycledViewPool.setMaxRecycledViews(0, 10)

        binding.swipeRefresh.setOnRefreshListener {
            viewModel.loadPosts()
        }
    }

    private fun setupCreatePost() {
        binding.btnCreatePost.setOnClickListener { showCreatePostDialog() }
        binding.etCreatePostHint.setOnClickListener { showCreatePostDialog() }
    }

    private fun setupBottomNav() {
        binding.btnNavFeed.setOnClickListener { /* déjà ici */ }
        binding.btnNavNotifications.setOnClickListener {
            Toast.makeText(this, "Notifications à venir", Toast.LENGTH_SHORT).show()
        }
        binding.btnNavProfile.setOnClickListener {
            Toast.makeText(this, "Profil à venir", Toast.LENGTH_SHORT).show()
        }
        binding.btnNavLogout.setOnClickListener {
            viewModel.logout()
            startActivity(Intent(this, AuthActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
            })
            finish()
        }
    }

    private fun observeData() {
        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                viewModel.posts.collect { posts ->
                    adapter.updatePosts(posts)
                    binding.swipeRefresh.isRefreshing = false
                    binding.tvEmptyFeed.visibility =
                        if (posts.isEmpty()) View.VISIBLE else View.GONE
                }
            }
        }

        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                viewModel.loading.collect { loading ->
                    binding.progressBar.visibility =
                        if (loading) View.VISIBLE else View.GONE
                }
            }
        }
    }

    private fun showCreatePostDialog() {
        val input = android.widget.EditText(this).apply {
            hint = "Quoi de neuf ?"
            setPadding(48, 32, 48, 32)
            maxLines = 6
            inputType = android.text.InputType.TYPE_CLASS_TEXT or
                    android.text.InputType.TYPE_TEXT_FLAG_MULTI_LINE
        }
        android.app.AlertDialog.Builder(this)
            .setTitle("Créer une publication")
            .setView(input)
            .setPositiveButton("Publier") { _, _ ->
                val content = input.text.toString().trim()
                if (content.isNotEmpty()) {
                    viewModel.createPost(content) { success ->
                        runOnUiThread {
                            if (success)
                                Toast.makeText(this, "✅ Publié !", Toast.LENGTH_SHORT).show()
                            else
                                Toast.makeText(this, "❌ Erreur de connexion", Toast.LENGTH_SHORT).show()
                        }
                    }
                }
            }
            .setNegativeButton("Annuler", null)
            .show()
    }

    private fun showCommentDialog(post: Post) {
        val input = android.widget.EditText(this).apply {
            hint = "Écrire un commentaire…"
            setPadding(48, 32, 48, 32)
        }
        android.app.AlertDialog.Builder(this)
            .setTitle("Commenter")
            .setView(input)
            .setPositiveButton("Envoyer") { _, _ ->
                val content = input.text.toString().trim()
                if (content.isNotEmpty()) {
                    viewModel.addComment(post.id, content) { success ->
                        runOnUiThread {
                            if (success)
                                Toast.makeText(this, "💬 Commentaire ajouté", Toast.LENGTH_SHORT).show()
                            else
                                Toast.makeText(this, "Erreur réseau", Toast.LENGTH_SHORT).show()
                        }
                    }
                }
            }
            .setNegativeButton("Annuler", null)
            .show()
    }
}
