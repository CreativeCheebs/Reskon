package com.aakash.jitterbug

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import org.json.JSONObject
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset

private fun actionIcon(k: String) = when (k) {
    "log" -> Icons.logTime
    "edit" -> Icons.pencil
    "open" -> Icons.openTask
    "move" -> Icons.moveTo
    "reschedule" -> Icons.calendar
    "up" -> Icons.up
    "down" -> Icons.down
    else -> Icons.trash
}

/** The hold menu of a line: every action, Remove last in red. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PlanActionsSheet(item: JSONObject, onDismiss: () -> Unit, onPick: (String) -> Unit) {
    val event = item.optString("kind") == "event"
    val detail = if (event) "Reserves ${minText(item.num("planned_min")?.toLong())}"
    else "Estimate ${minText(hoursToMin(item.num("estimate_h")))} · logged ${minText(hoursToMin(item.optDouble("logged_h")))} in all, ${minText(hoursToMin(item.optDouble("logged_day_h")))} on this day"
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), containerColor = Palette.raised) {
        Column(Modifier.verticalScroll(rememberScrollState()).padding(bottom = 24.dp)) {
            T(item.optString("title"), Palette.fg, 17.sp, FontWeight.SemiBold, Modifier.padding(horizontal = 20.dp).semantics { heading() }, oneLine = true)
            T(detail, Palette.muted, 13.sp, modifier = Modifier.padding(start = 20.dp, end = 20.dp, bottom = 8.dp))
            planActions(item).forEach { (k, label) ->
                val color: Color = if (k == "remove") Palette.red else Palette.fg
                if (k == "remove") Line()
                Row(
                    Modifier.fillMaxWidth().heightIn(min = 52.dp).clickable(role = Role.Button) { onPick(k) }.padding(horizontal = 20.dp),
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp),
                ) {
                    Icon(actionIcon(k), if (k == "remove") color else Palette.muted, 22)
                    T(label, color, 15.sp)
                }
            }
        }
    }
}

/** What to add: an existing or new task (the task picker), or an event. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddToPlanSheet(onDismiss: () -> Unit, onTask: () -> Unit, onEvent: () -> Unit) {
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), containerColor = Palette.raised) {
        Column(Modifier.padding(bottom = 24.dp)) {
            T("Add to plan", Palette.fg, 18.sp, FontWeight.SemiBold, Modifier.padding(start = 20.dp, bottom = 8.dp).semantics { heading() })
            listOf(Triple("A task", "Pick one, or create a new one", onTask), Triple("An event", "Reserve time for something that is not a task", onEvent)).forEach { (name, hint, go) ->
                Column(Modifier.fillMaxWidth().heightIn(min = 56.dp).clickable(role = Role.Button, onClick = go).padding(horizontal = 20.dp, vertical = 8.dp)) {
                    T(name, Palette.fg, 15.sp, FontWeight.Medium)
                    T(hint, Palette.muted, 13.sp)
                }
            }
        }
    }
}

/** Add an event to the day, or edit one: a name, the minutes it reserves, an optional area. */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun EventSheet(existing: JSONObject?, onSave: (title: String, minutes: Long, areaId: Long?) -> Unit, onDismiss: () -> Unit) {
    val boot = App.boot ?: return
    var title by remember { mutableStateOf(existing?.optString("title") ?: "") }
    var minutes by remember { mutableStateOf(existing?.num("planned_min")?.toLong()?.toString() ?: "30") }
    var area by remember { mutableStateOf(existing?.id("area_id")) }
    val mins = parseMinutes(minutes)
    val ok = title.isNotBlank() && mins != null && mins > 0
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), containerColor = Palette.raised) {
        Column(Modifier.padding(bottom = 16.dp)) {
            Column(Modifier.weight(1f, fill = false).verticalScroll(rememberScrollState()).padding(horizontal = 20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                T(if (existing == null) "Add event" else "Edit event", Palette.fg, 18.sp, FontWeight.SemiBold, Modifier.semantics { heading() })
                T("An event reserves time on the day. Log a session when it happens and it is complete.", Palette.muted, 13.sp)
                TextBox("Event name", title, "What is it?") { title = it }
                TextBox("Minutes reserved (e.g. 45 or 1h 30m)", minutes, "45") { minutes = it }
                if (mins == null || mins <= 0) T("Enter whole minutes (1 to 1440), or like 1h 30m.", Palette.red, 12.sp)
                SectionTitle("Area (optional)")
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    boot.areas.forEach { a -> Pill(a.name, area == a.id) { area = if (area == a.id) null else a.id } }
                }
            }
            BottomAction(if (existing == null) "Add event" else "Save event", enabled = ok) { onSave(title, mins ?: 0, area) }
        }
    }
}

