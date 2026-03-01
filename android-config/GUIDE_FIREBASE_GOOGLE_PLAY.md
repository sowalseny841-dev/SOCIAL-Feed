# 📱 SOCIALFEED – Guide Complet Firebase + Google Play Store

## 🗂️ Fichiers générés

```
android-config/
├── AndroidManifest.xml          ← Manifest complet (permissions, activités, FCM)
├── app/
│   ├── build.gradle             ← Config Gradle + toutes les dépendances Firebase
│   ├── proguard-rules.pro       ← Règles d'obfuscation pour la release
│   ├── google-services.json.TEMPLATE  ← Template à remplacer
│   └── src/main/
│       ├── java/com/socialfeed/app/
│       │   ├── SocialFeedApplication.kt         ← Init Firebase
│       │   ├── data/model/Models.kt             ← Modèles Firestore
│       │   ├── data/firebase/
│       │   │   ├── FirebaseAuthRepository.kt    ← Auth complet
│       │   │   └── FirebasePostRepository.kt    ← Posts, likes, commentaires
│       │   └── services/
│       │       └── SocialFeedMessagingService.kt ← Notifications push
│       └── res/
│           ├── values/strings.xml    ← Textes
│           ├── values/colors.xml     ← Couleurs (bleu Facebook)
│           ├── values/themes.xml     ← Thèmes Material 3
│           └── xml/
│               ├── network_security_config.xml
│               ├── file_paths.xml
│               ├── data_extraction_rules.xml
│               └── backup_rules.xml
├── build.gradle                 ← Gradle niveau projet
├── settings.gradle              ← Modules & dépôts
└── keystore.properties.TEMPLATE ← Config signature (CONFIDENTIEL)
```

---

## 🔥 ÉTAPE 1 : Configurer Firebase

### 1.1 Créer le projet Firebase

