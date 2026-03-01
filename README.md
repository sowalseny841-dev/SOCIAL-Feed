# 📱 SOCIAL-Feed

Application Android de réseau social inspirée de Facebook, développée avec Kotlin + Firebase.

## ✅ Fonctionnalités implémentées

- **Authentification** : Email/mot de passe, inscription, mot de passe oublié
- **Fil d'actualité** : Publications texte + images, pull-to-refresh
- **Likes** : Mise à jour instantanée (optimistic UI)
- **Commentaires** : Ajout de commentaires sur les posts
- **Profils** : Création automatique du profil à l'inscription
- **Notifications FCM** : Push notifications Firebase
- **Navigation** : Barre de navigation inférieure

## 🔧 Stack technique

| Composant | Technologie |
|-----------|-------------|
| Langage | Kotlin |
| Architecture | MVVM + Hilt DI |
| Base de données | Firebase Firestore |
| Auth | Firebase Authentication |
| Storage | Firebase Storage |
| Images | Glide |
| Notifications | Firebase Cloud Messaging |
| Build | Gradle 8.4 + AGP 8.2.2 |
| CI/CD | GitHub Actions |

## 📦 Télécharger l'APK

Les APK sont disponibles dans [GitHub Releases](https://github.com/sowalseny841-dev/SOCIAL-Feed/releases) :

- **v1.2.0** — Correctif crash démarrage (version stable)
- **v1.1.0** — Correctifs stabilité et performances
- **v1.0.0** — Version initiale

## 🏗️ Structure du projet

```
android-app/
├── app/
│   └── src/main/
│       ├── java/com/socialfeed/app/
│       │   ├── SocialFeedApp.kt          # Application class + Hilt
│       │   ├── di/AppModule.kt           # Injection de dépendances
│       │   ├── services/FCMService.kt    # Push notifications
│       │   └── ui/
│       │       ├── auth/AuthActivity.kt  # Login / Inscription
│       │       └── feed/MainActivity.kt  # Fil d'actualité
│       └── res/
│           ├── layout/                   # Fichiers XML UI
│           └── values/                   # Couleurs, strings, thèmes
├── build.gradle                          # Config Gradle racine
├── settings.gradle                       # Modules
└── gradle.properties                     # Options JVM
```

## ⚙️ Configuration CI/CD

Le projet utilise GitHub Actions pour builder automatiquement l'APK et l'AAB à chaque push.

### Secrets requis dans GitHub :
- `KEYSTORE_BASE64` — Keystore encodé en base64
- `KEYSTORE_PASSWORD` — Mot de passe du keystore
- `KEY_ALIAS` — Alias de la clé
- `KEY_PASSWORD` — Mot de passe de la clé
- `GOOGLE_SERVICES_JSON` — Contenu du fichier google-services.json

## 🚀 Prochaines étapes

- [ ] Profil utilisateur complet (photo, bio, followers)
- [ ] Messagerie privée
- [ ] Reels / vidéos courtes
- [ ] Système de monétisation
- [ ] Marketplace
- [ ] Appels audio/vidéo WebRTC

## 📄 Licence

Projet privé — Tous droits réservés.
