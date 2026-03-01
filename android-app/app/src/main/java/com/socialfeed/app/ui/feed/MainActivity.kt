package com.socialfeed.app.ui.feed

import android.content.Intent
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.activity.viewModels
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import androidx.lifecycle.viewModelScope
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.bumptech.glide.Glide
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Query
import com.socialfeed.app.databinding.ActivityMainBinding
import com.socialfeed.app.databinding.ItemPostBinding
import com.socialfeed.app.ui.auth.AuthActivity
import dagger.hilt.android.AndroidEntryPoint
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import javax.inject.Inject

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

// ── ViewModel Feed ────────────────────────────────────────────────────────────
@HiltViewModel
class FeedViewModel @Inject constructor(
    private val auth: FirebaseAuth,
    private val db: FirebaseFirestore
) : ViewModel() {

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
                val snapshot = db.collection("posts")
                    .orderBy("createdAt", Query.Direction.DESCENDING)
                    .limit(50)
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

                // Vérifier les likes de l'utilisateur courant
                val likedPosts = postList.map { post ->
                    val likeDoc = db.collection("posts")
                        .document(post.id)
                        .collection("likes")
                        .document(currentUserId)
                        .get().await()
                    post.copy(isLikedByMe = likeDoc.exists())
                }

                _posts.value = likedPosts
            } catch (e: Exception) {
                // Garder les posts actuels en cas d'erreur
            } finally {
                _loading.value = false
            }
        }
    }

    fun createPost(content: String, imageUrl: String = "", onDone: (Boolean) -> Unit) {
        viewModelScope.launch {
            try {
                val user = auth.currentUser ?: return@launch
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
                // Incrémenter postsCount
                db.collection("users").document(user.uid)
                    .update("postsCount", com.google.firebase.firestore.FieldValue.increment(1))
                    .await()
                loadPosts()
                onDone(true)
            } catch (e: Exception) {
                onDone(false)
            }
        }
    }

    fun toggleLike(postId: String) {
        viewModelScope.launch {
            try {
                val uid = currentUserId
                val likeRef = db.collection("posts").document(postId)
                    .collection("likes").document(uid)
                val postRef = db.collection("posts").document(postId)
                val likeDoc = likeRef.get().await()

                if (likeDoc.exists()) {
                    likeRef.delete().await()
                    postRef.update("likesCount",
                        com.google.firebase.firestore.FieldValue.increment(-1)).await()
                } else {
                    likeRef.set(mapOf(
                        "userId" to uid,
                        "timestamp" to com.google.firebase.Timestamp.now()
                    )).await()
                    postRef.update("likesCount",
                        com.google.firebase.firestore.FieldValue.increment(1)).await()
                }
                loadPosts()
            } catch (e: Exception) {}
        }
    }

    fun deletePost(postId: String, onDone: () -> Unit) {
        viewModelScope.launch {
            try {
                db.collection("posts").document(postId).delete().await()
                loadPosts()
                onDone()
            } catch (e: Exception) {}
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

        b.tvDisplayName.text = post.displayName
        b.tvUsername.text = "@${post.username}"
        b.tvContent.text = post.content
        b.tvLikesCount.text = "${post.likesCount} J'aime"
        b.tvCommentsCount.text = "${post.commentsCount} commentaires"
        b.tvTime.text = post.createdAt?.toDate()?.let {
            android.text.format.DateUtils.getRelativeTimeSpanString(
                it.time, System.currentTimeMillis(),
                android.text.format.DateUtils.MINUTE_IN_MILLIS
            ).toString()
        } ?: "À l'instant"

        // Avatar
        if (post.userAvatarUrl.isNotEmpty()) {
            Glide.with(b.root).load(post.userAvatarUrl)
                .circleCrop().into(b.ivAvatar)
        } else {
            b.ivAvatar.setImageResource(com.socialfeed.app.R.drawable.ic_default_avatar)
        }

        // Image du post
        if (post.imageUrl.isNotEmpty()) {
            b.ivPostImage.visibility = View.VISIBLE
            Glide.with(b.root).load(post.imageUrl)
                .centerCrop().into(b.ivPostImage)
        } else {
            b.ivPostImage.visibility = View.GONE
        }

        // Bouton like
        b.btnLike.text = if (post.isLikedByMe) "❤️ J'aime" else "🤍 J'aime"
        b.btnLike.setOnClickListener { onLike(post) }

        // Bouton commenter
        b.btnComment.setOnClickListener { onComment(post) }

        // Supprimer (seulement pour l'auteur)
        b.btnDelete.visibility = if (post.userId == currentUserId) View.VISIBLE else View.GONE
        b.btnDelete.setOnClickListener { onDelete(post) }

        // Profil
        b.ivAvatar.setOnClickListener { onProfile(post) }
        b.tvDisplayName.setOnClickListener { onProfile(post) }
    }

    fun updatePosts(newPosts: List<Post>) {
        posts = newPosts
        notifyDataSetChanged()
    }
}

