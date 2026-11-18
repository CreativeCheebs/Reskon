package com.aakash.jitterbug

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset

/** Which sheet or dialog is open on the planner. */
private sealed class Open {
    object Add : Open()
    object PickTask : Open()
    data class Event(val item: JSONObject?) : Open()
    data class Actions(val item: JSONObject) : Open()
    data class Reschedule(val item: JSONObject) : Open()
    data class MoveTo(val item: JSONObject) : Open()
    object Note : Open()
    object Available : Open()
    object Calendar : Open()
    data class Busy(val running: List<JSONObject>) : Open()
}

/**
 * Today (the Day Planner): the day's list of tasks and events with its totals, timers, Bring forward
 * and a note. GET /api/day/{date} and the planner routes, answered by the phone's own core, so all of
 * it works offline. Replaces the ceilings morning plan here; their data and the web API are unchanged.
 */
@Composable
fun TodayScreen(r: Route) {
    var date by remember { mutableStateOf(r.args["date"]?.let { LocalDate.parse(it) } ?: LocalDate.now()) }
    var open by remember { mutableStateOf<Open?>(null) }
    val day by loaded(date) { Api.obj("/day/$date") }
    val scope = rememberCoroutineScope()
    val host = rememberTaskActionHost()
    val d = day
    val iso = date.toString()
    val items = d?.objs("items").orEmpty()
    val timerList = d?.optJSONObject("timers")
    val timers = timerList?.objs("timers").orEmpty()
    val conflict = timerList?.optBoolean("conflict") == true
    val anyRunning = timers.any { it.optBoolean("running") }
    val now by rememberNow(timers.any { it.optBoolean("running") })
    val totals = d?.optJSONObject("plan_totals") ?: JSONObject()

    fun run(what: String, after: (() -> Unit)? = null, f: suspend () -> Unit) = scope.launch {
        attempt(what) { f(); App.changed(); after?.invoke() }
    }

    val cb = RowCallbacks(
        onLog = { i -> logFor(i, iso) },
        onStart = { i -> scope.launch { attempt("Timer not started") { when (val s = Planner.startTimer(iso, i)) {
            is Planner.Start.Started -> App.changed()
            is Planner.Start.Busy -> open = Open.Busy(s.running)
        } } } },
        onPause = { t -> run("Not paused") { Planner.pause(t.getLong("id")) } },
        onResume = { t -> scope.launch { attempt("Not resumed") { try { Planner.resume(t.getLong("id")); App.changed() } catch (e: ApiError) {
            if (e.status == 409) open = Open.Busy(e.body?.optJSONObject("current")?.objs("timers").orEmpty().filter { it.optBoolean("running") }) else throw e
        } } } },
        onStop = { t -> run("Not stopped") { Planner.stop(t.getLong("id")) } },
        onAction = { k, item ->
            when (k) {
                "log" -> logFor(item, iso)
                "open" -> App.go("task", "id" to item.getLong("task_id"))
                "edit" -> open = Open.Event(item)
                "move" -> open = Open.MoveTo(item)
                "reschedule" -> open = Open.Reschedule(item)
                "more" -> open = Open.Actions(item)
                "remove" -> run("Not removed") { Planner.remove(item.getLong("id")); App.say("Removed from this day") }
                "up", "down" -> {
                    val ids = items.map { it.getLong("id") }
                    val from = ids.indexOf(item.getLong("id"))
                    run("Not moved") { Planner.order(iso, reordered(ids, from, from + if (k == "up") -1 else 1)) }
                }
            }
        },
    )

    Box(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize()) {
            DateBar(date, { date = it }) { open = Open.Calendar }
            Column(
                Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(start = 14.dp, end = 14.dp, top = 4.dp, bottom = 96.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                if (d != null) {
                    Totals(totals, items.isNotEmpty()) { open = Open.Available }
                    TimerStrip(stripTimers(timers, conflict, items, iso), conflict, now, anyRunning, cb) { date = LocalDate.parse(it) }
                    Row(Modifier.fillMaxWidth().padding(horizontal = 10.dp, vertical = 2.dp)) {
                        T(planCountText(items), Palette.muted, 11.sp, modifier = Modifier.weight(1f))
                        T("All-time logged / estimate", Palette.muted, 11.sp)
                    }
                    Card {
                        if (items.isEmpty()) Column(Modifier.padding(12.dp)) {
                            T("Nothing planned for this day.", Palette.muted, 13.sp)
                            TextLink("Add to plan") { open = Open.Add }
                        }
                        items.forEachIndexed { i, item ->
                            if (i > 0) Line()
                            PlanLine(item, timers.firstOrNull { timerIsFor(it, item, iso) }, now, anyRunning, host, cb)
                        }
                    }
                    if (items.isNotEmpty()) T("Swipe for Log or Remove · press and hold for every action", Palette.muted, 11.sp, modifier = Modifier.padding(horizontal = 10.dp))
                    BringForward(iso, items) { App.changed() }
                    Row(Modifier.fillMaxWidth().heightIn(min = 44.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.note, Palette.muted, 18)
                        T(" Day note", Palette.fg, 15.sp, FontWeight.SemiBold, Modifier.weight(1f))
                        TextLink("Edit") { open = Open.Note }
                    }
                    val note = d.optJSONObject("plan")?.str("note").orEmpty()
                    Card(pad = 12.dp) { T(note.ifBlank { "No note for this day." }, Palette.muted, 13.sp) }
                }
            }
        }
        Fab("Add", Modifier.align(Alignment.BottomEnd).padding(16.dp)) { open = Open.Add }
    }
    TaskActionSheets(host)

    when (val o = open) {
        null -> {}
        Open.Add -> AddToPlanSheet({ open = null }, { open = Open.PickTask }, { open = Open.Event(null) })
        Open.PickTask -> TaskPicker({ open = null }, allowNone = false, createIn = 0L) { t ->
            open = null
            if (t != null) run("Not added") { Planner.addTask(iso, t.getLong("id")); App.say("Added to plan") }
        }
        is Open.Event -> EventSheet(o.item, { title, min, area ->
            open = null
            run("Not saved") {
                if (o.item == null) Planner.addEvent(iso, title, min, area) else Planner.editEvent(o.item.getLong("id"), title, min, area)
            }
        }) { open = null }
        is Open.Actions -> PlanActionsSheet(o.item, { open = null }) { k -> open = null; cb.onAction(k, o.item) }
        is Open.Reschedule -> RescheduleDialog(date, { to ->
            open = null
            // A task line moved to another day comes back with a new id: the day is read again, nothing keeps the old one.
            run("Not moved") { Planner.reschedule(o.item.getLong("id"), to.toString()); App.say("Moved to ${relDay(to.toString())}") }
        }) { open = null }
        is Open.MoveTo -> {
            val boot = App.boot
            if (boot != null) PickSheet("Move \"${o.item.optString("title")}\" to", boot.statuses.filter { it.id != o.item.id("status_id") }.map { it.id to it.name }, { open = null }) { sid ->
                open = null
                run("Not moved") { Planner.moveTask(o.item.getLong("task_id"), sid) }
            }
        }
        Open.Note -> NoteDialog(d?.optJSONObject("plan")?.str("note").orEmpty(), { v -> open = null; run("Not saved") { Planner.setNote(iso, v) } }) { open = null }
        Open.Available -> {
            val from = totals.str("available_from")
            MinutesDialog(
                "Time available", if (from == "day") "Set for this day only. Clear to use the ${date.dayOfWeek.name.lowercase().replaceFirstChar { it.uppercase() }} setting again." else
                    "For this day only. The usual time for each weekday is in Settings.",
                totals.num("available_min")?.toLong().takeIf { from == "day" }, "Use weekday's",
                { v -> open = null; run("Not saved") { Planner.setAvailable(iso, v) } }, { open = null },
            )
        }
        Open.Calendar -> CalendarDialog(date, { date = it; open = null }) { open = null }
        is Open.Busy -> TimerBusyDialog(o.running, now, { t -> open = null; run("Not stopped") { Planner.stop(t.getLong("id")) } }) { open = null }
    }
}

