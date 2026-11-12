package com.aakash.jitterbug

import android.content.Context
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import org.json.JSONObject

// ---------------------------------------------------------------- More

@Composable
fun MoreScreen() {
    val boot = App.boot ?: return
    val ctx = LocalContext.current
    val sync = remember { Sync.state(ctx) }
    val inForce by loaded { Api.arr("/states").objs().count { it.optBoolean("in_force") && !it.optBoolean("ended") } }
    val scope = rememberCoroutineScope()
    Column(Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.statusBars).verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Card {
            Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                Box(Modifier.size(44.dp).clip(CircleShape).background(Palette.selected), contentAlignment = Alignment.Center) {
                    T((sync.username ?: "Me").take(1).uppercase(), Palette.accentFg, 18.sp, FontWeight.SemiBold)
                }
                Column(Modifier.weight(1f)) {
                    T(sync.username ?: "On this phone", Palette.fg, 16.sp, FontWeight.SemiBold)
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Dot(if (sync.server == null) Palette.subtle else if (sync.error == null) Palette.green else Palette.yellow)
                        T(sync.server ?: "No sync server", Palette.muted, 13.sp, oneLine = true)
                    }
                }
                TextLink(if (sync.server == null) "Set up" else "Sync") { App.go("sync") }
            }
        }
        SectionTitle("Views")
        Card {
            boot.views.sortedBy { it.raw.optInt("position") }.forEachIndexed { i, v ->
                if (i > 0) Line()
                ListRow(v.name, v.kind, if (v.kind == "List") Icons.table else if (v.kind == "Timeline") Icons.timeline else Icons.board, v.color) { App.go("board", "view" to v.id) }
            }
            Line()
            ListRow("New view", icon = Icons.plus, iconColor = Palette.accent, chevron = false) {
                scope.launch {
                    attempt("Not created") {
                        val v = Api.post("/views", jsonOf("name" to "New view", "layout" to "board", "position" to boot.views.size,
                            "filter" to jsonOf("areas" to null, "statuses" to null, "difficulty_min" to null, "custom" to null, "include_done_days" to 7)))
                        App.reloadBoot()
                        App.go("board", "view" to v.getLong("id"))
                    }
                }
            }
        }
        SectionTitle("Workspace")
        Card {
            ListRow("Search", icon = Icons.search) { App.go("search") }
            Line(); ListRow("Dashboards", icon = Icons.dash) { App.go("dashboards") }
            Line(); ListRow("Buffs & debuffs", if ((inForce ?: 0) > 0) "$inForce in force" else "", Icons.bolt) { App.go("states") }
            Line(); ListRow("Cycle time", icon = Icons.cycle) { App.go("cycle") }
            Line(); ListRow("Settings", icon = Icons.gear) { App.go("settings") }
        }
    }
}

// ---------------------------------------------------------------- Settings

