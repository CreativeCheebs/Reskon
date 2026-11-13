package com.aakash.jitterbug

import android.content.Context

/** The phone app's version, from the VERSION file at the top of the repository (see build.gradle.kts). */
/** A server's version and the day it was last updated (year-month-day; null from an older server). */
data class ServerVersion(val version: String, val updated: String?) {
    /** "0.2.0 · updated 13 Nov 2026". */
    val label: String get() = version + (updated?.let { d -> runCatching { java.time.LocalDate.parse(d) }.getOrNull() }
        ?.let { " · updated ${it.dayOfMonth} ${it.month.getDisplayName(java.time.format.TextStyle.SHORT, java.util.Locale.getDefault())} ${it.year}" } ?: "")
}

fun appVersion(ctx: Context): String = runCatching { ctx.packageManager.getPackageInfo(ctx.packageName, 0).versionName }.getOrNull() ?: "?"
