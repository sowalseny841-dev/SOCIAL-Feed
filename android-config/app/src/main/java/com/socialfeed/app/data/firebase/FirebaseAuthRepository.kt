// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  FirebaseAuthRepository.kt                                              ║
// ║  Inscription, connexion, déconnexion via Firebase Auth                  ║
// ╚══════════════════════════════════════════════════════════════════════════╝

package com.socialfeed.app.data.firebase

import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseUser
import com.google.firebase.auth.GoogleAuthProvider
import com.google.firebase.auth.UserProfileChangeRequest
import com.google.firebase.firestore.FirebaseFirestore
import com.socialfeed.app.data.model.User
import kotlinx.coroutines.tasks.await
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class FirebaseAuthRepository @Inject constructor(
    private val auth: FirebaseAuth,
    private val firestore: FirebaseFirestore
) {
    private val usersCollection = firestore.collection("users")

    val currentUser: FirebaseUser? get() = auth.currentUser
    val isLoggedIn: Boolean get() = auth.currentUser != null

    // ── Inscription Email / Mot de passe ──────────────────────────────────
    suspend fun register(
        email: String,
        password: String,
        displayName: String,
        username: String
    ): Result<FirebaseUser> = runCatching {

        // Vérifier que le username n'est pas déjà pris
        val existingUser = usersCollection
            .whereEqualTo("username", username.lowercase())
            .get().await()

        if (!existingUser.isEmpty) {
            throw Exception("Ce nom d'utilisateur est déjà pris")
        }

        // Créer le compte Firebase Auth
        val authResult = auth.createUserWithEmailAndPassword(email, password).await()
        val firebaseUser = authResult.user
            ?: throw Exception("Erreur lors de la création du compte")

        // Mettre à jour le displayName dans Firebase Auth
        val profileUpdates = UserProfileChangeRequest.Builder()
            .setDisplayName(displayName)
            .build()
        firebaseUser.updateProfile(profileUpdates).await()

        // Créer le document utilisateur dans Firestore
        val user = User(
            uid = firebaseUser.uid,
            username = username.lowercase(),
            displayName = displayName,
            email = email.lowercase(),
            bio = "",
            avatarUrl = "",
            coverUrl = "",
            followersCount = 0,
            followingCount = 0,
            postsCount = 0
        )
        usersCollection.document(firebaseUser.uid).set(user).await()

        // Envoyer un email de vérification
        firebaseUser.sendEmailVerification().await()

        firebaseUser
    }

    // ── Connexion Email / Mot de passe ────────────────────────────────────
    suspend fun login(email: String, password: String): Result<FirebaseUser> = runCatching {
        val authResult = auth.signInWithEmailAndPassword(email, password).await()
        authResult.user ?: throw Exception("Connexion échouée")
    }

    // ── Connexion Google Sign-In ───────────────────────────────────────────
    suspend fun loginWithGoogle(idToken: String): Result<FirebaseUser> = runCatching {
        val credential = GoogleAuthProvider.getCredential(idToken, null)
        val authResult = auth.signInWithCredential(credential).await()
        val firebaseUser = authResult.user
            ?: throw Exception("Connexion Google échouée")

        // Créer le profil Firestore si c'est la première connexion
        val userDoc = usersCollection.document(firebaseUser.uid).get().await()
        if (!userDoc.exists()) {
            val username = generateUsername(firebaseUser.displayName ?: "user")
            val user = User(
                uid = firebaseUser.uid,
                username = username,
                displayName = firebaseUser.displayName ?: "Utilisateur",
                email = firebaseUser.email ?: "",
                avatarUrl = firebaseUser.photoUrl?.toString() ?: ""
            )
            usersCollection.document(firebaseUser.uid).set(user).await()
        }

        firebaseUser
    }

    // ── Déconnexion ───────────────────────────────────────────────────────
    fun logout() {
        auth.signOut()
    }

    // ── Réinitialisation du mot de passe ──────────────────────────────────
    suspend fun resetPassword(email: String): Result<Unit> = runCatching {
        auth.sendPasswordResetEmail(email).await()
    }

    // ── Récupérer le profil utilisateur ───────────────────────────────────
    suspend fun getUserProfile(userId: String): Result<User> = runCatching {
        val doc = usersCollection.document(userId).get().await()
        doc.toObject(User::class.java) ?: throw Exception("Profil introuvable")
    }

    // ── Mettre à jour le profil ───────────────────────────────────────────
    suspend fun updateProfile(
        displayName: String,
        bio: String,
        avatarUrl: String = ""
    ): Result<Unit> = runCatching {
        val currentUser = auth.currentUser ?: throw Exception("Non connecté")
        val updates = mutableMapOf<String, Any>(
            "displayName" to displayName,
            "bio" to bio
        )
        if (avatarUrl.isNotBlank()) updates["avatarUrl"] = avatarUrl

        usersCollection.document(currentUser.uid).update(updates).await()

        // Synchroniser le displayName dans Firebase Auth
        val profileUpdates = UserProfileChangeRequest.Builder()
            .setDisplayName(displayName)
            .build()
        currentUser.updateProfile(profileUpdates).await()
    }

    // ── Helper : générer un username unique ───────────────────────────────
    private suspend fun generateUsername(displayName: String): String {
        val base = displayName.lowercase()
            .replace(" ", "_")
            .replace(Regex("[^a-z0-9_]"), "")
            .take(20)

        var username = base
        var counter = 1
        while (true) {
            val existing = usersCollection
                .whereEqualTo("username", username)
                .get().await()
            if (existing.isEmpty) break
            username = "${base}${counter++}"
        }
        return username
    }
}