@Composable
fun SettingsScreen() {
    val boot = App.boot ?: return
    val scope = rememberCoroutineScope()
    val ctx = LocalContext.current
    val sync = remember { Sync.state(ctx) }
    Column(Modifier.fillMaxSize()) {
        TopBar("Settings", onBack = { App.back() })
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(start = 16.dp, end = 16.dp, bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            SectionTitle("Screens")
            Card(pad = 16.dp) {
                SwitchRow("Day screen", showsDay(boot.settings), "The morning plan and evening readout, with its own tab. Off hides it here and on the web. Nothing is deleted.") {
                    scope.launch { attempt("Not saved") { saveSetting("show_day_screen", it) } }
                }
            }
            Card {
                ListRow("Names", "What ${Terms.tasks} and ${Terms.epics} are called") { App.go("names") }
            }
            SectionTitle("Workflow")
            Card {
                ListRow("Areas", "${boot.areas.size} ${if (boot.areas.size == 1) "area" else "areas"}") { App.go("lookup", "kind" to "areas") }
                Line(); ListRow("Statuses", boot.statuses.joinToString(", ") { it.name }) { App.go("lookup", "kind" to "statuses") }
                Line(); ListRow("Priorities", boot.priorities.joinToString(", ") { it.name }) { App.go("lookup", "kind" to "priorities") }
                Line(); ListRow("${Terms.capTask} dates", "Start, end and due") { App.go("taskdates") }
                Line(); ListRow("Snooze", "Longest snooze") { App.go("snoozeset") }
                Line(); ListRow("Complete details", "Fields an open ${Terms.task} should have") { App.go("complete") }
                Line(); ListRow("Card actions", "Buttons and menu on web cards") { App.go("cardactions") }
                Line(); ListRow("Custom fields", "Extra fields on ${Terms.tasks} and sessions") { App.go("fields") }
            }
            SectionTitle("Time and points")
            Card {
                ListRow("Energy types", "Rates and colours for all ${boot.energyTypes.size}") { App.go("lookup", "kind" to "energy-types") }
                Line(); ListRow("Subtypes", "${boot.subtypes.size} subtypes") { App.go("lookup", "kind" to "subtypes") }
                Line(); ListRow("Reflection", "When weeks start") { App.go("reflection") }
            }
            SectionTitle("Connections")
            Card {
                ListRow("Quick capture", "Parser and model") { App.go("llm") }
                Line(); ListRow("Duplicate search", "Match ${Terms.tasks} by meaning") { App.go("duplicates") }
                Line(); ListRow("Sync server", sync.server ?: "Not set · everything stays on this phone") { App.go("sync") }
            }
            SectionTitle("Data")
            Card { ListRow("Download database", "A copy of everything, as one SQLite file") { App.go("data") } }
            SectionTitle("You")
            Card { ListRow("Appearance", "Dark, as the web app", chevron = false) {} }
        }
    }
}

// ---------------------------------------------------------------- Lookups