// ── MainActivity ──────────────────────────────────────────────────────────────
@AndroidEntryPoint
class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private val viewModel: FeedViewModel by viewModels()
    private lateinit var adapter: PostAdapter

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)
        setupRecyclerView()
        setupCreatePost()
        setupBottomNav()
        observeData()
    }

    private fun setupRecyclerView() {
        adapter = PostAdapter(
            posts = emptyList(),
            currentUserId = viewModel.currentUserId,
            onLike = { post -> viewModel.toggleLike(post.id) },
            onComment = { post -> showCommentDialog(post) },
            onDelete = { post ->
                viewModel.deletePost(post.id) {
                    Toast.makeText(this, "Publication supprimée", Toast.LENGTH_SHORT).show()
                }
            },
            onProfile = { post ->
                // TODO: ouvrir profil
                Toast.makeText(this, "@${post.username}", Toast.LENGTH_SHORT).show()
            }
        )
        binding.rvFeed.layoutManager = LinearLayoutManager(this)
        binding.rvFeed.adapter = adapter

        // Pull to refresh
        binding.swipeRefresh.setOnRefreshListener {
            viewModel.loadPosts()
        }
    }

    private fun setupCreatePost() {
        binding.btnCreatePost.setOnClickListener {
            showCreatePostDialog()
        }
        binding.etCreatePostHint.setOnClickListener {
            showCreatePostDialog()
        }
    }

    private fun setupBottomNav() {
        binding.btnNavFeed.setOnClickListener { /* déjà ici */ }
        binding.btnNavNotifications.setOnClickListener {
            Toast.makeText(this, "Notifications", Toast.LENGTH_SHORT).show()
        }
        binding.btnNavProfile.setOnClickListener {
            Toast.makeText(this, "Profil", Toast.LENGTH_SHORT).show()
        }
        binding.btnNavLogout.setOnClickListener {
            viewModel.logout()
            startActivity(Intent(this, AuthActivity::class.java))
            finish()
        }
    }

    private fun observeData() {
        // Observer les posts
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

        // Observer le loading
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
        val dialog = android.app.AlertDialog.Builder(this)
        val input = android.widget.EditText(this).apply {
            hint = "Quoi de neuf ?"
            setPadding(48, 32, 48, 32)
            maxLines = 6
            inputType = android.text.InputType.TYPE_CLASS_TEXT or
                    android.text.InputType.TYPE_TEXT_FLAG_MULTI_LINE
        }
        dialog.setTitle("Créer une publication")
        dialog.setView(input)
        dialog.setPositiveButton("Publier") { _, _ ->
            val content = input.text.toString().trim()
            if (content.isNotEmpty()) {
                viewModel.createPost(content) { success ->
                    if (success)
                        Toast.makeText(this, "✅ Publié !", Toast.LENGTH_SHORT).show()
                    else
                        Toast.makeText(this, "❌ Erreur", Toast.LENGTH_SHORT).show()
                }
            }
        }
        dialog.setNegativeButton("Annuler", null)
        dialog.show()
    }

    private fun showCommentDialog(post: Post) {
        val dialog = android.app.AlertDialog.Builder(this)
        val input = android.widget.EditText(this).apply {
            hint = "Écrire un commentaire…"
            setPadding(48, 32, 48, 32)
        }
        dialog.setTitle("Commenter")
        dialog.setView(input)
        dialog.setPositiveButton("Envoyer") { _, _ ->
            val content = input.text.toString().trim()
            if (content.isNotEmpty()) {
                addComment(post.id, content)
            }
        }
        dialog.setNegativeButton("Annuler", null)
        dialog.show()
    }

    private fun addComment(postId: String, content: String) {
        val auth = com.google.firebase.auth.FirebaseAuth.getInstance()
        val db = FirebaseFirestore.getInstance()
        val uid = auth.currentUser?.uid ?: return

        lifecycleScope.launch {
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
                    .update("commentsCount",
                        com.google.firebase.firestore.FieldValue.increment(1)).await()
                viewModel.loadPosts()
                Toast.makeText(this@MainActivity, "💬 Commentaire ajouté", Toast.LENGTH_SHORT).show()
            } catch (e: Exception) {
                Toast.makeText(this@MainActivity, "Erreur", Toast.LENGTH_SHORT).show()
            }
        }
    }

}
