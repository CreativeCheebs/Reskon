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
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.produceState
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
private sealed class DayLoad {
    object Loading : DayLoad()
    data class Ok(val date: String, val day: JSONObject) : DayLoad()
    data class Failed(val date: String, val msg: String) : DayLoad()
}

private sealed class Open {
    object Add : Open()
    object PickTask : Open()
    data class Event(val item: JSONObject?) : Open()
    /** Planning a chosen task ([task], new line) or editing a task line ([item]). */
    data class PlanLine(val task: JSONObject?, val item: JSONObject?) : Open()
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
    var retry by remember { mutableIntStateOf(0) }
    val iso = date.toString()
    // The day shown is always the day asked for: changing date drops the old day's lines at once, and a failed read says so (with Retry) instead of leaving them.
    val load by produceState<DayLoad>(DayLoad.Loading, date, App.version, retry) {
        val before = value
        if (before !is DayLoad.Ok || before.date != iso) value = DayLoad.Loading
        value = try {
            DayLoad.Ok(iso, Api.obj("/day/$iso"))
        } catch (e: kotlinx.coroutines.CancellationException) {
            throw e
        } catch (e: Exception) {
            DayLoad.Failed(iso, e.message ?: "Could not load")
        }
    }
    val scope = rememberCoroutineScope()
    val host = rememberTaskActionHost()
    val d = (load as? DayLoad.Ok)?.takeIf { it.date == iso }?.day
    var discarding by remember { mutableStateOf<JSONObject?>(null) }
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
            if (e.status == 409) open = Open.Busy(Planner.runningFrom(e)) else throw e
        } } } },
        onStop = { t -> run("Not stopped") { Planner.stop(t.getLong("id")) } },
        onReview = { t -> Planner.review(t.getLong("id")) },
        onDiscard = { t -> discarding = t },
        onAction = { k, item ->
            when (k) {
                "log" -> logFor(item, iso)
                "open" -> App.go("task", "id" to item.getLong("task_id"))
                "edit" -> open = Open.Event(item)
                "plan" -> open = Open.PlanLine(null, item)
                "done", "undone" -> run("Not saved") { Planner.setDone(item.getLong("id"), k == "done") }
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
                if (load is DayLoad.Failed && d == null) {
                    Card(pad = 16.dp) {
                        T("This day could not be loaded: ${(load as DayLoad.Failed).msg}", Palette.red, 14.sp)
                        TextLink("Retry") { retry++ }
                    }
                }
                if (d != null) {
                    Totals(totals, date) { open = Open.Available }
                    TimerStrip(stripTimers(timers, conflict, items, iso), conflict, now, anyRunning, cb) { date = LocalDate.parse(it) }
                    Row(Modifier.fillMaxWidth().padding(horizontal = 10.dp, vertical = 2.dp)) {
                        T(planCountText(items), Palette.muted, 11.sp, modifier = Modifier.weight(1f))
                    }
                    Card {
                        if (items.isEmpty()) Column(Modifier.padding(12.dp)) {
                            T("Nothing planned for this day.", Palette.muted, 13.sp)
                            TextLink("Add to plan") { open = Open.Add }
                        }
                        items.forEachIndexed { i, item ->
                            // Keyed by the line's id, so swipe and focus state stay with the line when the list changes.
                            key(item.getLong("id")) {
                                if (i > 0) Line()
                                // A running timer for the line wins over a stopped one waiting for review.
                                val mine = timers.filter { timerIsFor(it, item, iso) }.minByOrNull { if (isPending(it)) 1 else 0 }
                                PlanLine(item, mine, now, anyRunning, host, cb)
                            }
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
    discarding?.let { t ->
        androidx.compose.material3.AlertDialog(
            onDismissRequest = { discarding = null }, containerColor = Palette.raised,
            title = { T("Discard this time?", Palette.fg, 18.sp, FontWeight.SemiBold) },
            text = { T("\"${t.optString("title")}\": the time counted (${clockText(elapsedSeconds(t, now))}) is thrown away and nothing is saved.", Palette.muted, 14.sp) },
            confirmButton = { TextButton({ discarding = null; run("Not discarded") { Planner.discard(t.getLong("id")) } }) { T("Discard time", Palette.red, 15.sp, FontWeight.SemiBold) } },
            dismissButton = { TextButton({ discarding = null }) { T("Keep it", Palette.fg, 15.sp) } },
        )
    }

    when (val o = open) {
        null -> {}
        Open.Add -> AddToPlanSheet({ open = null }, { open = Open.PickTask }, { open = Open.Event(null) })
        Open.PickTask -> PlannerTaskPicker({ open = null }) { t -> open = Open.PlanLine(t, null) }
        is Open.PlanLine -> {
            val line = o.item
            val taskTitle = o.task?.optString("title") ?: line?.str("task_title") ?: line?.optString("title").orEmpty()
            PlanLineSheet(
                taskTitle = taskTitle,
                initialName = if (line != null) lineTitle(line) else taskTitle,
                initialMin = line?.num("planned_min")?.toLong(),
                editing = line != null,
                estimateHint = (o.task ?: line)?.let { pickerFigures(it) },
                onSave = { min, name ->
                    open = null
                    if (line == null) run("Not added") { Planner.addTask(iso, o.task!!.getLong("id"), min, name); App.say("Added to plan") }
                    else run("Not saved") { Planner.editLine(line.getLong("id"), min, name.orEmpty()) }
                },
                onDismiss = { open = null },
            )
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
    val planned = item.num("planned_min")?.toLong()
    if (isEvent(item)) App.go("log", "item" to item.getLong("id"), "kind" to "event", "label" to lineTitle(item), "date" to iso, "min" to (planned ?: 30))
    else {
        // A task line: the session is tied to the line; a renamed line's name starts the description.
        val args = mutableListOf<Pair<String, Any>>("task" to item.getLong("task_id"), "item" to item.getLong("id"), "kind" to "task", "date" to iso)
        if (item.optBoolean("renamed")) args += "label" to lineTitle(item)
        planned?.let { args += "min" to it }
        App.go("log", *args.toTypedArray())
    }
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
private fun Totals(t: JSONObject, shown: LocalDate, onAvailable: () -> Unit) {
    val over = isOver(t)
    val unest = t.optInt("unestimated")
    val today = LocalDate.now()
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(Palette.panel)) {
        Cell(totalLabel("Planned", shown, today), minText(t.optLong("planned_min")), Palette.fg, Modifier.weight(1f), if (unest > 0) "$unest without planned time" else null)
        Cell(totalLabel("Logged", shown, today), minText(t.optLong("logged_min")), Palette.green, Modifier.weight(1f))
        // Free time as the server works it out; a negative one is shown as "over" in the warning colour.
        Cell("Available", freeText(t), if (over) Palette.yellow else Palette.fg,
            Modifier.weight(1f).clickable(onClickLabel = "Set the time available") { onAvailable() }, availableNote(t))
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
