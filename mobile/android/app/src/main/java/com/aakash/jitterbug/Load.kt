package com.aakash.jitterbug

import android.util.Log
import androidx.compose.runtime.Composable
import androidx.compose.runtime.State
import androidx.compose.runtime.produceState

/**
 * Loads a value from the core, again whenever keys change or after any write
 * (App.version). A failed load keeps the last value and shows a toast.
 */
@Composable
fun <T> loaded(vararg keys: Any?, f: suspend () -> T): State<T?> =
    produceState<T?>(null, App.version, *keys) {
        value = try {
            f()
        } catch (e: Exception) {
            Log.w("JB", "load failed", e)
            App.say(e.message ?: "Could not load")
            value
        }
    }
