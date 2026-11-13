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
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.time.LocalDate

/** A session handed to the Log screen for editing (set by Sessions and Task). */
object Editing {
    var session: JSONObject? = null
}

/**
 * Log session, or edit one (route arg "session"). Points are worked out by
 * the Go core when it saves, never here.
 */
@Composable
fun LogScreen(r: Route) {
    val editing = remember { r.long("session")?.let { id -> Editing.session?.takeIf { it.getLong("id") == id } } }
    var d by remember {
        mutableStateOf(editing?.let { Draft.of(it) } ?: Draft(loggedFor = r.args["date"]?.let { LocalDate.parse(it) } ?: LocalDate.now(), hours = 1.0))
    }
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
        TopBar(if (editing != null) "Edit session" else "Log session", onBack = { App.back() }) {
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