/** Areas, statuses, priorities, energy types and subtypes: rename, recolour, add, delete. */
@Composable
fun LookupScreen(r: Route) {
    val boot = App.boot ?: return
    val kind = r.args["kind"] ?: "areas"
    val title = mapOf("areas" to "Areas", "statuses" to "Statuses", "priorities" to "Priorities", "energy-types" to "Energy types", "subtypes" to "Subtypes")[kind] ?: kind
    val rows: List<JSONObject> = when (kind) {
        "areas" -> boot.areas.map { it.raw }
        "statuses" -> boot.statuses.map { it.raw }
        "priorities" -> boot.priorities.map { it.raw }
        "energy-types" -> boot.energyTypes.map { it.raw }
        else -> boot.subtypes.map { it.raw }
    }
    var editing by remember { mutableStateOf<JSONObject?>(null) }
    var adding by remember { mutableStateOf(false) }
    var moving by remember { mutableStateOf<Pair<JSONObject, String>?>(null) }
    val scope = rememberCoroutineScope()
    fun run(what: String, f: suspend () -> Unit) = scope.launch { attempt(what) { f(); App.reloadBoot(); App.changed() } }

    Box(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize()) {
            TopBar(title, onBack = { App.back() })
            Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(start = 16.dp, end = 16.dp, bottom = 96.dp)) {
                Card {
                    rows.forEachIndexed { i, o ->
                        if (i > 0) Line()
                        val hint = when (kind) {
                            "areas" -> o.optString("key_prefix")
                            "energy-types" -> "${num(o.optDouble("points_per_hour"))} points an hour"
                            "subtypes" -> boot.type(o.optLong("energy_type_id"))?.name ?: ""
                            "statuses" -> boot.statuses.firstOrNull { it.id == o.getLong("id") }?.let { it.behaviour.replace('_', ' ') + if (!it.onBoard) " · hidden" else "" } ?: ""
                            else -> ""
                        }
                        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(start = 16.dp)) {
                            Dot(color(o.str("color")), 10)
                            Box(Modifier.weight(1f)) { ListRow(o.optString("name"), hint) { editing = o } }
                        }
                    }
                }
            }
        }
        Fab("Add", Modifier.align(Alignment.BottomEnd).padding(16.dp)) { adding = true }
    }

    editing?.let { o ->
        var name by remember(o) { mutableStateOf(o.optString("name")) }
        var extra by remember(o) { mutableStateOf(if (kind == "energy-types") num(o.optDouble("points_per_hour")) else o.optString("key_prefix")) }
        AlertDialog(
            onDismissRequest = { editing = null }, containerColor = Palette.raised,
            title = { T("Edit", Palette.fg, 18.sp, FontWeight.SemiBold) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    TextBox("Name", name) { name = it }
                    if (kind == "energy-types") TextBox("Points an hour", extra, keyboard = KeyboardType.Decimal) { extra = it }
                    if (kind == "areas") TextBox("${Terms.capTask} key prefix", extra) { extra = it.uppercase() }
                    if (o.optBoolean("is_builtin")) T("Built in: it can be renamed but not deleted.", Palette.subtle, 12.sp)
                }
            },
            confirmButton = {
                TextButton({
                    editing = null
                    val body = jsonOf("name" to name.trim())
                    if (kind == "energy-types") extra.toDoubleOrNull()?.let { body.put("points_per_hour", it) }
                    if (kind == "areas" && extra.isNotBlank()) body.put("key_prefix", extra)
                    run("Not saved") { Api.patch("/$kind/${o.getLong("id")}", body) }
                }) { T("Save", Palette.accent, 15.sp, FontWeight.SemiBold) }
            },
            dismissButton = {
                Row {
                    if (!o.optBoolean("is_builtin")) TextButton({
                        editing = null
                        scope.launch {
                            try {
                                Api.del("/$kind/${o.getLong("id")}")
                                App.reloadBoot(); App.changed()
                            } catch (e: ApiError) {
                                // In use: ask where its tasks and sessions should move (as in Jira).
                                val cur = e.body?.optJSONObject("current")
                                if (e.status == 409 && cur != null) moving = o to (cur.optString("used_by").ifBlank { Terms.countTasks(cur.optInt("task_count")) })
                                else App.say("Not deleted: ${e.message}")
                            }
                        }
                    }) { T("Delete", Palette.red, 15.sp) }
                    TextButton({ editing = null }) { T("Cancel", Palette.muted, 15.sp) }
                }
            },
        )
    }
    moving?.let { (o, usedBy) ->
        val others = rows.filter { it.getLong("id") != o.getLong("id") }.map { it.getLong("id") to it.optString("name") }
        PickSheet("\"${o.optString("name")}\" is used by $usedBy. Move them to:", others, { moving = null }) { to ->
            moving = null
            run("Not deleted") { Api.del("/$kind/${o.getLong("id")}?reassign_to=$to") }
        }
    }
    if (adding) {
        var name by remember { mutableStateOf("") }
        var extra by remember { mutableStateOf("") }
        var parent by remember { mutableStateOf<Long?>(null) }
        val parents: List<Pair<Long, String>> = when (kind) {
            "subtypes" -> boot.energyTypes.map { it.id to it.name }
            "statuses" -> App.bootCategories()
            else -> emptyList()
        }
        AlertDialog(
            onDismissRequest = { adding = false }, containerColor = Palette.raised,
            title = { T("New", Palette.fg, 18.sp, FontWeight.SemiBold) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    TextBox("Name", name) { name = it }
                    if (kind == "areas") TextBox("${Terms.capTask} key prefix", extra, "e.g. HM") { extra = it.uppercase().filter(Char::isLetterOrDigit).take(6) }
                    if (parents.isNotEmpty()) {
                        T(if (kind == "subtypes") "Energy type" else "Behaves as", Palette.muted, 13.sp)
                        androidx.compose.foundation.layout.FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            parents.forEach { (id, n) -> Pill(n, parent == id) { parent = id } }
                        }
                    }
                }
            },
            confirmButton = {
                TextButton({
                    adding = false
                    val body = jsonOf("name" to name.trim())
                    when (kind) {
                        "areas" -> body.put("key_prefix", extra)
                        "subtypes" -> body.put("energy_type_id", parent)
                        "statuses" -> body.put("category_id", parent)
                    }
                    run("Not added") { Api.post("/$kind", body) }
                }) { T("Add", Palette.accent, 15.sp, FontWeight.SemiBold) }
            },
            dismissButton = { TextButton({ adding = false }) { T("Cancel", Palette.muted, 15.sp) } },
        )
    }
}

