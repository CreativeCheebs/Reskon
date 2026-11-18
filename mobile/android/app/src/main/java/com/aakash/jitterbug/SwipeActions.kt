package com.aakash.jitterbug

import org.json.JSONObject

/**
 * The buttons a swiped task row shows (Settings › Card actions › Swipe left). Kept apart from the
 * screens so the order and the limit can be tested without a phone.
 */

/** Every action a task offers, in the web right-click menu's order. */
val TASK_ACTION_KEYS = listOf("log", "snooze", "note", "move", "open", "delete")

/** How many buttons a swiped row shows besides More. */
const val SWIPE_MAX = 3

/** Used until the user chooses: Snooze, Log time, Move to. */
val SWIPE_DEFAULT = listOf("snooze", "log", "move")

/**
 * The saved `phone_card_actions` setting's swipe list: known keys only, no repeats, at most
 * [SWIPE_MAX], in the order saved. Nothing saved gives the default; a saved empty list stays empty
 * (only More shows).
 */
fun swipeActions(settings: JSONObject): List<String> {
    val arr = settings.optJSONObject("phone_card_actions")?.optJSONArray("swipe") ?: return SWIPE_DEFAULT
    val saved = (0 until arr.length()).mapNotNull { arr.optString(it).takeIf { k -> k in TASK_ACTION_KEYS } }
    return saved.distinct().take(SWIPE_MAX)
}

/**
 * What tapping [key] does to the chosen list: a chosen one is removed, another is added at the end,
 * and a fourth is refused (null) because only [SWIPE_MAX] fit.
 */
fun toggleSwipe(current: List<String>, key: String): List<String>? = when {
    key in current -> current - key
    key !in TASK_ACTION_KEYS -> current
    current.size >= SWIPE_MAX -> null
    else -> current + key
}

/** The word on a swipe button (short, since the button is narrow). The More sheet uses the full names. */
fun swipeLabel(key: String): String = when (key) {
    "log" -> "Log time"
    "snooze" -> "Snooze"
    "note" -> "Edit"
    "move" -> "Move to"
    "open" -> "Open"
    "delete" -> "Delete"
    else -> key
}
