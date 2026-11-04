package com.aakash.jitterbug

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Switch
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject

// The settings the web app has and the first build of the phone lacked.
// Each saves through PUT /api/settings/{key}, the same as the web app, so
// they sync like any other setting.

private fun ids(a: JSONArray?): List<Long> = a?.let { (0 until it.length()).map { i -> it.getLong(i) } } ?: emptyList()
private fun strs(a: JSONArray?): List<String> = a?.let { (0 until it.length()).map { i -> it.getString(i) } } ?: emptyList()

/** Saves a setting and reloads the lookups, which carry the settings. */
suspend fun saveSetting(key: String, value: Any) {
    Api.put("/settings/$key", value)
    App.reloadBoot()
    App.changed()
}

@Composable
private fun SettingPage(title: String, content: @Composable () -> Unit) {
    Column(Modifier.fillMaxSize()) {
        TopBar(title, onBack = { App.back() })
        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(start = 16.dp, end = 16.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) { content() }
    }
}

@Composable
private fun SwitchRow(label: String, on: Boolean, onChange: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        T(label, Palette.fg, 15.sp, FontWeight.Medium, Modifier.weight(1f))
        Switch(on, onChange)
    }
}

/** Settings › Task dates: which statuses fill in start and end dates. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun TaskDatesScreen() {
    val boot = App.boot ?: return
    val scope = rememberCoroutineScope()
    val saved = boot.settings.optJSONObject("task_dates") ?: JSONObject()
    // Defaults as the web app: start on in progress, end on done or cancelled.
    val by = { b: Set<String> -> boot.statuses.filter { it.behaviour in b }.map { it.id } }
    val startAuto = saved.optBoolean("start_auto", true)
    val endAuto = saved.optBoolean("end_auto", true)
    val start = if (saved.has("start_statuses") && !saved.isNull("start_statuses")) ids(saved.optJSONArray("start_statuses")) else by(setOf("in_progress"))
    val end = if (saved.has("end_statuses") && !saved.isNull("end_statuses")) ids(saved.optJSONArray("end_statuses")) else by(setOf("done", "cancelled"))
    fun save(sa: Boolean = startAuto, s: List<Long> = start, ea: Boolean = endAuto, e: List<Long> = end) = scope.launch {
        attempt("Not saved") { saveSetting("task_dates", jsonOf("start_auto" to sa, "start_statuses" to JSONArray(s), "end_auto" to ea, "end_statuses" to JSONArray(e))) }
    }
    SettingPage("Task dates") {
        T("A move can fill in a task's start or end date. Dates set by hand are kept.", Palette.muted, 14.sp)
        Card(pad = 16.dp) {
            SwitchRow("Fill in the start date", startAuto) { save(sa = it) }
            if (startAuto) FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                boot.statuses.filter { it.behaviour == "todo" || it.behaviour == "in_progress" }.forEach { st ->
                    Pill(st.name, st.id in start, st.color) { save(s = if (st.id in start) start - st.id else start + st.id) }
                }
            }
        }
        Card(pad = 16.dp) {
            SwitchRow("Fill in the end date", endAuto) { save(ea = it) }
            if (endAuto) FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                boot.statuses.filter { it.behaviour == "done" || it.behaviour == "cancelled" }.forEach { st ->
                    Pill(st.name, st.id in end, st.color) { save(e = if (st.id in end) end - st.id else end + st.id) }
                }
            }
        }
        T("A move into a to-do or in-progress status clears an end date the rules filled in.", Palette.subtle, 13.sp)
    }
}

/** Settings › Snooze: the longest snooze, in days. */
@Composable
fun SnoozeSettingsScreen() {
    val boot = App.boot ?: return
    val scope = rememberCoroutineScope()
    var max by remember { mutableStateOf((boot.settings.optJSONObject("snooze")?.optInt("max_days", 30) ?: 30).toString()) }
    SettingPage("Snooze") {
        TextBox("Longest snooze (days)", max, keyboard = KeyboardType.Number) { max = it.filter(Char::isDigit).take(3) }
        T("From 1 to 365 days. Tasks already snoozed keep their date.", Palette.subtle, 13.sp)
        TextLink("Save") {
            val v = max.toIntOrNull()?.coerceIn(1, 365) ?: return@TextLink
            scope.launch { attempt("Not saved") { saveSetting("snooze", jsonOf("max_days" to v)); App.say("Saved") } }
        }
    }
}