// ---------------------------------------------------------------- Quick capture settings

/** The capture model: endpoint, model and key, as PUT /api/settings/{key}. The key is write-only. */
@Composable
fun CaptureSettingsScreen() {
    val eff by loaded { Api.obj("/capture/config") }
    var endpoint by remember(eff) { mutableStateOf(eff?.optString("endpoint") ?: "") }
    var model by remember(eff) { mutableStateOf(eff?.optString("model") ?: "") }
    var key by remember { mutableStateOf("") }
    var test by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    Column(Modifier.fillMaxSize()) {
        TopBar("Quick capture", onBack = { App.back() })
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(start = 16.dp, end = 16.dp, bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            T("Capture reads a line with an OpenAI-compatible model. Without one it still works, with a simpler reader.", Palette.muted, 14.sp)
            TextBox("Endpoint", endpoint, "https://api.openai.com/v1", keyboard = KeyboardType.Uri) { endpoint = it }
            TextBox("Model", model, "e.g. gpt-4o-mini") { model = it }
            TextBox("API key", key, if (eff?.optBoolean("api_key_set") == true) "Set · type to replace" else "Not set", password = true) { key = it }
            TextLink("Test with a sample line") {
                scope.launch {
                    test = attempt("Test failed") {
                        val p = Api.post("/capture", jsonOf("text" to "Worked on stm32 demo, 2 hours"))
                        if (p.optBoolean("fallback")) "Simple reader used: ${p.optString("fallback_reason")}" else "Model read it: ${p.optString("title")}, ${hrs(p.num("hours"))}"
                    }
                }
            }
            test?.let { T(it, Palette.muted, 13.sp) }
        }
        BottomAction("Save") {
            scope.launch {
                attempt("Not saved") {
                    Api.put("/settings/llm_endpoint", endpoint.trim())
                    Api.put("/settings/llm_model", model.trim())
                    if (key.isNotEmpty()) Api.put("/settings/llm_api_key", key)
                    key = ""
                    App.changed()
                    App.say("Saved")
                }
            }
        }
    }
}

// ---------------------------------------------------------------- Download database

/** Saves a clean copy of the phone's database (VACUUM INTO) wherever the person picks. */
@Composable
fun DataScreen() {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var status by remember { mutableStateOf<String?>(null) }
    val save = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/vnd.sqlite3")) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        scope.launch {
            status = attempt("Download failed") {
                val f = Core.export(ctx)
                val size = f.length()
                kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
                    try {
                        ctx.contentResolver.openOutputStream(uri)!!.use { out -> f.inputStream().use { it.copyTo(out) } }
                    } finally {
                        f.parentFile?.deleteRecursively() // a full copy of the data must not be left in the cache
                    }
                }
                "Saved, ${size / 1024} KB."
            }
        }
    }
    Column(Modifier.fillMaxSize()) {
        TopBar("Download database", onBack = { App.back() })
        Column(Modifier.weight(1f).padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            T("Saves everything on this phone (${Terms.tasks}, sessions, plans, settings) as one SQLite file. Use it to move your data without a sync server, or as a backup.", Palette.muted, 14.sp)
            T("It is the same database a Reskon server keeps for each person, so it can be opened with any SQLite tool.", Palette.subtle, 13.sp)
            status?.let { T(it, Palette.green, 14.sp) }
        }
        BottomAction("Download database") { save.launch("jitterbug-${today()}.db") }
    }
}

fun App.bootCategories(): List<Pair<Long, String>> =
    (boot?.statuses?.map { it.raw.optLong("category_id") to it.behaviour }?.distinct() ?: emptyList())
        .map { (id, b) -> id to b.replace('_', ' ').replaceFirstChar { it.uppercase() } }