/** Pick the day to move a line to. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RescheduleDialog(from: LocalDate, onPick: (LocalDate) -> Unit, onDismiss: () -> Unit) {
    val state = rememberDatePickerState(initialSelectedDateMillis = from.atStartOfDay().toInstant(ZoneOffset.UTC).toEpochMilli())
    DatePickerDialog(
        onDismissRequest = onDismiss,
        confirmButton = {
            TextButton(onClick = { state.selectedDateMillis?.let { onPick(Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate()) } }) { T("Move here", Palette.accent, 15.sp, FontWeight.SemiBold) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { T("Cancel", Palette.muted, 15.sp) } },
    ) { DatePicker(state = state) }
}

/** The day's note. */
@Composable
fun NoteDialog(initial: String, onSave: (String) -> Unit, onDismiss: () -> Unit) {
    var v by remember { mutableStateOf(initial) }
    AlertDialog(
        onDismissRequest = onDismiss, containerColor = Palette.raised,
        title = { T("Day note", Palette.fg, 18.sp, FontWeight.SemiBold) },
        text = { TextBox("Note for this day", v, single = false) { v = it } },
        confirmButton = { TextButton({ onSave(v) }) { T("Save note", Palette.accent, 15.sp, FontWeight.SemiBold) } },
        dismissButton = { TextButton(onDismiss) { T("Cancel", Palette.muted, 15.sp) } },
    )
}

/** A number of minutes to type; [onSave] gets null for "use the usual". Used for today's override and each weekday. */
@Composable
fun MinutesDialog(title: String, hint: String, initial: Long?, clearLabel: String, onSave: (Long?) -> Unit, onDismiss: () -> Unit) {
    var v by remember { mutableStateOf(initial?.toString() ?: "") }
    val parsed = parseMinutes(v)
    AlertDialog(
        onDismissRequest = onDismiss, containerColor = Palette.raised,
        title = { T(title, Palette.fg, 18.sp, FontWeight.SemiBold) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                T(hint, Palette.muted, 13.sp)
                TextBox("Minutes (0 for a day off; e.g. 480 or 8h)", v, "480") { v = it }
                if (v.isNotBlank() && parsed == null) T("Enter whole minutes (0 to 1440), or like 8h or 1h 30m.", Palette.red, 12.sp)
            }
        },
        confirmButton = { TextButton({ parsed?.let { onSave(it) } }, enabled = parsed != null) { T("Save", if (parsed != null) Palette.accent else Palette.subtle, 15.sp, FontWeight.SemiBold) } },
        dismissButton = { Row { TextButton({ onSave(null) }) { T(clearLabel, Palette.fg, 14.sp) }; TextButton(onDismiss) { T("Cancel", Palette.muted, 15.sp) } } },
    )
}

/** Starting a timer was refused because one runs: say so, and offer to stop it (its time goes to a draft to save). */
@Composable
fun TimerBusyDialog(running: List<JSONObject>, now: Instant, onStop: (JSONObject) -> Unit, onDismiss: () -> Unit) {
    val first = running.firstOrNull()
    AlertDialog(
        onDismissRequest = onDismiss, containerColor = Palette.raised,
        title = { T("A timer is already running", Palette.fg, 18.sp, FontWeight.SemiBold) },
        text = {
            T(if (first == null) "Another timer is running." else "\"${first.optString("title")}\" has run ${clockText(elapsedSeconds(first, now))}. Stop it to start another? Its time opens as a session to save.", Palette.muted, 14.sp)
        },
        confirmButton = { if (first != null) TextButton({ onStop(first) }) { T("Stop it", Palette.accent, 15.sp, FontWeight.SemiBold) } },
        dismissButton = { TextButton(onDismiss) { T("Leave it running", Palette.muted, 15.sp) } },
    )
}