private val COMPLETENESS = listOf(
    "start_date" to "Start date", "end_date" to "End date", "due_at" to "Due date", "estimate_h" to "Estimate (max time)",
    "difficulty" to "Intensity", "priority_id" to "Priority", "energy_type_id" to "Energy type", "description" to "Description", "epic_id" to "Epic",
)

/** Settings › Complete details: fields an open task should have. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun CompletenessScreen() {
    val boot = App.boot ?: return
    val scope = rememberCoroutineScope()
    val required = strs(boot.settings.optJSONObject("task_completeness")?.optJSONArray("required"))
    SettingPage("Complete details") {
        T("Open tasks missing any of these are listed as incomplete, and the task panel says what's missing.", Palette.muted, 14.sp)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            COMPLETENESS.forEach { (k, label) ->
                val on = k in required
                Pill(label, on, trailing = if (on) Icons.check else null) {
                    val next = COMPLETENESS.map { it.first }.filter { if (it == k) !on else it in required }
                    scope.launch { attempt("Not saved") { saveSetting("task_completeness", jsonOf("required" to JSONArray(next))) } }
                }
            }
        }
    }
}

private val CARD_ACTIONS = listOf("log" to "Log time", "snooze" to "Snooze", "note" to "Note", "move" to "Move to", "open" to "Open task", "delete" to "Delete")

/** Settings › Card actions: the web board's hover buttons (up to 3) and right-click menu. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun CardActionsScreen() {
    val boot = App.boot ?: return
    val scope = rememberCoroutineScope()
    val saved = boot.settings.optJSONObject("card_actions")
    val rail = saved?.optJSONArray("rail")?.let { strs(it) } ?: listOf("log", "snooze")
    val menu = saved?.optJSONArray("menu")?.let { strs(it) } ?: CARD_ACTIONS.map { it.first }
    fun save(r: List<String>, m: List<String>) = scope.launch {
        val order = CARD_ACTIONS.map { it.first }
        attempt("Not saved") { saveSetting("card_actions", jsonOf("rail" to JSONArray(order.filter { it in r }), "menu" to JSONArray(order.filter { it in m }))) }
    }
    SettingPage("Card actions") {
        T("What a card offers on the web board: buttons on a hovered card, and the right-click menu. On the phone, long-press a card to move it.", Palette.muted, 14.sp)
        SectionTitle("Buttons on a card · up to 3")
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            CARD_ACTIONS.forEach { (k, label) ->
                val on = k in rail
                Pill(label, on) {
                    if (on) save(rail - k, menu) else if (rail.size < 3) save(rail + k, menu) else App.say("Up to 3 buttons; the rest stay under More")
                }
            }
        }
        SectionTitle("Right-click menu")
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            CARD_ACTIONS.forEach { (k, label) -> Pill(label, k in menu) { save(rail, if (k in menu) menu - k else menu + k) } }
        }
    }
}

/** Settings › Reflection: week start and what Drift reads. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ReflectionScreen() {
    val boot = App.boot ?: return
    val scope = rememberCoroutineScope()
    val weekStart = boot.settings.optInt("week_start", 1)
    fun save(key: String, v: Any) = scope.launch { attempt("Not saved") { saveSetting(key, v) } }
    SettingPage("Reflection") {
        SectionTitle("Weeks start on")
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun").forEachIndexed { i, d -> Pill(d, weekStart == i + 1) { save("week_start", i + 1) } }
        }
        T("Every chart grouped by week follows this.", Palette.subtle, 13.sp)
        // Drift's settings are hidden until Drift is designed (next phase).
    }
}

/** Settings › Duplicate search: the model that matches tasks by meaning. */
@Composable
fun DuplicateSearchScreen() {
    val scope = rememberCoroutineScope()
    var status by remember { mutableStateOf<JSONObject?>(null) }
    LaunchedEffect(Unit) {
        while (true) {
            status = runCatching { Api.obj("/semantic") }.getOrNull()
            if (status?.optString("state") != "downloading") break
            delay(2000)
        }
    }
    SettingPage("Duplicate search") {
        T("Word matching always works. A small model, downloaded once and then run on this phone, adds matching by meaning.", Palette.muted, 14.sp)
        status?.let { s ->
            val state = s.optString("state")
            Card(pad = 16.dp) {
                T(s.optString("model"), Palette.fg, 15.sp, FontWeight.SemiBold)
                T(when (state) {
                    "ready" -> "Ready"
                    "downloading" -> "Downloading…"
                    "missing" -> "Not downloaded · ${s.optLong("download_bytes") / 1_000_000} MB"
                    "off" -> "Off on this build"
                    else -> "Error: ${s.optString("error")}"
                }, if (state == "ready") Palette.green else Palette.muted, 14.sp)
            }
            if (state == "missing" || state == "error") TextLink("Download the model") {
                scope.launch {
                    status = attempt("Download failed") { Api.post("/semantic/download") }
                    while (status?.optString("state") == "downloading") {
                        delay(2000)
                        status = runCatching { Api.obj("/semantic") }.getOrNull()
                    }
                }
            }
        }
    }
}

