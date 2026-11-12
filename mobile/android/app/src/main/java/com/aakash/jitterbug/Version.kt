package com.aakash.jitterbug

import android.content.Context

/** The phone app's version, from the VERSION file at the top of the repository (see build.gradle.kts). */
fun appVersion(ctx: Context): String = runCatching { ctx.packageManager.getPackageInfo(ctx.packageName, 0).versionName }.getOrNull() ?: "?"
