package com.aakash.jitterbug

import org.json.JSONObject
import java.time.Instant
import java.time.LocalDate
import java.time.temporal.ChronoUnit

/**
 * The Day Planner's small pieces of arithmetic and wording, apart from the screens so they can be
 * tested without a phone. Every figure (planned, logged, available, over) is worked out by the Go
 * core; this only writes them down, and ticks a running timer's seconds from the timestamps the
 * core stored.
 */

/** 90 -> "1h 30m", 45 -> "45m", 120 -> "2h", null -> "–". */
fun minText(min: Long?): String {
    if (min == null) return "–"
    val m = maxOf(0L, min)
    return when {
        m < 60 -> "${m}m"
        m % 60 == 0L -> "${m / 60}h"
        else -> "${m / 60}h ${m % 60}m"
    }
}

fun hoursToMin(h: Double?): Long? = h?.let { Math.round(it * 60) }

/** "1:05" or "1:05:09": a timer's clock. */
fun clockText(seconds: Long): String {
    val s = maxOf(0L, seconds)
    val h = s / 3600
    val m = s / 60 % 60
    val tail = (s % 60).toString().padStart(2, '0')
    return if (h == 0L) "$m:$tail" else "$h:${m.toString().padStart(2, '0')}:$tail"
}

private fun JSONObject.minutes(k: String): Long? = num(k)?.let { Math.round(it) }


/**
 * The Available tile: the server's `free_min` ("4h"), "1h over" when it is negative, "Not set" when
 * null (no available time). Nothing is worked out here; the sign is only written as a word.
 */
fun freeText(totals: JSONObject): String {
    val free = totals.minutes("free_min") ?: return "Not set"
    return if (free < 0) "${minText(-free)} over" else minText(free)
}

/** Under the Available figure: "of 8h" (the day's available time), with where it came from when it is this day's own. Null when not set. */
fun availableNote(totals: JSONObject): String? {
    val avail = totals.minutes("available_min") ?: return null
    return "of ${minText(avail)}" + if (totals.str("available_from") == "day") " · this day" else ""
}

/** Is the day over? The server's `over` (free time below zero). */
fun isOver(totals: JSONObject) = totals.optBoolean("over") || (totals.minutes("free_min") ?: 0L) < 0

/** "Logged today" / "Planned today" for today, plain "Logged" / "Planned" for any other day. */
fun totalLabel(word: String, shown: LocalDate, today: LocalDate) = if (shown == today) "$word today" else word

/** "3 tasks · 1 event". */
fun planCountText(items: List<JSONObject>): String {
    val events = items.count { it.optString("kind") == "event" }
    val tasks = items.size - events
    val t = "$tasks ${if (tasks == 1) "task" else "tasks"}"
    val e = "$events ${if (events == 1) "event" else "events"}"
    return if (events == 0) t else if (tasks == 0) e else "$t · $e"
}


/** Seconds a timer has counted at [now]: what it had before, plus the time since it last (re)started. A paused timer holds still. */
fun elapsedSeconds(timer: JSONObject, now: Instant): Long {
    val base = timer.optLong("accumulated_s")
    val resumed = timer.str("resumed_at")?.let { runCatching { Instant.parse(it) }.getOrNull() } ?: return base
    return base + maxOf(0L, now.epochSecond - resumed.epochSecond)
}

/** Is [timer] the one counting for this plan line on this day? An event's by line; a task's by task and day. */
fun timerIsFor(timer: JSONObject, item: JSONObject, day: String): Boolean {
    if (timer.str("day") != day) return false
    return if (item.optString("kind") == "event") timer.id("day_item_id") == item.getLong("id")
    else timer.id("day_item_id") == null && item.id("task_id") != null && timer.id("task_id") == item.id("task_id")
}

/** The timers to show above the list: all of them when two ran at once, else the ones not on a row of [day]. */
fun stripTimers(timers: List<JSONObject>, conflict: Boolean, items: List<JSONObject>, day: String): List<JSONObject> =
    if (conflict) timers else timers.filter { t -> items.none { timerIsFor(t, it, day) } }

/** The seven keys of the planner_available setting, Sunday first, with the day's name. */
val WEEKDAYS = listOf("sun" to "Sunday", "mon" to "Monday", "tue" to "Tuesday", "wed" to "Wednesday", "thu" to "Thursday", "fri" to "Friday", "sat" to "Saturday")

/**
 * Typed time to whole minutes, 0 to 1440; null for blank or unreadable. A plain whole number is
 * minutes ("90"); "1:30", "1h 30m" and "45m" are read as they say; a decimal such as "1.5" is refused
 * because it could mean hours or minutes.
 */
fun parseMinutes(s: String): Long? {
    val t = s.trim().lowercase()
    val m = when {
        Regex("""^\d+$""").matches(t) -> t.toLongOrNull()
        t.toDoubleOrNull() != null -> null
        else -> parseHours(t)?.let { Math.round(it * 60) }
    } ?: return null
    return if (m < 0 || m > 1440) null else m
}

/** A stopped timer waiting for its time to be reviewed and saved (or discarded). */
fun isPending(timer: JSONObject) = timer.optBoolean("stopped")

/** The planner_available setting with one weekday changed (or cleared with null): the whole object to save. */
fun withWeekday(current: JSONObject?, key: String, minutes: Long?): JSONObject {
    val next = JSONObject(current?.toString() ?: "{}")
    if (minutes == null) next.remove(key) else next.put(key, minutes)
    return next
}

/** Line ids after moving the one at [from] to [to]; for PUT /day/{date}/order. */
fun reordered(ids: List<Long>, from: Int, to: Int): List<Long> {
    if (from !in ids.indices || to !in ids.indices) return ids
    return ids.toMutableList().also { it.add(to, it.removeAt(from)) }
}

/** "yesterday", "3 days ago": how long before [to] the day [from] was. */
fun daysAgoText(from: String, to: LocalDate): String {
    val d = runCatching { ChronoUnit.DAYS.between(LocalDate.parse(from), to) }.getOrNull() ?: return from
    return when (d) { 0L -> "today"; 1L -> "yesterday"; else -> "$d days ago" }
}

/**
 * The start and end stamps a session is saved with. A session from a timer (or an old one with an end)
 * keeps its exact [start] and [end] while the start time shown is still that start; once the start time
 * is changed by hand the end no longer fits it, so only a start worked out from the day and the time is
 * sent. Returns (started_at, ended_at), either null.
 */
fun sessionStamps(
    loggedFor: LocalDate, startedAt: java.time.LocalTime?, start: Instant?, end: Instant?, zone: java.time.ZoneId, hoursUnchanged: Boolean = true,
): Pair<String?, String?> {
    fun minute(t: java.time.LocalTime) = t.withSecond(0).withNano(0)
    if (hoursUnchanged && start != null && end != null && startedAt != null && minute(start.atZone(zone).toLocalTime()) == minute(startedAt)) {
        return start.toString() to end.toString()
    }
    return startedAt?.let { loggedFor.atTime(it).atZone(zone).toInstant().toString() } to null
}