private val FIELD_TYPES = listOf("text", "int", "real", "date", "bool", "select")

/** Settings › Custom fields: extra fields on tasks and sessions. Key and type never change. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun CustomFieldsScreen() {
    val fields by loaded { Api.arr("/custom-fields").objs() }
    var editing by remember { mutableStateOf<JSONObject?>(null) }
    var adding by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    fun run(what: String, f: suspend () -> Unit) = scope.launch { attempt(what) { f(); App.reloadBoot(); App.changed() } }
    Box(Modifier.fillMaxSize()) {
        SettingPage("Custom fields") {
            listOf("task" to "On tasks", "session" to "On sessions").forEach { (entity, title) ->
                SectionTitle(title)
                Card {
                    val list = fields.orEmpty().filter { it.optString("entity") == entity && it.isNull("deleted_at") }
                    if (list.isEmpty()) T("None yet.", Palette.muted, 14.sp, modifier = Modifier.padding(16.dp))
                    list.forEachIndexed { i, f ->
                        if (i > 0) Line()
                        ListRow(f.optString("label"), "${f.optString("key")} · ${f.optString("type")}") { editing = f }
                    }
                }
            }
        }
        Fab("Add", Modifier.align(Alignment.BottomEnd).padding(16.dp)) { adding = true }
    }
    editing?.let { f ->
        var label by remember(f) { mutableStateOf(f.optString("label")) }
        var options by remember(f) { mutableStateOf(strs(f.optJSONArray("options")).joinToString(", ")) }
        AlertDialog(
            onDismissRequest = { editing = null }, containerColor = Palette.raised,
            title = { T("Edit field", Palette.fg, 18.sp, FontWeight.SemiBold) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    TextBox("Label", label) { label = it }
                    if (f.optString("type") == "select") TextBox("Choices, comma separated", options) { options = it }
                    T("Key ${f.optString("key")} and type ${f.optString("type")} can't change.", Palette.subtle, 12.sp)
                }
            },
            confirmButton = {
                TextButton({
                    editing = null
                    val body = jsonOf("label" to label.trim())
                    if (f.optString("type") == "select") body.put("options", JSONArray(options.split(",").map { it.trim() }.filter { it.isNotEmpty() }))
                    run("Not saved") { Api.patch("/custom-fields/${f.getLong("id")}", body) }
                }) { T("Save", Palette.accent, 15.sp, FontWeight.SemiBold) }
            },
            dismissButton = {
                Row {
                    TextButton({ editing = null; run("Not deleted") { Api.del("/custom-fields/${f.getLong("id")}") } }) { T("Delete", Palette.red, 15.sp) }
                    TextButton({ editing = null }) { T("Cancel", Palette.muted, 15.sp) }
                }
            },
        )
    }
    if (adding) {
        var entity by remember { mutableStateOf("task") }
        var label by remember { mutableStateOf("") }
        var type by remember { mutableStateOf("text") }
        var options by remember { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { adding = false }, containerColor = Palette.raised,
            title = { T("New field", Palette.fg, 18.sp, FontWeight.SemiBold) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Pill("Task", entity == "task") { entity = "task" }
                        Pill("Session", entity == "session") { entity = "session" }
                    }
                    TextBox("Label", label) { label = it }
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        FIELD_TYPES.forEach { t -> Pill(t, type == t, height = 32) { type = t } }
                    }
                    if (type == "select") TextBox("Choices, comma separated", options) { options = it }
                }
            },
            confirmButton = {
                TextButton({
                    adding = false
                    val key = label.trim().lowercase().replace(Regex("[^a-z0-9]+"), "_").trim('_')
                    val body = jsonOf("entity" to entity, "key" to key, "label" to label.trim(), "type" to type,
                        "options" to if (type == "select") JSONArray(options.split(",").map { it.trim() }.filter { it.isNotEmpty() }) else null)
                    run("Not added") { Api.post("/custom-fields", body) }
                }) { T("Add", Palette.accent, 15.sp, FontWeight.SemiBold) }
            },
            dismissButton = { TextButton({ adding = false }) { T("Cancel", Palette.muted, 15.sp) } },
        )
    }
}

/** A task's custom field values, in the task panel. Unknown keys are kept, never stripped. */
@Composable
fun TaskCustomFields(task: JSONObject, onSave: (JSONObject) -> Unit) {
    val fields by loaded { Api.arr("/custom-fields").objs().filter { it.optString("entity") == "task" && it.isNull("deleted_at") } }
    val list = fields.orEmpty()
    if (list.isEmpty()) return
    val custom = task.optJSONObject("custom") ?: JSONObject()
    var editing by remember { mutableStateOf<JSONObject?>(null) }
    SectionTitle("Custom fields")
    Card {
        list.forEachIndexed { i, f ->
            if (i > 0) Line()
            val k = f.optString("key")
            val v = if (custom.has(k) && !custom.isNull(k)) custom.get(k).toString() else "–"
            Row(Modifier.fillMaxWidth().clickable { editing = f }.padding(horizontal = 16.dp, vertical = 12.dp)) {
                T(f.optString("label"), Palette.muted, 14.sp, modifier = Modifier.weight(1f))
                T(v, Palette.fg, 15.sp, FontWeight.Medium)
            }
        }
    }
    editing?.let { f ->
        val k = f.optString("key")
        var v by remember(f) { mutableStateOf(if (custom.has(k) && !custom.isNull(k)) custom.get(k).toString() else "") }
        AlertDialog(
            onDismissRequest = { editing = null }, containerColor = Palette.raised,
            title = { T(f.optString("label"), Palette.fg, 18.sp, FontWeight.SemiBold) },
            text = {
                when (f.optString("type")) {
                    "bool" -> Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Pill("Yes", v == "true") { v = "true" }
                        Pill("No", v == "false") { v = "false" }
                    }
                    "select" -> Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        strs(f.optJSONArray("options")).forEach { o -> Pill(o, v == o) { v = o } }
                    }
                    else -> TextBox(if (f.optString("type") == "date") "YYYY-MM-DD" else "", v,
                        keyboard = if (f.optString("type") in setOf("int", "real")) KeyboardType.Decimal else KeyboardType.Text) { v = it }
                }
            },
            confirmButton = {
                TextButton({
                    editing = null
                    val value: Any? = when {
                        v.isBlank() -> null
                        f.optString("type") == "int" -> v.toLongOrNull()
                        f.optString("type") == "real" -> v.toDoubleOrNull()
                        f.optString("type") == "bool" -> v == "true"
                        else -> v
                    }
                    // The whole object goes back, so keys this phone doesn't know stay.
                    onSave(jsonOf("custom" to JSONObject(custom.toString()).put(k, value ?: JSONObject.NULL)))
                }) { T("Save", Palette.accent, 15.sp, FontWeight.SemiBold) }
            },
            dismissButton = { TextButton({ editing = null }) { T("Cancel", Palette.muted, 15.sp) } },
        )
    }
}
