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
            d = d.copy(
                taskId = id, taskTitle = t.getString("title"), areaId = d.areaId ?: t.id("area_id"),
                parts = d.parts.ifEmpty { t.id("energy_type_id")?.let { listOf(Part(it, 100, t.id("difficulty")?.toInt() ?: 2)) } ?: emptyList() },
            )
        }
    }

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
            DurationCard(d, text, { text = it }) { d = it }
            SessionFields(d) { d = it }
        }
        BottomAction("Save session", enabled = d.valid) {
            scope.launch {
                attempt("Not saved") {
                    val s = if (editing != null) Api.patch("/sessions/${editing.getLong("id")}", d.body())
                    else Api.post("/sessions", d.body())
                    App.changed()
                    App.back()
                    App.say("Saved: ${hrs(s.optDouble("hours"))}, ${num(s.num("points"))} points")
                }
            }
        }
    }
}
