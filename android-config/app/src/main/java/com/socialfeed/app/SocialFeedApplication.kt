// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  SOCIALFEED – SocialFeedApplication.kt                                  ║
// ║  Classe Application principale – initialisation Firebase + Hilt         ║
// ╚══════════════════════════════════════════════════════════════════════════╝

package com.socialfeed.app

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import androidx.hilt.work.HiltWorkerFactory
import androidx.work.Configuration
import com.google.firebase.FirebaseApp
import com.google.firebase.appcheck.FirebaseAppCheck
import com.google.firebase.appcheck.playintegrity.PlayIntegrityAppCheckProviderFactory
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.FirebaseFirestoreSettings
import com.google.firebase.firestore.PersistentCacheSettings
import dagger.hilt.android.HiltAndroidApp
import javax.inject.Inject

@HiltAndroidApp
class SocialFeedApplication : Application(), Configuration.Provider {

    @Inject
    lateinit var workerFactory: HiltWorkerFactory

    override fun onCreate() {
        super.onCreate()

        // ── Initialiser Firebase ────────────────────────────────────────────
        FirebaseApp.initializeApp(this)

        // ── Activer la persistance offline Firestore ────────────────────────
        // Les publications seront disponibles même sans connexion
        val settings = FirebaseFirestoreSettings.Builder()
            .setLocalCacheSettings(
                PersistentCacheSettings.newBuilder()
                    .setSizeBytes(50L * 1024 * 1024) // 50 MB de cache
                    .build()
            )
            .build()
        FirebaseFirestore.getInstance().firestoreSettings = settings

        // ── Firebase App Check (sécurité Anti-abus) ─────────────────────────
        val firebaseAppCheck = FirebaseAppCheck.getInstance()
        firebaseAppCheck.installAppCheckProviderFactory(
            PlayIntegrityAppCheckProviderFactory.getInstance()
        )

        // ── Créer les canaux de notification (Android 8+) ───────────────────
        createNotificationChannels()
    }

    // ── WorkManager avec Hilt ────────────────────────────────────────────────
    override val workManagerConfiguration: Configuration
        get() = Configuration.Builder()
            .setWorkerFactory(workerFactory)
            .build()

    // ── Canaux de notification ───────────────────────────────────────────────
    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = getSystemService(NotificationManager::class.java)

            // Canal principal
            val mainChannel = NotificationChannel(
                getString(R.string.default_notification_channel_id),
                getString(R.string.notification_channel_name),
                NotificationManager.IMPORTANCE_DEFAULT
            ).apply {
                description = "Likes, commentaires et demandes d'amis"
                enableVibration(true)
                enableLights(true)
            }

            // Canal silencieux (mises à jour)
            val silentChannel = NotificationChannel(
                "socialfeed_silent",
                "Mises à jour silencieuses",
                NotificationManager.IMPORTANCE_LOW
            )

            manager.createNotificationChannels(listOf(mainChannel, silentChannel))
        }
    }
}
