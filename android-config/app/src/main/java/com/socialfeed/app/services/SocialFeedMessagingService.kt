// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  SocialFeedMessagingService.kt                                          ║
// ║  Service Firebase Cloud Messaging – notifications push                  ║
// ╚══════════════════════════════════════════════════════════════════════════╝

package com.socialfeed.app.services

import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import androidx.core.app.NotificationCompat
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.socialfeed.app.R
import com.socialfeed.app.ui.main.MainActivity

class SocialFeedMessagingService : FirebaseMessagingService() {

    // ── Nouveau token FCM ─────────────────────────────────────────────────
    // Appelé quand le token est créé ou mis à jour
    override fun onNewToken(token: String) {
        super.onNewToken(token)
        // Sauvegarder le token dans Firestore pour l'utilisateur courant
        val userId = FirebaseAuth.getInstance().currentUser?.uid ?: return
        FirebaseFirestore.getInstance()
            .collection("users")
            .document(userId)
            .update("fcmToken", token)
    }

    // ── Réception d'un message push ────────────────────────────────────────
    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        super.onMessageReceived(remoteMessage)

        // Notification de données (app en foreground)
        remoteMessage.data.isNotEmpty().let {
            val type  = remoteMessage.data["type"]    ?: ""
            val title = remoteMessage.data["title"]   ?: "SocialFeed"
            val body  = remoteMessage.data["body"]    ?: ""
            val postId = remoteMessage.data["postId"] ?: ""

            showNotification(title, body, type, postId)
        }

        // Notification de notification (app en background)
        remoteMessage.notification?.let { notif ->
            showNotification(
                title = notif.title ?: "SocialFeed",
                body = notif.body ?: "",
                type = "",
                postId = ""
            )
        }
    }

    // ── Afficher la notification système ──────────────────────────────────
    private fun showNotification(
        title: String,
        body: String,
        type: String,
        postId: String
    ) {
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
            putExtra("notification_type", type)
            putExtra("post_id", postId)
        }

        val pendingIntent = PendingIntent.getActivity(
            this, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val channelId = getString(R.string.default_notification_channel_id)

        val notification = NotificationCompat.Builder(this, channelId)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .build()

        val notifId = System.currentTimeMillis().toInt()
        val manager = getSystemService(NotificationManager::class.java)
        manager.notify(notifId, notification)
    }
}
