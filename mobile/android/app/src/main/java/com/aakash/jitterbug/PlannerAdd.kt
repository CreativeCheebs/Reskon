package com.aakash.jitterbug

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import org.json.JSONObject

/**
 * Pick a task to plan. Every row shows what the task has had against its estimate ("2h / 8h"), so you
 * can see what is left before choosing. Done and cancelled tasks are left out. "Create new task" is
 * the first row.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PlannerTaskPicker(onDismiss: () -> Unit, onPick: (JSONObject) -> Unit) {
    var query by remember { mutableStateOf("") }
    var creating by remember { mutableStateOf(false) }
    // The full list carries each task's estimate and logged hours (the brief one used by other pickers does not).
    val tasks by loaded { Api.arr("/tasks").objs() }
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), containerColor = Palette.raised) {
        Column(Modifier.fillMaxHeight(0.85f)) {
            T("Pick the ${Terms.task}", Palette.fg, 18.sp, FontWeight.SemiBold, Modifier.padding(start = 16.dp, end = 16.dp, bottom = 8.dp).semantics { heading() })
            OutlinedTextField(
                query, { query = it }, singleLine = true, modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
                leadingIcon = { Icon(Icons.search, Palette.muted, 20) }, placeholder = { T("Search ${Terms.tasks}", Palette.subtle) },
            )
            Spacer(Modifier.height(8.dp))
            val shown = tasks.orEmpty().filter {
                (query.isBlank() || it.optString("title").contains(query, true)) && it.optString("behaviour") !in setOf("cancelled", "done")
            }
            LazyColumn {
                item {
                    Box(Modifier.fillMaxWidth().heightIn(min = 48.dp).clickable(role = Role.Button) { creating = true }.padding(horizontal = 16.dp), contentAlignment = Alignment.CenterStart) {
                        T("+ Create new ${Terms.task}" + if (query.isNotBlank()) " “${query.trim()}”" else "", Palette.accent, 15.sp, FontWeight.Medium)
                    }
                }
                if (tasks != null && shown.isEmpty()) item { Empty("No open ${Terms.tasks} match.") }
                items(shown, key = { it.getLong("id") }) { t ->
                    Row(
                        Modifier.fillMaxWidth().heightIn(min = 48.dp).clickable(role = Role.Button) { onPick(t) }.padding(horizontal = 16.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        Column(Modifier.weight(1f)) {
                            T(t.optString("title"), Palette.fg, oneLine = true)
                            App.boot?.area(t.id("area_id"))?.let { T(it.name, Palette.subtle, 12.sp) }
                        }
                        // Logged in all / the task's one estimate.
                        T(pickerFigures(t), Palette.muted, 13.sp)
                    }
                }
            }
        }
    }
    if (creating) NewTaskSheet(query.trim(), null, onCreated = { onPick(it) }) { creating = false }
}

/**
 * After a task is chosen (or from a line's Edit plan): the time planned for it today (optional, never
 * taken from the task's estimate) and an optional name for this line, which starts as the task's title.
 * [onSave] gets the minutes (null: none) and the name to send (see [lineNameToSend]).
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun PlanLineSheet(
    taskTitle: String, initialName: String, initialMin: Long?, editing: Boolean, estimateHint: String?,
    onSave: (minutes: Long?, name: String?) -> Unit, onDismiss: () -> Unit,
) {
    var name by remember { mutableStateOf(initialName) }
    var minutes by remember { mutableStateOf(initialMin?.toString() ?: "") }
    val (valid, parsed) = plannedInput(minutes)
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), containerColor = Palette.raised) {
        Column(Modifier.padding(bottom = 16.dp)) {
            Column(Modifier.weight(1f, fill = false).verticalScroll(rememberScrollState()).padding(horizontal = 20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                T(if (editing) "Edit plan" else "Add to plan", Palette.fg, 18.sp, FontWeight.SemiBold, Modifier.semantics { heading() })
                T(taskTitle + (estimateHint?.let { " · $it all time" } ?: ""), Palette.muted, 13.sp)
                TextBox("Planned today (optional; e.g. 45 or 1h 30m)", minutes, "Leave empty for none") { minutes = it }
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("15m" to 15L, "30m" to 30L, "1h" to 60L, "2h" to 120L).forEach { (l, m) -> Pill(l, parsed == m) { minutes = m.toString() } }
                    if (minutes.isNotBlank()) Pill("None", action = true) { minutes = "" }
                }
                if (!valid) T("Enter whole minutes (0 to 1440), or like 1h 30m.", Palette.red, 12.sp)
                TextBox("Name for this line", name, taskTitle) { name = it }
                T("The line can have its own name, such as the part of the task you plan to do. The task keeps its own title.", Palette.subtle, 12.sp)
            }
            BottomAction(if (editing) "Save plan" else "Add to plan", enabled = valid) { onSave(parsed, lineNameToSend(name, taskTitle, editing)) }
        }
    }
}
