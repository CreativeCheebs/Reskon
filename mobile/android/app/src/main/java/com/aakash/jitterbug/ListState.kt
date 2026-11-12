package com.aakash.jitterbug

import org.json.JSONObject

/**
 * The tasks a view returns, split the way the web's view screen splits them
 * (web/src/views/ViewScreen.tsx): awake tasks are listed; snoozed tasks, and
 * blocked ones while the view hides them, wait behind their own buttons.
 * Only the server's own flags (`snoozed`, `blocked`, `missing`) are read;
 * nothing is worked out here.
 */
class ListSplit(
    val shown: List<JSONObject>,
    val snoozed: List<JSONObject>,
    val blocked: List<JSONObject>,
    val incomplete: List<JSONObject>,
)

/**
 * [hideBlocked] is the view's own choice (board_state.hide_blocked, on when
 * absent). [checksDetails] is true once Settings › Complete details asks for
 * at least one field; until then no task counts as incomplete.
 */
fun splitTasks(tasks: List<JSONObject>, hideBlocked: Boolean, checksDetails: Boolean): ListSplit {
    val snoozed = tasks.filter { it.optBoolean("snoozed") }
    val awake = tasks.filterNot { it.optBoolean("snoozed") }
    val shown = if (hideBlocked) awake.filterNot { it.optBoolean("blocked") } else awake
    val incomplete = if (checksDetails) shown.filter { (it.optJSONArray("missing")?.length() ?: 0) > 0 } else emptyList()
    return ListSplit(shown, snoozed, awake.filter { it.optBoolean("blocked") }, incomplete)
}

/** A view hides its blocked tasks unless it says otherwise. */
fun hidesBlocked(view: ViewRef): Boolean = hidesBlocked(view.raw)

fun hidesBlocked(rawView: JSONObject): Boolean = rawView.optJSONObject("board_state")?.optBoolean("hide_blocked", true) ?: true

/**
 * A copy of the view's `board_state` with one key changed. The server replaces
 * the whole object on a PATCH instead of merging it, so every change to one
 * key has to send all the others back too.
 */
fun boardStateWith(rawView: JSONObject, key: String, value: Any): JSONObject =
    JSONObject((rawView.optJSONObject("board_state") ?: JSONObject()).toString()).put(key, value)

/** Settings › Complete details: the fields an open task should have. */
fun requiredFields(settings: JSONObject): List<String> = settings.optJSONObject("task_completeness")?.strs("required") ?: emptyList()

/** Snoozed tasks, soonest to wake first; the ones waiting on a blocker (no date) come first, as on the web. */
fun snoozedOrder(tasks: List<JSONObject>): List<JSONObject> = tasks.sortedBy { it.str("snoozed_until") ?: "" }

/** When a snoozed task shows again, in words (web/src/task/SnoozeButton.tsx wakeLabel). [today] is an ISO date. */
fun wakeLabel(t: JSONObject, today: String): String {
    val until = t.str("snoozed_until")
    if (until != null && until.take(10) > today) return "Back on ${dayLabel(until)}"
    if (!t.optBoolean("snooze_until_unblocked")) return ""
    val waiting = t.objs("blocked_by").filter { it.optString("behaviour") !in setOf("done", "cancelled") }.map { it.optString("title") }
    return when (waiting.size) {
        0 -> "Back when unblocked"
        1 -> "Back when “${waiting[0]}” is done"
        else -> "Back when ${waiting.size} blockers are done"
    }
}

/** What a task is waiting on, for the Blocked list. */
fun waitingOn(t: JSONObject): String =
    t.objs("blocked_by").filter { it.optString("behaviour") !in setOf("done", "cancelled") }.joinToString(", ") { it.optString("title") }

/**
 * The hidden statuses (Backlog...) a person has opened in each view, kept while the app runs, so
 * going into a task and back, or turning the phone, does not close them again.
 */
object OpenedStatuses {
    private val byView = mutableMapOf<Long, Set<Long>>()
    fun of(viewId: Long): Set<Long> = byView[viewId] ?: emptySet()
    fun set(viewId: Long, ids: Set<Long>) { byView[viewId] = ids }
}

/**
 * The statuses a vertical list shows as sections, in order: those on the board, plus any hidden
 * one (Backlog, Cancelled...) the person has opened with its button.
 */
fun visibleStatuses(statuses: List<StatusRef>, opened: Set<Long>): List<StatusRef> = statuses.filter { it.onBoard || it.id in opened }

/**
 * Drops the tasks that sit in a hidden status (Backlog...) unless the person opened it, so a list
 * grouped any way does not fill up with them. Tasks are kept in their order.
 */
fun withoutHiddenStatuses(tasks: List<JSONObject>, statuses: List<StatusRef>, opened: Set<Long>): List<JSONObject> {
    val hidden = statuses.filter { !it.onBoard && it.id !in opened }.map { it.id }.toSet()
    return if (hidden.isEmpty()) tasks else tasks.filter { t -> t.optLong("status_id", -1) !in hidden }
}

/**
 * Where each section starts in a flat list that has, for every status, one header row and then one
 * row per task (or one "no tasks" row when it has none). Used to jump to a status.
 */
fun sectionStarts(statusIds: List<Long>, counts: Map<Long, Int>): Map<Long, Int> {
    var at = 0
    return statusIds.associateWith { id ->
        val start = at
        at += 1 + maxOf(1, counts[id] ?: 0)
        start
    }
}
