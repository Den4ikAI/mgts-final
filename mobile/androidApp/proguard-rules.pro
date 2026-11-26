# Попутно · R8. kotlinx.serialization, Decompose, Coil, Compose приносят свои consumer-правила.
# Ниже — только то, что библиотеки не покрывают.

# Ktor тянет опциональные JVM-классы, которых нет на Android
-dontwarn org.slf4j.**
-dontwarn java.lang.management.**
-dontwarn io.ktor.util.debug.**

# OkHttp: опциональные TLS-провайдеры
-dontwarn org.bouncycastle.**
-dontwarn org.conscrypt.**
-dontwarn org.openjsse.**

# Конфигурации навигации Decompose сериализуются в saved state
-keepclassmembers @kotlinx.serialization.Serializable class ru.poputno.** {
    *** Companion;
    kotlinx.serialization.KSerializer serializer(...);
}

# Яндекс MapKit: JNI и рефлексия внутри SDK
-keep class com.yandex.** { *; }
-dontwarn com.yandex.**
