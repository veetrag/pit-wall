# ProGuard / R8 rules for Pit Wall.
#
# WHY THIS FILE IS LOAD-BEARING. Capacitor does not call its plugins directly:
# it discovers them by reading the @CapacitorPlugin annotation at runtime and
# then invokes @PluginMethod methods BY NAME from JavaScript across the WebView
# bridge. R8 sees no Java caller for any of it, so with minifyEnabled on and no
# rules it will happily strip or rename the lot. The build still succeeds; the
# app then fails at runtime with a blank screen or a silently dead plugin call.
# Nothing in the test suite catches that, because none of this is JS.
#
# Three plugins are actually wired up (android/capacitor.settings.gradle):
#   com.capacitorjs.plugins.app.AppPlugin
#   com.capacitorjs.plugins.haptics.HapticsPlugin          <- pit confirm, race start
#   com.capacitorjs.plugins.preferences.PreferencesPlugin  <- every game setting
# If any of them disappears, settings stop persisting and haptics go dead
# without an error anywhere.

# --- Capacitor core and the plugin bridge ---------------------------------

# The framework reflects over its own classes (Bridge, PluginHandle, JSObject,
# the annotation types) to build the plugin registry.
-keep class com.getcapacitor.** { *; }

# Every plugin class, by both of the ways Capacitor identifies one: the base
# class and the annotation. Keeping members too, because the bridge calls the
# no-arg constructor and the @PluginMethod methods reflectively.
-keep public class * extends com.getcapacitor.Plugin { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin public class * { *; }

-keepclassmembers class * {
    @com.getcapacitor.PluginMethod public <methods>;
}

# Cordova compatibility shim. The generated module exists in this project even
# with no Cordova plugins installed; keeping it costs nothing and avoids a
# silent break if one is ever added.
-keep class org.apache.cordova.** { *; }

# --- The WebView bridge ----------------------------------------------------

# JS calls these by name. Renaming them breaks the bridge silently.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# --- Reflection metadata ---------------------------------------------------

# Capacitor reads annotations at runtime, so they must survive R8's default
# stripping. Signature/InnerClasses/EnclosingMethod keep generic and nested
# type information that the JSON marshalling depends on.
-keepattributes *Annotation*, Signature, InnerClasses, EnclosingMethod

# Keep source file and line numbers, then rename the source file. Without this
# a Play Console crash report is an unreadable stack of obfuscated frames; with
# it, uploading the mapping.txt from
# app/build/outputs/mapping/release/ gives fully symbolicated traces.
-keepattributes SourceFile, LineNumberTable
-renamesourcefileattribute SourceFile