private fun logFor(item: JSONObject, iso: String) {
    if (item.optString("kind") == "event") App.go("log", "item" to item.getLong("id"), "label" to item.optString("title"), "date" to iso, "min" to (item.num("planned_min")?.toLong() ?: 30))
    else App.go("log", "task" to item.getLong("task_id"), "date" to iso)
}

@Composable
private fun DateBar(date: LocalDate, set: (LocalDate) -> Unit, onPick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().windowInsetsPadding(WindowInsets.statusBars).padding(horizontal = 8.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconButton(Icons.left, "Previous day", Palette.fg) { set(date.minusDays(1)) }
        Column(
            Modifier.weight(1f).clip(RoundedCornerShape(12.dp)).clickable(onClickLabel = "Open calendar") { onPick() }.padding(vertical = 2.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            val rel = relDay(date.toString())
            T(if (' ' !in rel) rel else date.dayOfWeek.getDisplayName(java.time.format.TextStyle.FULL, java.util.Locale.ENGLISH), Palette.fg, 20.sp, FontWeight.SemiBold)
            T(dayLabel(date.toString()), Palette.muted, 13.sp)
        }
        IconButton(Icons.right, "Next day", Palette.fg) { set(date.plusDays(1)) }
    }
}

/** The day's own totals (never a task's all-time ones): planned, logged, available. Tap Available to set this day's time. */
@Composable
private fun Totals(t: JSONObject, hasItems: Boolean, onAvailable: () -> Unit) {
    val over = t.optBoolean("over")
    val unest = t.optInt("unestimated")
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(Palette.panel)) {
        Cell("Planned", minText(t.optLong("planned_min")), Palette.fg, Modifier.weight(1f), if (unest > 0) "$unest without an estimate" else null)
        Cell("Logged today", minText(t.optLong("logged_min")), Palette.green, Modifier.weight(1f))
        Cell("Available", availableText(t), if (over) Palette.red else Palette.fg,
            Modifier.weight(1f).clickable(onClickLabel = "Set the time available") { onAvailable() },
            if (t.str("available_from") == "day") "this day" else null)
    }
}

