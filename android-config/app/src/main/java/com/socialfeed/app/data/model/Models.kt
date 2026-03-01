// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  Modèles de données Firestore – SocialFeed                              ║
// ╚══════════════════════════════════════════════════════════════════════════╝

package com.socialfeed.app.data.model

import com.google.firebase.Timestamp
import com.google.firebase.firestore.DocumentId
import com.google.firebase.firestore.ServerTimestamp

// ────────────────────────────────────────────────────────────────────────────
//  USER – Collection Firestore : "users/{userId}"
// ────────────────────────────────────────────────────────────────────────────
data class User(
    @DocumentId
    val uid: String = "",
    val username: String = "",
    val displayName: String = "",
    val email: String = "",
    val bio: String = "",
    val avatarUrl: String = "",
    val coverUrl: String = "",
    val followersCount: Int = 0,
    val followingCount: Int = 0,
    val postsCount: Int = 0,
    val fcmToken: String = "",
    @ServerTimestamp
    val createdAt: Timestamp? = null,
    @ServerTimestamp
    val updatedAt: Timestamp? = null
)

// ────────────────────────────────────────────────────────────────────────────
//  POST – Collection Firestore : "posts/{postId}"
// ────────────────────────────────────────────────────────────────────────────
data class Post(
    @DocumentId
    val id: String = "",
    val userId: String = "",
    val username: String = "",
    val displayName: String = "",
    val userAvatarUrl: String = "",
    val content: String = "",
    val imageUrl: String = "",
    val likesCount: Int = 0,
    val commentsCount: Int = 0,
    val privacy: String = "public", // "public", "friends", "private"
    @ServerTimestamp
    val createdAt: Timestamp? = null,
    @ServerTimestamp
    val updatedAt: Timestamp? = null,
    // Champ virtuel (non stocké dans Firestore)
    var isLikedByCurrentUser: Boolean = false
)

// ────────────────────────────────────────────────────────────────────────────
//  COMMENT – Sous-collection Firestore : "posts/{postId}/comments/{commentId}"
// ────────────────────────────────────────────────────────────────────────────
data class Comment(
    @DocumentId
    val id: String = "",
    val postId: String = "",
    val userId: String = "",
    val username: String = "",
    val displayName: String = "",
    val userAvatarUrl: String = "",
    val content: String = "",
    @ServerTimestamp
    val createdAt: Timestamp? = null
)

// ────────────────────────────────────────────────────────────────────────────
//  NOTIFICATION – Collection Firestore : "notifications/{notifId}"
// ────────────────────────────────────────────────────────────────────────────
data class SocialNotification(
    @DocumentId
    val id: String = "",
    val userId: String = "",            // Destinataire
    val actorId: String = "",           // Auteur de l'action
    val actorName: String = "",
    val actorAvatarUrl: String = "",
    val type: NotificationType = NotificationType.LIKE,
    val postId: String = "",
    val commentId: String = "",
    val isRead: Boolean = false,
    @ServerTimestamp
    val createdAt: Timestamp? = null
)

enum class NotificationType { LIKE, COMMENT, FRIEND_REQUEST, FRIEND_ACCEPT }

// ────────────────────────────────────────────────────────────────────────────
//  FRIENDSHIP – Collection Firestore : "friendships/{friendshipId}"
// ────────────────────────────────────────────────────────────────────────────
data class Friendship(
    @DocumentId
    val id: String = "",
    val requesterId: String = "",
    val addresseeId: String = "",
    val status: FriendshipStatus = FriendshipStatus.PENDING,
    @ServerTimestamp
    val createdAt: Timestamp? = null,
    @ServerTimestamp
    val updatedAt: Timestamp? = null
)

enum class FriendshipStatus { PENDING, ACCEPTED, REJECTED, BLOCKED }
