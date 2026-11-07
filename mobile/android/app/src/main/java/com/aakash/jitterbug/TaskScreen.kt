package com.aakash.jitterbug

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.time.LocalDate

/**
 * PATCH a task with its updated_at. On a 409 (changed elsewhere since it
 * was read) the same change is sent again on top of the current version,
 * as the web app's patchWithRetry does.
 */
suspend fun patchTask(t: JSONObject, changes: JSONObject): JSONObject {
    val id = t.getLong("id")
    return try {
        Api.patch("/tasks/$id", JSONObject(changes.toString()).put("updated_at", t.getString("updated_at")))
    } catch (e: ApiError) {
        val cur = e.body?.optJSONObject("current")
        if (e.status != 409 || cur == null) throw e
        Api.patch("/tasks/$id", JSONObject(changes.toString()).put("updated_at", cur.getString("updated_at")))
    }
}

/** The task panel: the only place the task key is shown. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun TaskScreen(r: Route) {
    val id = r.long("id") ?: return
    val boot = App.boot ?: return
    val data by loaded(id) {
        EpicNames.load()
        Triple(Api.obj("/tasks/$id"), Api.arr("/tasks?parent=$id").objs(), Api.arr("/sessions?task_id=$id").objs())
    }
    var sheet by remember { mutableStateOf<String?>(null) }
    var editText by remember { mutableStateOf<Pair<String, String>?>(null) }
    var confirmDelete by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val (t, subtasks, sessions) = data ?: return
    fun change(body: JSONObject) = scope.launch { attempt("Not saved") { patchTask(t, body); App.changed() } }
    fun move(statusId: Long) = scope.launch {
        attempt("Not moved") { Api.post("/tasks/$id/move", jsonOf("status_id" to statusId, "today" to today())); App.changed() }
    }

    Column(Modifier.fillMaxSize()) {
        TopBar(t.optString("key"), onBack = { App.back() }) {
            IconButton(Icons.snooze, "Snooze") { sheet = "snooze" }
            IconButton(Icons.dots, "More actions") { sheet = "actions" }
        }
        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(start = 16.dp, end = 16.dp, top = 4.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            T(t.optString("title"), Palette.fg, 22.sp, FontWeight.SemiBold, Modifier.clickable { editText = "title" to t.optString("title") })
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                val s = boot.status(t.id("status_id"))
                Row(
                    Modifier.height(36.dp).clip(RoundedCornerShape(18.dp)).background((s?.color ?: Palette.accent).copy(alpha = 0.2f))
                        .clickable { sheet = "status" }.padding(horizontal = 14.dp),
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    T(s?.name ?: "?", s?.color ?: Palette.fg, 14.sp, FontWeight.SemiBold)
                    Icon(Icons.down, s?.color ?: Palette.fg, 16)
                }
                T("⧗ ${age(t.num("time_in_status_h"))} in this status", Palette.muted, 13.sp)
            }
            if (t.optBoolean("snoozed")) T("Snoozed until ${dayLabel(t.str("snoozed_until"))}", Palette.yellow, 13.sp)
            if (t.optBoolean("blocked")) T("Blocked by an open task", Palette.yellow, 13.sp)
            if (t.strs("missing").isNotEmpty()) T("Missing: ${t.strs("missing").joinToString(", ")}", Palette.yellow, 13.sp)

            // Progress, all from the server: logged, estimate, remaining, pace.
            if (t.num("estimate_h") != null) Card(pad = 16.dp) {
                // Over the estimate, the bar turns red and says by how much.
                val over = (t.num("remaining_h") ?: 0.0) < 0
                Row {
                    T("${hm(t.optDouble("logged_h"))} of ${hm(t.num("estimate_h"))}", Palette.fg, 15.sp, FontWeight.SemiBold, Modifier.weight(1f))
                    if (over) T("${hm(-(t.num("remaining_h") ?: 0.0))} over (${Math.round(t.num("progress_pct") ?: 0.0)}%)", Palette.red, 14.sp, FontWeight.SemiBold)
                    else T("${hm(t.num("remaining_h"))} left", Palette.muted, 14.sp)
                }
                Gap(8)
                BoxWithConstraints(Modifier.fillMaxWidth().height(6.dp).clip(RoundedCornerShape(3.dp)).background(Palette.dim)) {
                    Box(Modifier.width(maxWidth * ((t.num("progress_pct") ?: 0.0) / 100).toFloat().coerceIn(0f, 1f)).fillMaxHeight().background(if (over) Palette.red else Palette.accent))
                }
                t.str("due_at")?.let { due ->
                    Gap(8)
                    T("Due ${dayLabel(due)}" + (t.num("pace_h")?.let { " · about ${hm(it)} a day to finish in time" } ?: ""), Palette.muted, 13.sp)
                }
            }

            Card {
                val fields = listOf(
                    Triple("Epic", t.id("epic_id")?.let { EpicNames.of(it) ?: "#$it" } ?: "None", Palette.purple.takeIf { t.id("epic_id") != null }) to "epic",
                    Triple("Area", boot.area(t.id("area_id"))?.name ?: "–", boot.area(t.id("area_id"))?.color) to "area",
                    Triple("Energy type", boot.type(t.id("energy_type_id"))?.name ?: "–", boot.type(t.id("energy_type_id"))?.color) to "type",
                    Triple("Priority", boot.priority(t.id("priority_id"))?.name ?: "–", boot.priority(t.id("priority_id"))?.color) to "priority",
                    Triple("Intensity", t.id("difficulty")?.let { "$it · ${INTENSITY[(it - 1).toInt()]}" } ?: "–", t.id("difficulty")?.let { Palette.intensity[(it - 1).toInt()] }) to "difficulty",
                    Triple("Estimate", t.num("estimate_h")?.let { hrs(it) } ?: "–", null) to "estimate",
                    Triple("Start – end", if (t.str("start_date") == null && t.str("end_date") == null) "–" else "${shortDate(t.str("start_date")).ifEmpty { "…" }} – ${shortDate(t.str("end_date")).ifEmpty { "…" }}", null) to "dates",
                    Triple("Due", t.str("due_at")?.let { dayLabel(it) } ?: "–", null) to "due",
                )
                fields.forEachIndexed { i, (f, key) ->
                    if (i > 0) Line()
                    Row(Modifier.fillMaxWidth().clickable { if (key == "estimate") editText = "estimate_h" to (t.num("estimate_h")?.let { num(it) } ?: "") else sheet = key }.padding(horizontal = 16.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                        T(f.first, Palette.muted, 14.sp, modifier = Modifier.weight(1f))
                        f.third?.let { Dot(it); HGap(6) }
                        T(f.second, Palette.fg, 15.sp, FontWeight.Medium)
                    }
                }
            }

            T(t.str("description") ?: "+ Add a description", if (t.str("description") == null) Palette.accent else Palette.fg, 15.sp,
                modifier = Modifier.clickable { editText = "description" to (t.str("description") ?: "") })

            TaskCustomFields(t) { change(it) }

            if (t.optString("type") != "epic") {
                SectionTitle("Subtasks · ${t.optInt("subtask_done")} of ${t.optInt("subtask_count")}")
                Card {
                    subtasks.forEachIndexed { i, s ->
                        if (i > 0) Line()
                        val done = s.optString("behaviour") == "done"
                        Row(Modifier.fillMaxWidth().clickable {
                            // Branch on behaviour, never on a status name.
                            val target = boot.statuses.firstOrNull { it.behaviour == if (done) "todo" else "done" }
                            target?.let { st -> scope.launch { attempt("Not moved") { Api.post("/tasks/${s.getLong("id")}/move", jsonOf("status_id" to st.id, "today" to today())); App.changed() } } }
                        }.padding(horizontal = 16.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            Box(
                                Modifier.size(20.dp).clip(RoundedCornerShape(5.dp)).background(if (done) Palette.accent else Color.Transparent)
                                    .border(2.dp, if (done) Palette.accent else Palette.strong, RoundedCornerShape(5.dp)),
                                contentAlignment = Alignment.Center,
                            ) { if (done) Icon(Icons.check, Palette.onAccent, 14, 3f) }
                            T(s.optString("title"), if (done) Palette.subtle else Palette.fg, 15.sp, strike = done,
                                modifier = Modifier.weight(1f).clickable { App.go("task", "id" to s.getLong("id")) })
                        }
                    }
                    if (subtasks.isNotEmpty()) Line()
                    TextLink("+ Add a subtask") { editText = "subtask" to "" }
                }
            }

            SectionTitle("Dependencies")
            Card(pad = 0.dp) {
                (t.objs("blocks").map { "Blocks" to it } + t.objs("blocked_by").map { "Blocked by" to it }).forEach { (rel, o) ->
                    Row(Modifier.fillMaxWidth().clickable { App.go("task", "id" to o.getLong("id")) }.padding(start = 16.dp, end = 4.dp, top = 4.dp, bottom = 4.dp),
                        verticalAlignment = Alignment.CenterVertically) {
                        T(rel, Palette.muted, 14.sp)
                        T(" · ${o.optString("title")}", Palette.fg, 14.sp, modifier = Modifier.weight(1f), oneLine = true)
                        IconButton(Icons.close, "Remove link", Palette.subtle, 40) {
                            scope.launch { attempt("Not removed") { Api.del("/task-links/${o.getLong("link_id")}"); App.changed() } }
                        }
                    }
                    Line()
                }
                TextLink("+ Blocked by…") { sheet = "blocker" }
            }

            SectionTitle("Figures")
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf(
                    "Points" to num(t.num("points")),
                    "Logged" to hrs(t.optDouble("logged_h")),
                    *(if (t.optInt("subtask_count") > 0) arrayOf("With subtasks" to hrs(t.optDouble("logged_total_h"))) else emptyArray()),
                    "First started" to (t.str("first_started_at")?.let { shortDate(it) } ?: "–"),
                    "Created" to "${age(t.num("created_age_h"))} ago",
                    "Started age" to age(t.num("started_age_h")),
                ).chunked(3).let { rows ->
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        rows.forEach { row ->
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                row.forEach { (l, v) ->
                                    Card(Modifier.weight(1f), radius = 12.dp, pad = 12.dp) {
                                        T(l, Palette.muted, 12.sp)
                                        T(v, Palette.fg, 17.sp, FontWeight.SemiBold)
                                    }
                                }
                                repeat(3 - row.size) { Box(Modifier.weight(1f)) }
                            }
                        }
                    }
                }
            }

            SectionTitle("Sessions on this task")
            Card {
                if (sessions.isEmpty()) T("No time logged yet.", Palette.muted, 14.sp, modifier = Modifier.padding(16.dp))
                sessions.forEachIndexed { i, s ->
                    if (i > 0) Line()
                    Row(Modifier.fillMaxWidth().clickable { Editing.session = s; App.go("log", "session" to s.getLong("id")) }.padding(horizontal = 16.dp, vertical = 12.dp)) {
                        Column(Modifier.weight(1f)) {
                            T(s.str("label") ?: s.str("note") ?: "Session", Palette.fg, 15.sp, FontWeight.Medium)
                            T(relDay(s.getString("logged_for")) + (s.str("started_at")?.let { ", " + java.time.Instant.parse(it).atZone(java.time.ZoneId.systemDefault()).toLocalTime().toString().take(5) } ?: ""), Palette.muted, 13.sp)
                        }
                        T(hrs(s.optDouble("hours")), Palette.fg, 15.sp, FontWeight.SemiBold)
                    }
                }
            }
        }
        BottomAction("Log time on this task") { App.go("log", "task" to id) }
    }

    when (sheet) {
        "status" -> PickSheet("Status", boot.statuses.map { it.id to it.name }, { sheet = null }) { sheet = null; move(it) }
        "area" -> PickSheet("Area", boot.areas.map { it.id to it.name }, { sheet = null }) { sheet = null; change(jsonOf("area_id" to it)) }
        "type" -> PickSheet("Energy type", listOf(0L to "None") + boot.energyTypes.map { it.id to it.name }, { sheet = null }) { sheet = null; change(jsonOf("energy_type_id" to it.takeIf { it > 0 })) }
        "priority" -> PickSheet("Priority", listOf(0L to "None") + boot.priorities.map { it.id to it.name }, { sheet = null }) { sheet = null; change(jsonOf("priority_id" to it.takeIf { it > 0 })) }
        "difficulty" -> PickSheet("Intensity", listOf(0L to "None") + (1..5).map { it.toLong() to "$it · ${INTENSITY[it - 1]}" }, { sheet = null }) { sheet = null; change(jsonOf("difficulty" to it.takeIf { it > 0 })) }
        "epic" -> {
            val epics by loaded { Api.arr("/tasks?type=epic").objs() }
            PickSheet("Epic", listOf(0L to "None") + epics.orEmpty().filter { it.getLong("id") != id }.map { it.getLong("id") to it.getString("title") }, { sheet = null }) {
                sheet = null; change(jsonOf("epic_id" to it.takeIf { it > 0 }))
            }
        }
        "due" -> DateDialog(t.str("due_at")?.let { LocalDate.parse(it.take(10)) }, { sheet = null }, "No due date", { change(jsonOf("due_at" to null)) }) { change(jsonOf("due_at" to it.toString())) }
        "dates" -> DateDialog(t.str("start_date")?.let { LocalDate.parse(it) }, { sheet = "dates2" }, "No start", { change(jsonOf("start_date" to null)) }) { change(jsonOf("start_date" to it.toString())) }
        "dates2" -> DateDialog(t.str("end_date")?.let { LocalDate.parse(it) }, { sheet = null }, "No end", { change(jsonOf("end_date" to null)) }) { change(jsonOf("end_date" to it.toString())) }
        "snooze" -> PickSheet("Snooze", listOf(1L to "1 day", 3L to "3 days", 7L to "1 week", -1L to "Until unblocked", 0L to "Wake up now"), { sheet = null }) { v ->
            sheet = null
            scope.launch {
                attempt("Not snoozed") {
                    snoozeTask(id, v.coerceAtLeast(0).toInt(), v == -1L)
                    App.changed()
                }
            }
        }
        "actions" -> PickSheet("Task", listOf(1L to "Log time", 2L to "Delete task"), { sheet = null }) {
            sheet = null
            if (it == 1L) App.go("log", "task" to id) else confirmDelete = true
        }
        "blocker" -> TaskPicker(onDismiss = { sheet = null }, allowNone = false) { o ->
            sheet = null
            o?.let { scope.launch { attempt("Not linked") { Api.post("/task-links", jsonOf("blocker_id" to it.getLong("id"), "blocked_id" to id)); App.changed() } } }
        }
    }
    editText?.let { (field, initial) ->
        var v by remember(field) { mutableStateOf(initial) }
        AlertDialog(
            onDismissRequest = { editText = null }, containerColor = Palette.raised,
            title = { T(when (field) { "title" -> "Title"; "estimate_h" -> "Estimate (hours)"; "subtask" -> "New subtask"; else -> "Description" }, Palette.fg, 18.sp, FontWeight.SemiBold) },
            text = { TextBox("", v, single = field != "description", keyboard = if (field == "estimate_h") KeyboardType.Decimal else KeyboardType.Text) { v = it } },
            confirmButton = {
                TextButton({
                    editText = null
                    if (field == "subtask") {
                        if (v.isNotBlank()) scope.launch {
                            attempt("Not added") { Api.post("/tasks", jsonOf("title" to v.trim(), "area_id" to t.id("area_id"), "parent_id" to id, "today" to today())); App.changed() }
                        }
                        return@TextButton
                    }
                    change(jsonOf(field to when (field) {
                        "estimate_h" -> parseHours(v)
                        "description" -> v.ifBlank { null }
                        else -> v.trim()
                    }))
                }) { T("Save", Palette.accent, 15.sp, FontWeight.SemiBold) }
            },
            dismissButton = { TextButton({ editText = null }) { T("Cancel", Palette.muted, 15.sp) } },
        )
    }
    if (confirmDelete) {
        val subs = t.optInt("subtask_count")
        fun delete(withSubtasks: Boolean) {
            confirmDelete = false
            scope.launch {
                attempt("Not deleted") {
                    Api.del("/tasks/$id" + if (withSubtasks) "?subtasks=delete" else "")
                    App.changed(); App.back(); App.say("Task deleted")
                }
            }
        }
        AlertDialog(
            onDismissRequest = { confirmDelete = false }, containerColor = Palette.raised,
            title = { T("Delete this task?", Palette.fg, 18.sp, FontWeight.SemiBold) },
            text = {
                T(if (subs == 0) "Its sessions stay, without a task."
                  else "It has $subs ${if (subs == 1) "subtask" else "subtasks"}. Delete ${if (subs == 1) "it" else "them"} too, or keep ${if (subs == 1) "it as a normal task" else "them as normal tasks"}? Sessions stay either way.",
                  Palette.muted, 14.sp)
            },
            confirmButton = {
                Column(horizontalAlignment = Alignment.End) {
                    if (subs > 0) TextButton({ delete(true) }) { T("Delete with subtasks", Palette.red, 15.sp, FontWeight.SemiBold) }
                    TextButton({ delete(false) }) { T(if (subs > 0) "Delete, keep subtasks" else "Delete", if (subs > 0) Palette.fg else Palette.red, 15.sp, FontWeight.SemiBold) }
                }
            },
            dismissButton = { TextButton({ confirmDelete = false }) { T("Cancel", Palette.muted, 15.sp) } },
        )
    }
}

/** New task: POST /api/tasks. Opened from the board's + button. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun NewTaskScreen(r: Route) {
    val boot = App.boot ?: return
    val view = boot.views.firstOrNull { it.id == r.long("view") }
    val viewAreas = view?.raw?.optJSONObject("filter")?.optJSONArray("areas")?.let { a -> (0 until a.length()).map { a.getLong(it) } }
    var title by remember { mutableStateOf("") }
    var area by remember { mutableStateOf(viewAreas?.firstOrNull() ?: boot.areas.first().id) }
    var type by remember { mutableStateOf<Long?>(null) }
    var priority by remember { mutableStateOf<Long?>(null) }
    var difficulty by remember { mutableStateOf<Int?>(null) }
    var estimate by remember { mutableStateOf("") }
    var due by remember { mutableStateOf<LocalDate?>(null) }
    var epic by remember { mutableStateOf(false) }
    var pickDue by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    Column(Modifier.fillMaxSize()) {
        TopBar("New task", onBack = { App.back() })
        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(start = 16.dp, end = 16.dp, top = 4.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            TextBox("Title", title, "What needs doing?") { title = it }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Pill("Task", !epic) { epic = false }
                Pill("Epic", epic) { epic = true }
            }
            SectionTitle("Area")
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                boot.areas.forEach { a -> Pill(a.name, area == a.id) { area = a.id } }
            }
            SectionTitle("Energy type")
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                boot.energyTypes.forEach { t -> Pill(t.name, type == t.id, t.color) { type = if (type == t.id) null else t.id } }
            }
            SectionTitle("Priority")
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                boot.priorities.forEach { p -> Pill(p.name, priority == p.id, p.color) { priority = if (priority == p.id) null else p.id } }
            }
            SectionTitle("Intensity")
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                (1..5).forEach { n -> Box(Modifier.weight(1f)) { Pill(n.toString(), difficulty == n, Palette.intensity[n - 1]) { difficulty = if (difficulty == n) null else n } } }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Box(Modifier.weight(1f)) { TextBox("Estimate", estimate, "e.g. 2h", keyboard = KeyboardType.Text) { estimate = it } }
                FieldBox("Due", due?.let { dayLabel(it.toString()) } ?: "–", Modifier.weight(1f)) { pickDue = true }
            }
        }
        BottomAction("Create task", enabled = title.isNotBlank()) {
            scope.launch {
                attempt("Not created") {
                    val t = Api.post("/tasks", jsonOf(
                        "title" to title.trim(), "area_id" to area, "type" to if (epic) "epic" else "task", "energy_type_id" to type,
                        "priority_id" to priority, "difficulty" to difficulty, "estimate_h" to parseHours(estimate),
                        "due_at" to due?.toString(), "today" to today(),
                    ))
                    App.changed()
                    App.back()
                    App.go("task", "id" to t.getLong("id"))
                }
            }
        }
    }
    if (pickDue) DateDialog(due, { pickDue = false }, "No due date", { due = null }) { due = it }
}