@Composable
private fun Cell(label: String, value: String, color: androidx.compose.ui.graphics.Color, modifier: Modifier, note: String? = null) {
    Column(modifier.padding(horizontal = 8.dp, vertical = 5.dp).semantics(mergeDescendants = true) { contentDescription = "$label $value" + (note?.let { ", $it" } ?: "") }) {
        T(label, Palette.muted, 11.sp, oneLine = true)
        T(value, color, 15.sp, FontWeight.SemiBold)
        note?.let { T(it, Palette.subtle, 10.sp) }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CalendarDialog(date: LocalDate, onPick: (LocalDate) -> Unit, onDismiss: () -> Unit) {
    val state = rememberDatePickerState(initialSelectedDateMillis = date.atStartOfDay().toInstant(ZoneOffset.UTC).toEpochMilli())
    DatePickerDialog(
        onDismissRequest = onDismiss,
        confirmButton = {
            TextButton(onClick = { state.selectedDateMillis?.let { onPick(Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate()) } ?: onDismiss() }) { T("OK", Palette.accent, 15.sp, FontWeight.SemiBold) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { T("Cancel", Palette.muted, 15.sp) } },
    ) { DatePicker(state = state) }
}

@Composable
fun TextLink(text: String, color: androidx.compose.ui.graphics.Color = Palette.accent, onClick: () -> Unit) {
    Box(Modifier.clip(RoundedCornerShape(18.dp)).clickable(onClick = onClick).padding(horizontal = 12.dp, vertical = 8.dp)) {
        T(text, color, 14.sp, FontWeight.SemiBold)
    }
}
