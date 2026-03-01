# ============================================================
#  SOCIALFEED – ProGuard Rules (proguard-rules.pro)
#  Protège le code en release + garde les classes Firebase
# ============================================================

# ── Règles générales ────────────────────────────────────────
-optimizationpasses 5
-dontusemixedcaseclassnames
-dontskipnonpubliclibraryclasses
-verbose

# ── Firebase Auth ────────────────────────────────────────────
-keep class com.google.firebase.auth.** { *; }
-keep class com.google.firebase.** { *; }
-keep class com.google.android.gms.** { *; }
-keepattributes Signature
-keepattributes *Annotation*

# ── Firestore / Models de données ────────────────────────────
# Garder les classes de données Kotlin (data class)
-keepclassmembers class com.socialfeed.app.data.model.** {
    *;
}
-keep class com.socialfeed.app.data.model.** { *; }

# ── Firebase Storage ─────────────────────────────────────────
-keep class com.google.firebase.storage.** { *; }

# ── Retrofit / OkHttp ────────────────────────────────────────
-keepattributes Exceptions
-keep class retrofit2.** { *; }
-keepclasseswithmembers class * {
    @retrofit2.http.* <methods>;
}
-dontwarn okhttp3.**
-dontwarn okio.**

# ── Gson ─────────────────────────────────────────────────────
-keep class com.google.gson.** { *; }
-keepclassmembers class * {
    @com.google.gson.annotations.SerializedName <fields>;
}

# ── Glide ────────────────────────────────────────────────────
-keep public class * implements com.bumptech.glide.module.GlideModule
-keep class * extends com.bumptech.glide.module.AppGlideModule { *; }
-keep public enum com.bumptech.glide.load.ImageHeaderParser$** {
    **[] $VALUES;
    public *;
}

# ── Hilt ─────────────────────────────────────────────────────
-keep class dagger.hilt.** { *; }
-keep class javax.inject.** { *; }

# ── Kotlin Coroutines ─────────────────────────────────────────
-keepnames class kotlinx.coroutines.internal.MainDispatcherFactory {}
-keepnames class kotlinx.coroutines.CoroutineExceptionHandler {}
-dontwarn kotlinx.coroutines.**

# ── Room ──────────────────────────────────────────────────────
-keep class androidx.room.** { *; }
-keepclassmembers class * extends androidx.room.RoomDatabase {
    abstract *;
}

# ── Navigation ────────────────────────────────────────────────
-keep class androidx.navigation.** { *; }

# ── Crashlytics ───────────────────────────────────────────────
-keepattributes SourceFile,LineNumberTable
-keep public class * extends java.lang.Exception
-keep class com.google.firebase.crashlytics.** { *; }
-dontwarn com.google.firebase.crashlytics.**

# ── Lottie ────────────────────────────────────────────────────
-dontwarn com.airbnb.lottie.**
-keep class com.airbnb.lottie.** { *; }

# ── Supprimer les logs en release ─────────────────────────────
-assumenosideeffects class android.util.Log {
    public static *** d(...);
    public static *** v(...);
    public static *** i(...);
}
