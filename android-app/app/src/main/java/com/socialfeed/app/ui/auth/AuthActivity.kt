package com.socialfeed.app.ui.auth

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.socialfeed.app.databinding.ActivityAuthBinding
import com.socialfeed.app.ui.feed.MainActivity
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await

class AuthActivity : AppCompatActivity() {

    private lateinit var binding: ActivityAuthBinding
    private val auth by lazy { FirebaseAuth.getInstance() }
    private val db by lazy { FirebaseFirestore.getInstance() }
    private var isLoginMode = true
    private var isLoading = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Déjà connecté → aller au feed
        if (auth.currentUser != null) {
            goToFeed()
            return
        }

        binding = ActivityAuthBinding.inflate(layoutInflater)
        setContentView(binding.root)
        setupUI()
    }

    private fun setupUI() {
        updateMode()

        binding.btnToggleMode.setOnClickListener {
            isLoginMode = !isLoginMode
            updateMode()
        }

        binding.btnSubmit.setOnClickListener {
            if (isLoading) return@setOnClickListener
            val email = binding.etEmail.text.toString().trim()
            val password = binding.etPassword.text.toString().trim()

            if (email.isEmpty() || password.isEmpty()) {
                showError("Veuillez remplir tous les champs")
                return@setOnClickListener
            }

            if (isLoginMode) {
                doLogin(email, password)
            } else {
                val displayName = binding.etDisplayName.text.toString().trim()
                val username = binding.etUsername.text.toString().trim()
                if (displayName.isEmpty() || username.isEmpty()) {
                    showError("Veuillez remplir tous les champs")
                    return@setOnClickListener
                }
                doRegister(email, password, displayName, username)
            }
        }

        binding.tvForgotPassword.setOnClickListener {
            val email = binding.etEmail.text.toString().trim()
            if (email.isEmpty()) {
                showError("Entrez votre email d'abord")
                return@setOnClickListener
            }
            lifecycleScope.launch {
                try {
                    auth.sendPasswordResetEmail(email).await()
                    Toast.makeText(this@AuthActivity, "Email de réinitialisation envoyé !", Toast.LENGTH_LONG).show()
                } catch (e: Exception) {
                    showError("Email introuvable")
                }
            }
        }
    }

    private fun doLogin(email: String, password: String) {
        setLoading(true)
        lifecycleScope.launch {
            try {
                auth.signInWithEmailAndPassword(email, password).await()
                setLoading(false)
                goToFeed()
            } catch (e: Exception) {
                setLoading(false)
                val msg = when {
                    e.message?.contains("no user record") == true -> "Email introuvable"
                    e.message?.contains("password is invalid") == true -> "Mot de passe incorrect"
                    e.message?.contains("network") == true -> "Pas de connexion internet"
                    e.message?.contains("INVALID_LOGIN_CREDENTIALS") == true -> "Email ou mot de passe incorrect"
                    else -> "Erreur de connexion"
                }
                showError(msg)
            }
        }
    }

    private fun doRegister(email: String, password: String, displayName: String, username: String) {
        setLoading(true)
        lifecycleScope.launch {
            try {
                // Vérifier username unique
                val existing = db.collection("users")
                    .whereEqualTo("username", username.lowercase())
                    .get().await()
                if (!existing.isEmpty) {
                    setLoading(false)
                    showError("Ce nom d'utilisateur est déjà pris")
                    return@launch
                }
                // Créer le compte Firebase Auth
                val result = auth.createUserWithEmailAndPassword(email, password).await()
                val uid = result.user!!.uid
                // Créer profil Firestore
                db.collection("users").document(uid).set(
                    mapOf(
                        "uid" to uid,
                        "username" to username.lowercase(),
                        "displayName" to displayName,
                        "email" to email.lowercase(),
                        "bio" to "",
                        "avatarUrl" to "",
                        "coverUrl" to "",
                        "postsCount" to 0,
                        "createdAt" to com.google.firebase.Timestamp.now()
                    )
                ).await()
                setLoading(false)
                goToFeed()
            } catch (e: Exception) {
                setLoading(false)
                val msg = when {
                    e.message?.contains("email address is already") == true -> "Cet email est déjà utilisé"
                    e.message?.contains("network") == true -> "Pas de connexion internet"
                    e.message?.contains("weak-password") == true -> "Mot de passe trop court (6 min)"
                    else -> "Erreur lors de l'inscription"
                }
                showError(msg)
            }
        }
    }

    private fun updateMode() {
        if (isLoginMode) {
            binding.tvTitle.text = "Connexion"
            binding.tvSubtitle.text = "Connectez-vous à votre compte"
            binding.layoutRegisterFields.visibility = View.GONE
            binding.btnSubmit.text = "Se connecter"
            binding.btnToggleMode.text = "Créer un nouveau compte"
            binding.tvForgotPassword.visibility = View.VISIBLE
        } else {
            binding.tvTitle.text = "Inscription"
            binding.tvSubtitle.text = "Rejoignez la communauté"
            binding.layoutRegisterFields.visibility = View.VISIBLE
            binding.btnSubmit.text = "Créer mon compte"
            binding.btnToggleMode.text = "Déjà un compte ? Se connecter"
            binding.tvForgotPassword.visibility = View.GONE
        }
        binding.tvError.visibility = View.GONE
    }

    private fun setLoading(loading: Boolean) {
        isLoading = loading
        binding.btnSubmit.isEnabled = !loading
        binding.progressBar.visibility = if (loading) View.VISIBLE else View.GONE
        binding.btnSubmit.text = if (loading) "Chargement..." else if (isLoginMode) "Se connecter" else "Créer mon compte"
    }

    private fun showError(msg: String) {
        binding.tvError.text = msg
        binding.tvError.visibility = View.VISIBLE
    }

    private fun goToFeed() {
        startActivity(Intent(this, MainActivity::class.java))
        finish()
    }
}
