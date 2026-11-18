package com.aakash.jitterbug

import org.json.JSONObject

/**
 * What a plan line says about itself, in plain words that read without a heading:
 *  - today: the time planned for it on this day, and what was logged against it on this day;
 *  - all time: what the task has had in all, against its one whole-task estimate.
 * The figures all come from the server; this only writes them down.
 */

private fun JSONObject.mins(k: String): Long? = num(k)?.let { Math.round(it) }
private fun JSONObject.loggedMin(k: String): Long = hoursToMin(optDouble(k, 0.0)) ?: 0L

fun isEvent(item: JSONObject) = item.optString("kind") == "event"

/** The line's name: its own, else the task's (the server sends `title` already chosen). */
fun lineTitle(item: JSONObject): String = item.optString("title")

/** "Part of <task>" when the line has its own name, else null. */
fun partOfText(item: JSONObject): String? =
    if (!isEvent(item) && item.optBoolean("renamed")) item.str("task_title")?.takeIf { it.isNotBlank() }?.let { "Part of $it" } else null

/** "2h today", "35m of 2h today", "35m today", or null when nothing is planned or logged today. Events: "45m reserved". */
fun todayText(item: JSONObject): String? {
    val planned = item.mins("planned_min")
    if (isEvent(item)) return planned?.let { "${minText(it)} reserved" }
    val day = item.loggedMin("logged_day_h")
    return when {
        planned != null && day > 0 -> "${minText(day)} of ${minText(planned)} today"
        planned != null -> "${minText(planned)} today"
        day > 0 -> "${minText(day)} today"
        else -> null
    }
}

/** A task's all-time figures: "1h 5m / 3h all time", or "1h 5m logged, no estimate". An event: what its sessions add up to. */
fun allTimeText(item: JSONObject): String? {
    val logged = item.loggedMin("logged_h")
    if (isEvent(item)) return if (logged > 0) "${minText(logged)} logged" else null
    val est = hoursToMin(item.num("estimate_h"))
    return when {
        est != null -> "${minText(logged)} / ${minText(est)} all time"
        logged > 0 -> "${minText(logged)} logged, no estimate"
        else -> "No estimate"
    }
}

/** The small lines under a row's title, in order; empty ones left out. */
fun lineDetails(item: JSONObject): List<String> = listOfNotNull(partOfText(item), listOfNotNull(todayText(item), allTimeText(item)).joinToString(" · ").ifEmpty { null })

/** What a screen reader says for a row. */
fun rowDescription(item: JSONObject): String =
    (listOf(if (isEvent(item)) "Event" else "Task", lineTitle(item)) + lineDetails(item) + listOfNotNull(if (isEvent(item) && item.optBoolean("done")) "done" else null))
        .joinToString(", ")

/**
 * The name to send for a plan line. A name left as the task's own title (or blank) is no name at all:
 * null when adding (the task's title is used), "" when editing (clears an old name).
 */
fun lineNameToSend(typed: String, taskTitle: String, editing: Boolean): String? {
    val t = typed.trim()
    return if (t.isEmpty() || t == taskTitle.trim()) (if (editing) "" else null) else t
}

/** The planned time typed for a line: blank means none (null, valid); otherwise minutes 0 to 1440, or invalid. */
fun plannedInput(text: String): Pair<Boolean, Long?> =
    if (text.isBlank()) true to null else parseMinutes(text).let { (it != null) to it }

/** A task line's all-time logged and estimate for a task picker row: "2h / 8h", "30m / –" (no estimate). */
fun pickerFigures(task: JSONObject): String {
    val logged = task.loggedMin("logged_h")
    val est = hoursToMin(task.num("estimate_h"))
    return "${minText(logged)} / ${minText(est)}"
}
