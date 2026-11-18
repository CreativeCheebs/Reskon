package com.aakash.jitterbug

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.time.LocalDate

/** A session handed to the Log screen for editing (set by Sessions and Task). */
object Editing {
    var session: JSONObject? = null

    /** What a timer's Stop handed back, for the Log screen opened with the "draft" argument. */
    var timerDraft: JSONObject? = null
}

/**
 * The Log screen's first draft. Editing a session fills it from that session; "draft" is a stopped
 * timer's; "item" is a planner event (its title, its reserved minutes) so saving completes it.
 */
private fun startingDraft(r: Route, editing: JSONObject?): Draft {
    editing?.let { return Draft.of(it) }
    if (r.args["draft"] != null) Editing.timerDraft?.let { return Draft.ofTimer(it) }
    val date = r.args["date"]?.let { LocalDate.parse(it) } ?: LocalDate.now()
    r.long("item")?.let { item ->
        return Draft(
            kind = "event", dayItemId = item, label = r.args["label"] ?: "", loggedFor = date,
            hours = r.args["min"]?.toDoubleOrNull()?.let { it / 60 } ?: 1.0,
        )
    }
    return Draft(loggedFor = date, hours = 1.0)
}

/**
 * Log session, or edit one (route arg "session"). Points are worked out by
 * the Go core when it saves, never here.
 */
@Composable
fun LogScreen(r: Route) {
    val editing = remember { r.long("session")?.let { id -> Editing.session?.takeIf { it.getLong("id") == id } } }
    val fromTimer = r.args["draft"] != null && editing == null
    var d by remember { mutableStateOf(startingDraft(r, editing)) }
    var confirmDiscard by remember { mutableStateOf(false) }
    // Leaving a timer's draft without saving throws the counted time away: ask first.
    val leave: () -> Unit = { if (fromTimer) confirmDiscard = true else App.back() }
    if (fromTimer) androidx.activity.compose.BackHandler { confirmDiscard = true }
    if (confirmDiscard) androidx.compose.material3.AlertDialog(
        onDismissRequest = { confirmDiscard = false }, containerColor = Palette.raised,
        title = { T("Discard this time?", Palette.fg, 18.sp, androidx.compose.ui.text.font.FontWeight.SemiBold) },
        text = { T("The timer is stopped. Nothing has been saved, so this time is lost.", Palette.muted, 14.sp) },
        confirmButton = { androidx.compose.material3.TextButton({ Editing.timerDraft = null; App.back() }) { T("Discard", Palette.red, 15.sp, androidx.compose.ui.text.font.FontWeight.SemiBold) } },
        dismissButton = { androidx.compose.material3.TextButton({ confirmDiscard = false }) { T("Keep editing", Palette.fg, 15.sp) } },
    )
    var text by remember { mutableStateOf(durationText(d.hours)) }
    val scope = rememberCoroutineScope()

    // Opened from a task: fill in the task, its area and energy type.
    LaunchedEffect(Unit) {
        val id = r.long("task") ?: d.taskId ?: return@LaunchedEffect
        runCatching { Api.obj("/tasks/$id") }.getOrNull()?.let { t ->
            val fromTask = App.boot?.tagNames(t.tagIds()) ?: emptyList()
            d = d.copy(
                taskId = id, taskTitle = t.getString("title"), areaId = d.areaId ?: t.id("area_id"),
                // The task's tags follow the task; the session's own never repeat them.
                inheritedTags = fromTask, tags = d.tags.filter { n -> fromTask.none { it.equals(n, true) } },
                parts = d.parts.ifEmpty { t.id("energy_type_id")?.let { listOf(Part(it, 100, t.id("difficulty")?.toInt() ?: 2)) } ?: emptyList() },
            )
        }
    }

    // Save session, and the keyboard's Done / Enter in the single-line fields.
    var saving by remember { mutableStateOf(false) }
    val save: () -> Unit = {
        if (!saving) {
            saving = true // before launching, so a second tap in the same frame is ignored
            scope.launch {
                try {
                    attempt("Not saved") {
                        val s = if (editing != null) Api.patch("/sessions/${editing.getLong("id")}", d.body())
                        else Api.post("/sessions", d.body())
                        // A tag typed here may be new: read the lists again, or the next edit would not know it and drop it.
                        if (d.tags.isNotEmpty()) runCatching { App.reloadBoot() }
                        App.changed()
                        App.back()
                        App.say("Saved: ${hrs(s.optDouble("hours"))}, ${num(s.num("points"))} points")
                    }
                } finally {
                    saving = false
                }
            }
        }
    }
    val enterSaves: (() -> Unit) = { if (d.valid) save() }

    Column(Modifier.fillMaxSize()) {
        TopBar(if (editing != null) "Edit session" else "Log session", onBack = leave) {
            if (editing != null) TextLink("Delete", Palette.red) {
                scope.launch {
                    attempt("Not deleted") { Api.del("/sessions/${editing.getLong("id")}"); App.changed(); App.back(); App.say("Session deleted") }
                }
            }
        }
        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(start = 16.dp, end = 16.dp, top = 4.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            DurationCard(d, text, { text = it }, onDone = enterSaves) { d = it }
            SessionFields(d, onDone = enterSaves) { d = it }
        }
        BottomAction("Save session", enabled = d.valid, onClick = save)
    }
}
