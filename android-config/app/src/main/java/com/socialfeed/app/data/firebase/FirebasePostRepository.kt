// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  FirebasePostRepository.kt                                              ║
// ║  Gère les publications dans Firestore + photos dans Firebase Storage    ║
// ╚══════════════════════════════════════════════════════════════════════════╝

package com.socialfeed.app.data.firebase

import android.net.Uri
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Query
import com.google.firebase.storage.FirebaseStorage
import com.socialfeed.app.data.model.Comment
import com.socialfeed.app.data.model.Post
import com.socialfeed.app.data.model.SocialNotification
import com.socialfeed.app.data.model.NotificationType
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class FirebasePostRepository @Inject constructor(
    private val firestore: FirebaseFirestore,
    private val auth: FirebaseAuth,
    private val storage: FirebaseStorage
) {

    private val postsCollection = firestore.collection("posts")
    private val usersCollection = firestore.collection("users")
    private val notifCollection = firestore.collection("notifications")

    // ── Créer une publication ─────────────────────────────────────────────
    suspend fun createPost(
        content: String,
        imageUri: Uri? = null,
        imageUrl: String = ""
    ): Result<Post> = runCatching {
        val currentUser = auth.currentUser
            ?: throw Exception("Utilisateur non connecté")

        // Récupérer le profil utilisateur
        val userDoc = usersCollection.document(currentUser.uid).get().await()
        val username = userDoc.getString("username") ?: ""
        val displayName = userDoc.getString("displayName") ?: currentUser.displayName ?: ""
        val avatarUrl = userDoc.getString("avatarUrl") ?: currentUser.photoUrl?.toString() ?: ""

        // Upload de l'image si fournie (URI local de la galerie)
        val finalImageUrl = when {
            imageUri != null -> uploadImage(imageUri, "posts")
            imageUrl.isNotBlank() -> imageUrl
            else -> ""
        }

        // Créer le document du post
        val post = Post(
            userId = currentUser.uid,
            username = username,
            displayName = displayName,
            userAvatarUrl = avatarUrl,
            content = content,
            imageUrl = finalImageUrl,
            likesCount = 0,
            commentsCount = 0
        )

        val docRef = postsCollection.add(post).await()

        // Incrémenter le compteur de posts du user
        usersCollection.document(currentUser.uid)
            .update("postsCount", FieldValue.increment(1)).await()

        post.copy(id = docRef.id)
    }

    // ── Récupérer le feed (temps réel) ────────────────────────────────────
    fun getFeedFlow(): Flow<List<Post>> = callbackFlow {
        val currentUser = auth.currentUser ?: run {
            close()
            return@callbackFlow
        }

        val listener = postsCollection
            .orderBy("createdAt", Query.Direction.DESCENDING)
            .limit(50)
            .addSnapshotListener { snapshot, error ->
                if (error != null) {
                    close(error)
                    return@addSnapshotListener
                }
                val posts = snapshot?.documents?.mapNotNull { doc ->
                    doc.toObject(Post::class.java)
                } ?: emptyList()
                trySend(posts)
            }

        awaitClose { listener.remove() }
    }

    // ── Vérifier les likes de l'utilisateur courant ───────────────────────
    suspend fun checkUserLikes(postIds: List<String>): Set<String> {
        val currentUser = auth.currentUser ?: return emptySet()
        return postIds.filter { postId ->
            val likeDoc = postsCollection
                .document(postId)
                .collection("likes")
                .document(currentUser.uid)
                .get().await()
            likeDoc.exists()
        }.toSet()
    }

    // ── Toggler un like ───────────────────────────────────────────────────
    suspend fun toggleLike(postId: String): Result<Boolean> = runCatching {
        val currentUser = auth.currentUser
            ?: throw Exception("Utilisateur non connecté")

        val likeRef = postsCollection
            .document(postId)
            .collection("likes")
            .document(currentUser.uid)

        val postRef = postsCollection.document(postId)

        val isLiked = firestore.runTransaction { transaction ->
            val likeDoc = transaction.get(likeRef)
            val postDoc = transaction.get(postRef)
            val ownerId = postDoc.getString("userId") ?: ""

            if (likeDoc.exists()) {
                // Retirer le like
                transaction.delete(likeRef)
                transaction.update(postRef, "likesCount", FieldValue.increment(-1))
                false
            } else {
                // Ajouter le like
                transaction.set(likeRef, mapOf(
                    "userId" to currentUser.uid,
                    "timestamp" to FieldValue.serverTimestamp()
                ))
                transaction.update(postRef, "likesCount", FieldValue.increment(1))

                // Créer une notification (si ce n'est pas son propre post)
                if (ownerId != currentUser.uid) {
                    val userDoc = usersCollection.document(currentUser.uid).get()
                    // Note : dans une vraie transaction, on lit avant d'écrire
                }
                true
            }
        }.await()

        // Envoyer une notification si like
        if (isLiked) {
            sendLikeNotification(postId)
        }

        isLiked
    }

    // ── Ajouter un commentaire ────────────────────────────────────────────
    suspend fun addComment(postId: String, content: String): Result<Comment> = runCatching {
        val currentUser = auth.currentUser
            ?: throw Exception("Utilisateur non connecté")

        val userDoc = usersCollection.document(currentUser.uid).get().await()
        val username = userDoc.getString("username") ?: ""
        val displayName = userDoc.getString("displayName") ?: currentUser.displayName ?: ""
        val avatarUrl = userDoc.getString("avatarUrl") ?: ""

        val comment = Comment(
            postId = postId,
            userId = currentUser.uid,
            username = username,
            displayName = displayName,
            userAvatarUrl = avatarUrl,
            content = content
        )

        val docRef = postsCollection
            .document(postId)
            .collection("comments")
            .add(comment).await()

        // Incrémenter le compteur de commentaires
        postsCollection.document(postId)
            .update("commentsCount", FieldValue.increment(1)).await()

        // Notifier l'auteur du post
        sendCommentNotification(postId, docRef.id)

        comment.copy(id = docRef.id)
    }

    // ── Récupérer les commentaires ────────────────────────────────────────
    suspend fun getComments(postId: String): List<Comment> {
        return postsCollection
            .document(postId)
            .collection("comments")
            .orderBy("createdAt", Query.Direction.ASCENDING)
            .get().await()
            .toObjects(Comment::class.java)
    }

    // ── Supprimer une publication ─────────────────────────────────────────
    suspend fun deletePost(postId: String): Result<Unit> = runCatching {
        val currentUser = auth.currentUser
            ?: throw Exception("Utilisateur non connecté")

        val postDoc = postsCollection.document(postId).get().await()
        if (postDoc.getString("userId") != currentUser.uid) {
            throw Exception("Non autorisé")
        }

        postsCollection.document(postId).delete().await()
        usersCollection.document(currentUser.uid)
            .update("postsCount", FieldValue.increment(-1)).await()
    }

    // ── Upload d'image vers Firebase Storage ──────────────────────────────
    private suspend fun uploadImage(uri: Uri, folder: String): String {
        val currentUser = auth.currentUser ?: throw Exception("Non connecté")
        val filename = "${currentUser.uid}_${System.currentTimeMillis()}.jpg"
        val ref = storage.reference.child("$folder/$filename")
        ref.putFile(uri).await()
        return ref.downloadUrl.await().toString()
    }

    // ── Notifications Firebase ────────────────────────────────────────────
    private suspend fun sendLikeNotification(postId: String) {
        try {
            val currentUser = auth.currentUser ?: return
            val postDoc = postsCollection.document(postId).get().await()
            val ownerId = postDoc.getString("userId") ?: return
            if (ownerId == currentUser.uid) return

            val userDoc = usersCollection.document(currentUser.uid).get().await()
            val notif = SocialNotification(
                userId = ownerId,
                actorId = currentUser.uid,
                actorName = userDoc.getString("displayName") ?: "",
                actorAvatarUrl = userDoc.getString("avatarUrl") ?: "",
                type = NotificationType.LIKE,
                postId = postId
            )
            notifCollection.add(notif).await()
        } catch (_: Exception) {}
    }

    private suspend fun sendCommentNotification(postId: String, commentId: String) {
        try {
            val currentUser = auth.currentUser ?: return
            val postDoc = postsCollection.document(postId).get().await()
            val ownerId = postDoc.getString("userId") ?: return
            if (ownerId == currentUser.uid) return

            val userDoc = usersCollection.document(currentUser.uid).get().await()
            val notif = SocialNotification(
                userId = ownerId,
                actorId = currentUser.uid,
                actorName = userDoc.getString("displayName") ?: "",
                actorAvatarUrl = userDoc.getString("avatarUrl") ?: "",
                type = NotificationType.COMMENT,
                postId = postId,
                commentId = commentId
            )
            notifCollection.add(notif).await()
        } catch (_: Exception) {}
    }
}
