package com.aakash.jitterbug

import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue

/**
 * How the Board layout is drawn on this phone: as columns side by side (the default, like the web
 * app) or as one list down the screen with a section for each status and wrapping buttons that jump
 * between them. It is a choice about this phone's screen, so it is kept on the phone and is not a
 * synced setting. The web app has no such choice.
 */
object BoardStyle {
    private const val KEY = "board_as_list"
    var asList by mutableStateOf(false)
        private set

    fun load(ctx: Context) {
        asList = ctx.getSharedPreferences("ui", Context.MODE_PRIVATE).getBoolean(KEY, false)
    }

    fun set(ctx: Context, value: Boolean) {
        asList = value
        ctx.getSharedPreferences("ui", Context.MODE_PRIVATE).edit().putBoolean(KEY, value).apply()
    }
}
