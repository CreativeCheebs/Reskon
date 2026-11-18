package com.aakash.jitterbug

import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate
import java.time.temporal.ChronoUnit

// What the snooze sheet shows, worked out from the `snooze` setting and the server's forecast.
// Mirrors web/src/task/snoozeIntervals.ts and SnoozeForecast.tsx; the server holds the same defaults
// (internal/db/snooze.go) and checks every snooze. Nothing here is a business rule, only wording.

const val DEFAULT_SNOOZE_MAX = 60
val DEFAULT_SNOOZE_INTERVALS = listOf(1, 2, 3, 7, 14, 30)

/** The longest snooze, in days (Settings › Snooze). */
fun snoozeMaxDays(settings: JSONObject): Int = settings.optJSONObject("snooze")?.optInt("max_days", DEFAULT_SNOOZE_MAX) ?: DEFAULT_SNOOZE_MAX

/** One ready-made choice: its name, and the day it ends. */
data class SnoozeChoice(val days: Int, val label: String, val date: LocalDate)

/** The user's snooze list in their order, cut to the longest snooze. */
fun snoozeChoices(settings: JSONObject, today: LocalDate): List<SnoozeChoice> {
    val max = snoozeMaxDays(settings)
    val saved = settings.optJSONObject("snooze")?.optJSONArray("intervals")
    val days = if (saved == null) DEFAULT_SNOOZE_INTERVALS else (0 until saved.length()).map { saved.optInt(it) }
    return days.filter { it in 1..max }.map { SnoozeChoice(it, snoozeIntervalLabel(it), today.plusDays(it.toLong())) }
}

/** "Tomorrow", "1 week", "2 months", "10 days". */
fun snoozeIntervalLabel(n: Int): String = when {
    n == 1 -> "Tomorrow"
    n % 30 == 0 && n <= 360 -> if (n == 30) "1 month" else "${n / 30} months"
    n % 7 == 0 && n < 30 -> if (n == 7) "1 week" else "${n / 7} weeks"
    else -> "$n days"
}

/** Whole days from today to [date]. */
fun snoozeDaysUntil(today: LocalDate, date: LocalDate): Int = ChronoUnit.DAYS.between(today, date).toInt()

/** "Wed 25 Nov · 1 week" (the name only when the date is one of the list's choices). */
fun snoozeWhenLabel(date: LocalDate, choices: List<SnoozeChoice>): String =
    dayLabel(date.toString()) + (choices.firstOrNull { it.date == date }?.let { " · ${it.label}" } ?: "")

/** What is already coming back on one day: hours (estimates) and points of tasks that wake then. */
data class SnoozeForecast(val hours: Double, val points: Double) {
    val none get() = hours == 0.0 && points == 0.0
}

/** The server's rows ({date, hours, points}) by date. */
fun parseSnoozeForecast(rows: JSONArray): Map<String, SnoozeForecast> =
    (0 until rows.length()).map { rows.getJSONObject(it) }.associate { it.getString("date") to SnoozeForecast(it.optDouble("hours"), it.optDouble("points")) }

/** "5h · 11 points", or null when nothing comes back (or the numbers are not known). */
fun alsoBackText(f: SnoozeForecast?): String? = f?.takeUnless { it.none }?.let { "${hrs(it.hours)} · ${num(it.points)} points" }

/** The yellow warning: a due date that falls before the task shows again. */
fun dueBeforeSnooze(due: LocalDate?, snooze: LocalDate?): Boolean = due != null && snooze != null && due.isBefore(snooze)

/** What a screen reader says for one row: "Tomorrow, Thu 19 Nov, 3h and 7 points coming back". */
fun snoozeRowDescription(c: SnoozeChoice, f: SnoozeForecast?): String {
    val head = "${c.label}, ${dayLabel(c.date.toString())}"
    return when {
        f == null -> head
        f.none -> "$head, nothing coming back"
        else -> "$head, ${hrs(f.hours)} and ${num(f.points)} points coming back"
    }
}

/** Asks the server for the forecast of these days; null when it cannot (the sheet then shows no numbers). */
suspend fun loadSnoozeForecast(dates: List<LocalDate>, excludeId: Long): Map<String, SnoozeForecast>? {
    if (dates.isEmpty()) return emptyMap()
    return try {
        parseSnoozeForecast(Api.arr("/snooze/forecast?dates=${dates.joinToString(",")}&exclude=$excludeId"))
    } catch (e: kotlinx.coroutines.CancellationException) {
        throw e
    } catch (e: Exception) {
        null
    }
}