1. Rendez-vous sur **[https://console.firebase.google.com](https://console.firebase.google.com)**
2. Cliquez sur **"Créer un projet"**
3. Nom du projet : `SocialFeed`
4. Activez **Google Analytics** (recommandé)
5. Choisissez votre compte Analytics

### 1.2 Ajouter l'application Android

1. Dans la console Firebase, cliquez sur l'icône **Android**
2. Renseignez :
   - **Package** : `com.socialfeed.app`
   - **Surnom** : `SocialFeed Android`
   - **SHA-1** : (voir section 1.3 ci-dessous)
3. Téléchargez **`google-services.json`**
4. Placez le fichier dans : `app/google-services.json`

### 1.3 Obtenir le SHA-1 de votre keystore

```bash
# Pour le keystore debug (développement)
keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android

# Pour votre keystore release (production)
keytool -list -v -keystore ./keystore/socialfeed-release.jks -alias socialfeed
```

---

## 🔐 ÉTAPE 2 : Activer les services Firebase

### 2.1 Firebase Authentication

1. Firebase Console → **Authentication** → **Commencer**
2. Activer les méthodes de connexion :
   - ✅ **Email/Mot de passe**
   - ✅ **Google** (configurer le Web Client ID)
3. Ajouter votre domaine dans "Domaines autorisés"

### 2.2 Cloud Firestore

1. Firebase Console → **Firestore Database** → **Créer une base de données**
2. Mode : **Production** (plus sécurisé)
3. Région : **europe-west3** (Francfort – pour les utilisateurs français)
4. **Règles de sécurité** :

```javascript
// firestore.rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Utilisateurs
    match /users/{userId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == userId;
    }

    // Publications
    match /posts/{postId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null
        && request.resource.data.userId == request.auth.uid;
      allow update, delete: if request.auth != null
        && resource.data.userId == request.auth.uid;

      // Likes (tout le monde peut liker)
      match /likes/{likeId} {
        allow read: if request.auth != null;
        allow write: if request.auth != null
          && likeId == request.auth.uid;
      }

      // Commentaires
      match /comments/{commentId} {
        allow read: if request.auth != null;
        allow create: if request.auth != null
          && request.resource.data.userId == request.auth.uid;
        allow delete: if request.auth != null
          && resource.data.userId == request.auth.uid;
      }
    }

    // Notifications
    match /notifications/{notifId} {
      allow read: if request.auth != null
        && resource.data.userId == request.auth.uid;
      allow write: if request.auth != null;
    }

    // Amitiés
    match /friendships/{friendshipId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null
        && request.resource.data.requesterId == request.auth.uid;
      allow update: if request.auth != null
        && resource.data.addresseeId == request.auth.uid;
    }
  }
}
```

### 2.3 Firebase Storage

1. Firebase Console → **Storage** → **Commencer**
2. Mode : **Production**
3. **Règles de stockage** :

```javascript
// storage.rules
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {

    // Photos de profil
    match /profiles/{userId}/{allPaths=**} {
      allow read: if request.auth != null;
      allow write: if request.auth != null
        && request.auth.uid == userId
        && request.resource.size < 5 * 1024 * 1024  // 5 MB max
        && request.resource.contentType.matches('image/.*');
    }

    // Images des publications
    match /posts/{userId}/{allPaths=**} {
      allow read: if request.auth != null;
      allow write: if request.auth != null
        && request.auth.uid == userId
        && request.resource.size < 10 * 1024 * 1024  // 10 MB max
        && request.resource.contentType.matches('image/.*');
    }
  }
}
```

### 2.4 Firebase Cloud Messaging (FCM)

1. Firebase Console → **Cloud Messaging**
2. Les notifications push sont configurées automatiquement
3. Testez avec la console Firebase → **Cloud Messaging** → **Envoyer un message de test**

---

## 🔑 ÉTAPE 3 : Créer le Keystore (Signature de l'APK)

```bash
# Créer le dossier keystore
mkdir -p keystore

# Générer le keystore (CONSERVER CE FICHIER PRÉCIEUSEMENT !)
keytool -genkey -v \
  -keystore keystore/socialfeed-release.jks \
  -alias socialfeed \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000 \
  -dname "CN=SocialFeed, OU=Mobile, O=SocialFeed App, L=Paris, S=Ile-de-France, C=FR"

# ⚠️ IMPORTANT :
# - Notez les mots de passe dans un endroit sûr (gestionnaire de mots de passe)
# - Ne jamais perdre ce fichier .jks (impossible de mettre à jour l'app sans lui)
# - Ne JAMAIS le committer sur Git
```

### Configurer keystore.properties

```properties
# keystore.properties (ne pas committer !)
STORE_FILE=../keystore/socialfeed-release.jks
STORE_PASSWORD=VOTRE_MOT_DE_PASSE
KEY_ALIAS=socialfeed
KEY_PASSWORD=VOTRE_MOT_DE_PASSE_CLE
FIREBASE_WEB_CLIENT_ID=XXXX.apps.googleusercontent.com
```

### Ajouter au .gitignore

```gitignore
# Sécurité – ne JAMAIS committer
keystore/
keystore.properties
google-services.json
local.properties
*.jks
*.keystore
```

---

## 🏗️ ÉTAPE 4 : Builder l'APK / AAB

```bash
# Nettoyer le projet
./gradlew clean

# Builder l'APK de debug (test uniquement)
./gradlew assembleDebug
# → app/build/outputs/apk/debug/app-debug.apk

# Builder l'AAB de release (Google Play obligatoire depuis 2021)
./gradlew bundleRelease
# → app/build/outputs/bundle/release/app-release.aab

# Builder l'APK de release (si nécessaire)
./gradlew assembleRelease
# → app/build/outputs/apk/release/app-release.apk

# Vérifier la signature
jarsigner -verify -verbose app/build/outputs/bundle/release/app-release.aab
```

---

## 🚀 ÉTAPE 5 : Publier sur Google Play Store

### 5.1 Créer un compte Google Play Console

1. Rendez-vous sur **[https://play.google.com/console](https://play.google.com/console)**
2. Frais d'inscription unique : **25 USD**
3. Complétez votre profil développeur

### 5.2 Créer l'application

1. **Créer une application** → Langue : Français → Nom : `SocialFeed`
2. Renseigner les informations :
   - **Catégorie** : Réseaux sociaux
   - **Type** : Application

### 5.3 Checklist avant publication

#### 📋 Informations de base (obligatoires)
- [ ] Nom de l'application : `SocialFeed`
- [ ] Description courte (80 car max)
- [ ] Description longue (4000 car max)
- [ ] Icône de l'app (512x512 PNG)
- [ ] Feature graphic (1024x500 PNG)
- [ ] Captures d'écran (min. 2, max. 8 par format)

#### 🔒 Conformité (obligatoire)
- [ ] **Politique de confidentialité** (URL obligatoire)
- [ ] **Déclaration de sécurité des données**
- [ ] **Classification du contenu** (questionnaire à remplir)
- [ ] Cocher "Cette app cible les utilisateurs de 13 ans et plus"

#### 📦 Publication
- [ ] Uploader l'**AAB release** (`app-release.aab`)
- [ ] Choisir les pays de distribution
- [ ] Configurer le **prix** (gratuit ou payant)

### 5.4 Informations de confidentialité à déclarer

Pour SocialFeed, déclarez dans "Sécurité des données" :
| Donnée | Collectée ? | Partagée ? | Finalité |
|--------|-------------|------------|----------|
| Nom | ✅ | ❌ | Fonctionnalités de l'app |
| Email | ✅ | ❌ | Gestion du compte |
| Photos/vidéos | ✅ | ❌ | Publications |
| Identifiants | ✅ | ❌ | Authentification |

---

## ⏱️ Délais de validation

| Action | Délai estimé |
|--------|-------------|
| Première soumission | 3-7 jours |
| Mises à jour | 1-3 jours |
| En cas de rejet | Corriger + 1-3 jours |

---

## 🔧 Structure Firestore recommandée

```
firestore/
├── users/
│   └── {userId}/
│       ├── username: "jean_dupont"
│       ├── displayName: "Jean Dupont"
│       ├── email: "jean@example.com"
│       ├── bio: "Développeur passionné"
│       ├── avatarUrl: "https://storage.googleapis.com/..."
│       └── postsCount: 42
│
├── posts/
│   └── {postId}/
│       ├── userId: "abc123"
│       ├── content: "Bonjour tout le monde !"
│       ├── imageUrl: "https://storage.googleapis.com/..."
│       ├── likesCount: 15
│       ├── commentsCount: 3
│       ├── createdAt: Timestamp
│       ├── likes/
│       │   └── {userId}: { timestamp: ... }
│       └── comments/
│           └── {commentId}/
│               ├── userId: "def456"
│               ├── content: "Super post !"
│               └── createdAt: Timestamp
│
├── notifications/
│   └── {notifId}/
│       ├── userId: "abc123"    ← destinataire
│       ├── actorId: "def456"   ← auteur
│       ├── type: "like"
│       ├── postId: "xyz789"
│       └── isRead: false
│
└── friendships/
    └── {friendshipId}/
        ├── requesterId: "abc123"
        ├── addresseeId: "def456"
        └── status: "pending" | "accepted"
```

---

## 💡 Commandes utiles

```bash
# Voir les dépendances
./gradlew app:dependencies

# Analyser la taille de l'APK
./gradlew bundleRelease
# Puis : Build > Analyze APK dans Android Studio

# Tester les crashlytics
./gradlew app:assembleRelease -PcrashlyticsMappingFileUploadEnabled=true

# Lint
./gradlew lint
```

---

## 📞 Ressources

- 📖 [Firebase Android Docs](https://firebase.google.com/docs/android/setup)
- 🎮 [Google Play Console](https://play.google.com/console)
- 🔐 [Play App Signing](https://support.google.com/googleplay/android-developer/answer/9842756)
- 🛡️ [Politique de confidentialité](https://policies.google.com/privacy)
