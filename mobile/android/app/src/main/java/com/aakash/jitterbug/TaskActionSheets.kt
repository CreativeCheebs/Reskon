package com.aakash.jitterbug

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import org.json.JSONObject

/**
 * The sheets and dialogs a task row's actions open, for whichever one [host] says is pending. Put
 * once on a screen that has swipe rows. Each reuses what the task screen already does: the shared
 * snooze sheet, the move list, the description box and the delete question.
 */
@Composable
fun TaskActionSheets(host: TaskActionHost) {
    val scope = rememberCoroutineScope()
    val (key, t) = host.pending ?: return
    val boot = App.boot ?: return
    val id = t.getLong("id")
    val close = { host.pending = null }
    when (key) {
        "more" -> TaskMoreSheet(t.optString("title"), t.optString("type") == "epic", close) { host.run(it, t) }
        "continue" -> WhatsNextSheet(t, "continue", scope, close)
        "round" -> WhatsNextSheet(t, "round", scope, close)
        "snooze" -> TaskSnoozeSheet(id, scope, close)
        "move" -> PickSheet("Move \"${t.optString("title")}\" to", boot.statuses.filter { it.id != t.getLong("status_id") }.map { it.id to it.name }, close) { sid ->
            close()
            scope.launch { attempt("Not moved") { Api.post("/tasks/$id/move", jsonOf("status_id" to sid, "today" to today())); App.changed() } }
        }
        "note" -> {
            var v by remember(id) { mutableStateOf(t.str("description") ?: "") }
            AlertDialog(
                onDismissRequest = close, containerColor = Palette.raised,
                title = { T("Description", Palette.fg, 18.sp, FontWeight.SemiBold) },
                text = { TextBox("", v, single = false) { v = it } },
                confirmButton = {
                    TextButton({
                        close()
                        scope.launch { attempt("Not saved") { patchTask(t, jsonOf("description" to v.ifBlank { null })); App.changed() } }
                    }) { T("Save", Palette.accent, 15.sp, FontWeight.SemiBold) }
                },
                dismissButton = { TextButton(close) { T("Cancel", Palette.muted, 15.sp) } },
            )
        }
        "delete" -> DeleteTaskDialog(t.optInt("subtask_count"), close) { withSubtasks ->
            close()
            scope.launch {
                attempt("Not deleted") {
                    Api.del("/tasks/$id" + if (withSubtasks) "?subtasks=delete" else "")
                    App.changed(); App.say("${Terms.capTask} deleted")
                }
            }
        }
    }
}

/** Snooze until: the shared snooze sheet with Until unblocked and Wake up now, as on the task screen. [scope] must outlive the sheet. */
@Composable
fun TaskSnoozeSheet(id: Long, scope: kotlinx.coroutines.CoroutineScope, onDismiss: () -> Unit) {
    fun snooze(days: Int, untilUnblocked: Boolean = false) {
        onDismiss()
        scope.launch { attempt("Not snoozed") { snoozeTask(id, days, untilUnblocked); App.changed() } }
    }
    SnoozeSheet(
        id, onDismiss,
        extras = listOf(SnoozeExtra("Until unblocked") { snooze(0, true) }, SnoozeExtra("Wake up now") { snooze(0) }),
    ) { date -> snooze(snoozeDaysUntil(java.time.LocalDate.parse(today()), date)) }
}

/** "Delete this task?" Choosing says whether its [subtasks] go too. Shared by the task screen and the row actions. */
@Composable
fun DeleteTaskDialog(subtasks: Int, onDismiss: () -> Unit, onDelete: (withSubtasks: Boolean) -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss, containerColor = Palette.raised,
        title = { T("Delete this ${Terms.task}?", Palette.fg, 18.sp, FontWeight.SemiBold) },
        text = {
            T(if (subtasks == 0) "Its sessions stay, with no ${Terms.task}."
              else "It has $subtasks ${if (subtasks == 1) "subtask" else "subtasks"}. Delete ${if (subtasks == 1) "it" else "them"} too, or keep ${if (subtasks == 1) "it as its own ${Terms.task}" else "them as their own ${Terms.tasks}"}? Sessions stay either way.",
              Palette.muted, 14.sp)
        },
        confirmButton = {
            Column(horizontalAlignment = Alignment.End) {
                if (subtasks > 0) TextButton({ onDelete(true) }) { T("Delete with subtasks", Palette.red, 15.sp, FontWeight.SemiBold) }
                TextButton({ onDelete(false) }) { T(if (subtasks > 0) "Delete, keep subtasks" else "Delete", if (subtasks > 0) Palette.fg else Palette.red, 15.sp, FontWeight.SemiBold) }
            }
        },
        dismissButton = { TextButton(onDismiss) { T("Cancel", Palette.muted, 15.sp) } },
    )
}

/**
 * "More": every action, titled with the task, in the web right-click menu's order, then Continue
 * and Start next round (4.17; not for an [isEpic], which can't have rounds), Delete last in red
 * after a divider. The two are menu-only: they are not swipe actions or card-action settings.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TaskMoreSheet(title: String, isEpic: Boolean, onDismiss: () -> Unit, onPick: (String) -> Unit) {
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), containerColor = Palette.raised) {
        Column(Modifier.verticalScroll(rememberScrollState()).padding(bottom = 24.dp)) {
            T(title, Palette.fg, 17.sp, FontWeight.SemiBold, Modifier.padding(horizontal = 20.dp).padding(bottom = 8.dp).semantics { heading() }, oneLine = true)
            CARD_ACTIONS.filter { it.first != "delete" }.forEach { (k, label) -> MoreRow(k, label, Palette.fg, onPick) }
            MoreRow("continue", "Continue with a new ${Terms.task}…", Palette.fg, onPick)
            if (!isEpic) MoreRow("round", "Start next round", Palette.fg, onPick)
            Column(Modifier.padding(vertical = 4.dp)) { Line() }
            MoreRow("delete", CARD_ACTIONS.first { it.first == "delete" }.second, Palette.red, onPick)
        }
    }
}

@Composable
private fun MoreRow(key: String, label: String, color: androidx.compose.ui.graphics.Color, onPick: (String) -> Unit) {
    Row(
        Modifier.fillMaxWidth().heightIn(min = 52.dp).clickable(role = Role.Button) { onPick(key) }.padding(horizontal = 20.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Icon(taskActionIcon(key), if (key == "delete") color else Palette.muted, 22)
        T(label, color, 15.sp)
    }
}
