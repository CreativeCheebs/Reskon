package com.aakash.jitterbug

import org.json.JSONObject

/** Every tab the bottom bar can show, in order: route name and label. */
val ALL_TABS = listOf("today" to "Today", "board" to "Board", "sessions" to "Sessions", "inbox" to "Inbox", "more" to "More")

/**
 * The `show_day_screen` setting: whether the Day screen (Today here) is offered. One setting on the
 * account, so the web and the phone agree; off until someone turns it on. Only a real `true` counts,
 * so a stray value from a sync cannot switch it on.
 */
fun showsDay(settings: JSONObject): Boolean = settings.opt("show_day_screen") == true

/** The tabs in the bottom bar: Today only while the Day screen is on. */
fun visibleTabs(showDay: Boolean) = ALL_TABS.filter { it.first != "today" || showDay }

/** The screen the app opens on, and returns to after first-run setup. */
fun startRoute(showDay: Boolean) = if (showDay) "today" else "board"
