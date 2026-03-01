package com.socialfeed.app.ui.auth

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.Toast
import androidx.activity.viewModels
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.socialfeed.app.databinding.ActivityAuthBinding
import com.socialfeed.app.ui.feed.MainActivity
import dagger.hilt.android.AndroidEntryPoint
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import javax.inject.Inject

// ── ViewModel Auth ────────────────────────────────────────────────────────────
@HiltViewModel
class AuthViewModel @Inject constructor(
    private val auth: FirebaseAuth,
    private val db: FirebaseFirestore
) : ViewModel() {

    val isLoggedIn get() = auth.currentUser != null

    fun login(email: String, password: String, onResult: (Boolean, String) -> Unit) {
        viewModelScope.launch {
            try {
                auth.signInWithEmailAndPassword(email, password).await()
                onResult(true, "")
            } catch (e: Exception) {
                val msg = when {
                    e.message?.contains("no user record") == true -> "Email introuvable"
                    e.message?.contains("password is invalid") == true -> "Mot de passe incorrect"
                    e.message?.contains("network") == true -> "Pas de connexion internet"
                    else -> "Erreur de connexion"
                }
                onResult(false, msg)
            }
        }
    }

    fun register(
        email: String,
        password: String,
        displayName: String,
        username: String,
        onResult: (Boolean, String) -> Unit
    ) {
        viewModelScope.launch {
            try {
                // Vérifier username unique
                val existing = db.collection("users")
                    .whereEqualTo("username", username.lowercase())
                    .get().await()
                if (!existing.isEmpty) {
                    onResult(false, "Ce nom d'utilisateur est déjà pris")
                    return@launch
                }
                // Créer le compte
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
                onResult(true, "")
            } catch (e: Exception) {
                val msg = when {
                    e.message?.contains("email address is already") == true -> "Cet email est déjà utilisé"
                    e.message?.contains("network") == true -> "Pas de connexion internet"
                    e.message?.contains("weak-password") == true -> "Mot de passe trop court (6 min)"
                    else -> "Erreur lors de l'inscription"
                }
                onResult(false, msg)
            }
        }
    }

    fun resetPassword(email: String, onResult: (Boolean) -> Unit) {
        viewModelScope.launch {
            try {
                auth.sendPasswordResetEmail(email).await()
                onResult(true)
            } catch (e: Exception) {
                onResult(false)
            }
        }
    }
}

// ── Activity Auth ─────────────────────────────────────────────────────────────
@AndroidEntryPoint
class AuthActivity : AppCompatActivity() {

    private lateinit var binding: ActivityAuthBinding
    private val viewModel: AuthViewModel by viewModels()
    private var isLoginMode = true

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Déjà connecté → aller au feed
        if (viewModel.isLoggedIn) {
            goToFeed()
            return
        }

        binding = ActivityAuthBinding.inflate(layoutInflater)
        setContentView(binding.root)
        setupUI()
    }

    private fun setupUI() {
        updateMode()

        // Toggle Login / Register
        binding.btnToggleMode.setOnClickListener {
            isLoginMode = !isLoginMode
            updateMode()
        }

        // Bouton principal
        binding.btnSubmit.setOnClickListener {
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

        // Mot de passe oublié
        binding.tvForgotPassword.setOnClickListener {
            val email = binding.etEmail.text.toString().trim()
            if (email.isEmpty()) {
                showError("Entrez votre email d'abord")
                return@setOnClickListener
            }
            viewModel.resetPassword(email) { success ->
                if (success) showSuccess("Email de réinitialisation envoyé !")
                else showError("Email introuvable")
            }
        }
    }

    private fun doLogin(email: String, password: String) {
        setLoading(true)
        viewModel.login(email, password) { success, error ->
            setLoading(false)
            if (success) goToFeed()
            else showError(error)
        }
    }

    private fun doRegister(email: String, password: String, displayName: String, username: String) {
        setLoading(true)
        viewModel.register(email, password, displayName, username) { success, error ->
            setLoading(false)
            if (success) goToFeed()
            else showError(error)
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
        binding.btnSubmit.isEnabled = !loading
        binding.progressBar.visibility = if (loading) View.VISIBLE else View.GONE
        binding.btnSubmit.text = if (loading) "Chargement..." else if (isLoginMode) "Se connecter" else "Créer mon compte"
    }

    private fun showError(msg: String) {
        binding.tvError.text = msg
        binding.tvError.visibility = View.VISIBLE
    }

    private fun showSuccess(msg: String) {
        Toast.makeText(this, msg, Toast.LENGTH_LONG).show()
    }

    private fun goToFeed() {
        startActivity(Intent(this, MainActivity::class.java))
        finish()
    }
}
