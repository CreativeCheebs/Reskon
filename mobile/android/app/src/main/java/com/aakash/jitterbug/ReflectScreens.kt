package com.aakash.jitterbug

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.net.URLEncoder
import java.time.LocalDate

// ---------------------------------------------------------------- Search

/** Search every task: GET /api/tasks/similar (words, and meaning when the model is on). */
@Composable
fun SearchScreen() {
    val boot = App.boot ?: return
    var q by remember { mutableStateOf("") }
    var results by remember { mutableStateOf<JSONObject?>(null) }
    val briefs by loaded { Api.arr("/tasks?brief=1").objs().associateBy { it.getLong("id") } }
    val focus = remember { FocusRequester() }
    LaunchedEffect(Unit) { runCatching { focus.requestFocus() } }
    LaunchedEffect(q) {
        if (q.isBlank()) { results = null; return@LaunchedEffect }
        delay(250)
        results = attempt("Search failed") { Api.obj("/tasks/similar?q=${URLEncoder.encode(q.trim(), "UTF-8")}") }
    }
    Column(Modifier.fillMaxSize()) {
        Row(
            Modifier.fillMaxWidth().windowInsetsPadding(WindowInsets.statusBars).padding(start = 4.dp, end = 8.dp, top = 8.dp, bottom = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(Icons.back, "Back", Palette.fg) { App.back() }
            BasicTextField(
                q, { q = it }, singleLine = true, cursorBrush = SolidColor(Palette.accent), textStyle = TextStyle(color = Palette.fg, fontSize = 17.sp),
                modifier = Modifier.weight(1f).height(48.dp).clip(RoundedCornerShape(24.dp)).background(Palette.panel).padding(horizontal = 16.dp, vertical = 13.dp).focusRequester(focus),
                decorationBox = { inner -> if (q.isEmpty()) T("Search every task", Palette.subtle, 17.sp); inner() },
            )
            if (q.isNotEmpty()) IconButton(Icons.close, "Clear") { q = "" }
        }
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(start = 16.dp, end = 16.dp, bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            // A task key opens that task directly.
            val byKey = briefs?.values?.firstOrNull { it.optString("key").equals(q.trim(), true) }
            if (byKey != null) {
                Card { ListRow("Open ${byKey.optString("key")}", byKey.optString("title")) { App.go("task", "id" to byKey.getLong("id")) } }
            }
            results?.let { res ->
                val semantic = res.optString("semantic")
                SectionTitle(if (semantic == "on") "Every task · words and meaning" else "Every task · words")
                val rows = res.objs("results")
                Card {
                    if (rows.isEmpty()) T("Nothing matches.", Palette.muted, 14.sp, modifier = Modifier.padding(16.dp))
                    rows.forEachIndexed { i, r ->
                        if (i > 0) Line()
                        val s = boot.status(r.id("status_id"))
                        val b = briefs?.get(r.getLong("id"))
                        val meta = listOfNotNull(
                            b?.id("parent_id")?.let { p -> "Subtask of ${briefs?.get(p)?.optString("title") ?: "#$p"}" },
                            b?.id("area_id")?.let { boot.area(it)?.name },
                        ).joinToString(" · ")
                        Column(Modifier.fillMaxWidth().clickable { App.go("task", "id" to r.getLong("id")) }.padding(horizontal = 16.dp, vertical = 12.dp),
                            verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            T(r.optString("title"), Palette.fg, 15.sp, FontWeight.Medium)
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                s?.let { Tag(it.name, bg = it.color.copy(alpha = 0.2f), fg = it.color, round = 4) }
                                T(meta, Palette.muted, 13.sp, oneLine = true)
                            }
                        }
                    }
                }
            }
            T("A task key such as JB-42 opens that task directly.", Palette.subtle, 13.sp, modifier = Modifier.padding(4.dp))
        }
    }
}

// ---------------------------------------------------------------- Buffs & debuffs

private fun decayText(s: JSONObject): String {
    val days = s.id("duration_days")
    val running = s.optInt("days_running")
    val decay = s.optString("decay")
    s.str("cleared_on")?.let { return "Cleared ${shortDate(it)}" }
    if (s.optBoolean("ended")) return "${decay.replaceFirstChar { it.uppercase() }} decay · ended"
    if (days == null || decay == "static") return "Holds until cleared · day $running"
    return "${decay.replaceFirstChar { it.uppercase() }} decay over $days days · day $running"
}

/** Buffs, debuffs and modifiers: GET /api/states, with today's severity after decay. */
@Composable
fun StatesScreen() {
    val states by loaded { Api.arr("/states").objs() }
    var showCleared by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val all = states.orEmpty()
    val inForce = all.filter { it.optBoolean("in_force") && !it.optBoolean("ended") }
    val ended = all.filter { it.optBoolean("ended") && it.str("cleared_on") == null }
    val cleared = all.filter { it.str("cleared_on") != null }
    Box(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize()) {
            TopBar("Buffs & debuffs", onBack = { App.back() })
            Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(start = 16.dp, end = 16.dp, bottom = 96.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                val groups = listOf("In force" to inForce, "Ended, not cleared" to ended) + if (showCleared) listOf("Cleared" to cleared) else emptyList()
                groups.filter { it.second.isNotEmpty() || it.first == "In force" }.forEach { (name, items) ->
                    SectionTitle(name)
                    if (items.isEmpty()) T("Nothing in force.", Palette.muted, 14.sp)
                    items.forEach { s ->
                        Card(pad = 0.dp) {
                            Row(Modifier.fillMaxWidth().clickable { App.go("state", "id" to s.getLong("id")) }.padding(16.dp),
                                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                SeverityRing(s.optString("kind"), s.optDouble("effective_severity"), 22)
                                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                    T(s.optString("name"), Palette.fg, 15.sp, FontWeight.Medium)
                                    val kind = s.optString("kind")
                                    T("${kind.replaceFirstChar { it.uppercase() }} · ${severityText(s)} ${severityName(s.optDouble("effective_severity"), kind)}", Palette.muted, 13.sp)
                                    T(decayText(s), Palette.subtle, 12.sp)
                                }
                                if (s.str("cleared_on") == null && (s.optBoolean("ended") || name == "In force")) TextLink("Clear") {
                                    scope.launch { attempt("Not cleared") { Api.patch("/states/${s.getLong("id")}", jsonOf("cleared_on" to today())); App.changed() } }
                                }
                            }
                        }
                    }
                }
                if (cleared.isNotEmpty()) TextLink(if (showCleared) "Hide cleared" else "Show ${cleared.size} cleared", Palette.accent) { showCleared = !showCleared }
                T("Severity shown is today's, after decay. A state never scales any number.", Palette.subtle, 13.sp, modifier = Modifier.padding(4.dp))
            }
        }
        Fab("Add", Modifier.align(Alignment.BottomEnd).padding(16.dp)) { App.go("state") }
    }
}

/** Add or edit a state. POST /api/states or PATCH /api/states/{id}. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun StateFormScreen(r: Route) {
    val id = r.long("id")
    val existing by loaded(id) { if (id == null) JSONObject() else Api.arr("/states").objs().firstOrNull { it.getLong("id") == id } ?: JSONObject() }
    val e = existing ?: return
    var name by remember(e) { mutableStateOf(e.str("name") ?: "") }
    var kind by remember(e) { mutableStateOf(e.str("kind") ?: "debuff") }
    var severity by remember(e) { mutableStateOf(e.num("severity") ?: 1.0) }
    var started by remember(e) { mutableStateOf(e.str("started_on")?.let { LocalDate.parse(it) } ?: LocalDate.now()) }
    var duration by remember(e) { mutableStateOf(e.id("duration_days")?.toString() ?: "") }
    var decay by remember(e) { mutableStateOf(e.str("decay") ?: "static") }
    var note by remember(e) { mutableStateOf(e.str("note") ?: "") }
    var pickDate by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    Column(Modifier.fillMaxSize()) {
        TopBar(if (id == null) "New state" else "Edit state", onBack = { App.back() }) {
            if (id != null) TextLink("Delete", Palette.red) {
                scope.launch { attempt("Not deleted") { Api.del("/states/$id"); App.changed(); App.back() } }
            }
        }
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(start = 16.dp, end = 16.dp, bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            TextBox("Name", name, "e.g. Poor sleep") { name = it }
            SectionTitle("Kind")
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf("debuff", "buff", "modifier").forEach { k -> Pill(k.replaceFirstChar { it.uppercase() }, kind == k, kindColor(k)) { kind = k } }
            }
            SectionTitle("Severity · ${num(severity)} ${severityName(severity, kind)}")
            androidx.compose.material3.Slider(severity.toFloat(), { severity = Math.round(it * 2) / 2.0 }, valueRange = 0f..5f, steps = 9)
            FieldBox("Started on", dayLabel(started.toString())) { pickDate = true }
            TextBox("Lasts (days, empty = until cleared)", duration, keyboard = androidx.compose.ui.text.input.KeyboardType.Number) { duration = it.filter(Char::isDigit) }
            SectionTitle("Decay")
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf("static" to "Holds", "linear" to "Linear", "fast" to "Fast", "slow" to "Slow").forEach { (k, l) -> Pill(l, decay == k) { decay = k } }
            }
            TextBox("Note", note, single = false) { note = it }
        }
        BottomAction("Save", enabled = name.isNotBlank()) {
            scope.launch {
                attempt("Not saved") {
                    val body = jsonOf("name" to name.trim(), "kind" to kind, "severity" to severity, "started_on" to started.toString(),
                        "duration_days" to duration.toIntOrNull(), "decay" to decay, "note" to note.ifBlank { null })
                    if (id == null) Api.post("/states", body) else Api.patch("/states/$id", body)
                    App.changed(); App.back()
                }
            }
        }
    }
    if (pickDate) DateDialog(started, { pickDate = false }) { started = it }
}

// ---------------------------------------------------------------- Dashboards

private val DASH_RANGES = listOf("Each widget's own dates" to 0L, "Today" to 1L, "Last 7 days" to 7L, "Last 30 days" to 30L)

/** Dashboards: widgets stacked in their saved order, each from GET /api/metrics?widget=:id. */
@Composable
fun DashboardsScreen() {
    val dashboards by loaded { Api.arr("/dashboards").objs() }
    var current by remember { mutableStateOf(Prefs.lastDashboard) }
    var choosing by remember { mutableStateOf<String?>(null) }
    var range by remember { mutableStateOf(DASH_RANGES[0]) }
    val list = dashboards.orEmpty()
    val d = list.firstOrNull { it.getLong("id") == current } ?: list.firstOrNull()
    val (from, to) = LocalDate.now().minusDays(range.second - 1) to LocalDate.now()
    Column(Modifier.fillMaxSize()) {
        Row(
            Modifier.fillMaxWidth().windowInsetsPadding(WindowInsets.statusBars).padding(start = 4.dp, end = 8.dp, top = 8.dp, bottom = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(Icons.back, "Back", Palette.fg) { App.back() }
            Row(Modifier.clip(RoundedCornerShape(12.dp)).clickable { choosing = "dash" }.padding(8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                T(d?.optString("name") ?: "Dashboards", Palette.fg, 20.sp, FontWeight.SemiBold)
                Icon(Icons.down, Palette.muted, 18)
            }
        }
        Row(Modifier.padding(start = 16.dp, end = 16.dp, bottom = 10.dp)) {
            Pill(if (range.second > 0) "${range.first} · ${shortDate(from.toString())} – ${shortDate(to.toString())}" else range.first, true, trailing = Icons.down) { choosing = "range" }
        }
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(start = 16.dp, end = 16.dp, bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            val widgets = d?.objs("widgets").orEmpty().sortedWith(compareBy({ it.optInt("y") }, { it.optInt("x") }))
            // Small number widgets sit two to a row; the rest take the full width.
            var i = 0
            while (i < widgets.size) {
                val w = widgets[i]
                val next = widgets.getOrNull(i + 1)
                if (w.optString("viz") == "number" && next?.optString("viz") == "number") {
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Box(Modifier.weight(1f)) { Widget(w, range.second, from, to) }
                        Box(Modifier.weight(1f)) { Widget(next, range.second, from, to) }
                    }
                    i += 2
                } else {
                    Widget(w, range.second, from, to); i++
                }
            }
            if (d != null && widgets.isEmpty()) Empty("This dashboard has no widgets.")
            T("Widgets stack in their saved order. Arrange them on the web.", Palette.subtle, 13.sp, modifier = Modifier.padding(4.dp))
        }
    }
    when (choosing) {
        "dash" -> PickSheet("Dashboards", list.map { it.getLong("id") to it.getString("name") }, { choosing = null }) { current = it; Prefs.lastDashboard = it; choosing = null }
        "range" -> PickSheet("Dates", DASH_RANGES.mapIndexed { i, r -> i.toLong() to r.first }, { choosing = null }) { range = DASH_RANGES[it.toInt()]; choosing = null }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Widget(w: JSONObject, days: Long, from: LocalDate, to: LocalDate) {
    val boot = App.boot ?: return
    val res by loaded(w.getLong("id"), days) {
        Api.obj("/metrics?widget=${w.getLong("id")}" + if (days > 0) "&from=$from&to=$to" else "")
    }
    val viz = w.optString("viz")
    Card(pad = 16.dp) {
        T(w.optString("title"), Palette.muted, 13.sp, FontWeight.SemiBold)
        Gap(6)
        val r = res ?: run { T("…", Palette.subtle); return@Card }
        val unit = r.optString("unit")
        fun fmt(v: Double?) = if (unit == "hours") hrs(v) else num(v)
        val points = r.objs("points")
        when {
            viz == "number" -> T(fmt(r.num("total") ?: points.lastOrNull()?.num("value")), Palette.fg, 30.sp, FontWeight.SemiBold)
            points.isEmpty() -> T("No data in this range.", Palette.subtle, 13.sp)
            points.any { it.has("split") && !it.isNull("split") } -> {
                // Stacked bars, one per key, a segment per split.
                val split = r.optString("split").ifBlank { w.optJSONObject("query")?.optString("split") ?: "" }
                fun colorOf(s: String) = when (split) {
                    "energy_type" -> boot.type(s.toLongOrNull())?.color
                    "area" -> boot.area(s.toLongOrNull())?.color
                    "status" -> boot.status(s.toLongOrNull())?.color
                    else -> null
                } ?: Palette.accent
                fun nameOf(s: String) = when (split) {
                    "energy_type" -> boot.type(s.toLongOrNull())?.name
                    "area" -> boot.area(s.toLongOrNull())?.name
                    "status" -> boot.status(s.toLongOrNull())?.name
                    "subtype" -> boot.subtype(s.toLongOrNull())?.name
                    else -> null
                } ?: s
                val keys = points.map { it.optString("key") }.distinct()
                // Chart scale only: the tallest stack fills the height.
                val stackMax = keys.maxOf { k -> points.filter { it.optString("key") == k }.sumOf { it.optDouble("value").coerceAtLeast(0.0) } }
                Row(Modifier.fillMaxWidth().height(160.dp), horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.Bottom) {
                    keys.forEach { k ->
                        Column(Modifier.weight(1f).fillMaxHeight(), verticalArrangement = Arrangement.Bottom) {
                            points.filter { it.optString("key") == k && it.optDouble("value") > 0 }.reversed().forEach { p ->
                                Box(Modifier.fillMaxWidth().height((160 * p.optDouble("value") / stackMax.coerceAtLeast(0.001)).dp).background(colorOf(p.optString("split"))))
                            }
                        }
                    }
                }
                Row(Modifier.fillMaxWidth().padding(top = 4.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    keys.forEach { k -> T(axisLabel(k, points.first { it.optString("key") == k }.optString("label")), Palette.subtle, 10.sp, modifier = Modifier.weight(1f), oneLine = true) }
                }
                Gap(8)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    points.map { it.optString("split") }.distinct().forEach { s ->
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            Dot(colorOf(s)); T(nameOf(s), Palette.muted, 12.sp)
                        }
                    }
                }
            }
            else -> {
                // One bar per row, on a shared scale.
                val max = points.maxOf { it.optDouble("value") }.coerceAtLeast(0.001)
                points.forEach { p ->
                    Column(Modifier.padding(vertical = 3.dp)) {
                        Row {
                            T(axisLabel(p.optString("key"), p.optString("label")), Palette.fg, 13.sp, modifier = Modifier.weight(1f), oneLine = true)
                            T(fmt(p.num("value")), Palette.fg, 13.sp, FontWeight.SemiBold)
                        }
                        BoxWithConstraints(Modifier.fillMaxWidth().height(6.dp).clip(RoundedCornerShape(3.dp)).background(Palette.dim)) {
                            Box(Modifier.width(maxWidth * (p.optDouble("value") / max).toFloat().coerceIn(0f, 1f)).fillMaxHeight().background(Palette.accent))
                        }
                    }
                }
                r.num("total")?.let { T("Total ${fmt(it)}", Palette.muted, 12.sp, modifier = Modifier.padding(top = 6.dp)) }
            }
        }
    }
}

/** A day key "2026-11-03" shown as "Tue"; anything else as its label. */
private fun axisLabel(key: String, label: String): String =
    runCatching { LocalDate.parse(key).dayOfWeek.name.take(3).lowercase().replaceFirstChar { it.uppercase() } }.getOrDefault(label)

// ---------------------------------------------------------------- Cycle time

/** Cycle time for one view: GET /api/cycle-time?view=:id. A bar per task, split by status. */
@Composable
fun CycleTimeScreen(r: Route) {
    val boot = App.boot ?: return
    var viewId by remember { mutableStateOf(r.long("view") ?: Prefs.lastView ?: boot.views.firstOrNull()?.id) }
    var choosing by remember { mutableStateOf(false) }
    val data by loaded(viewId) { viewId?.let { Api.obj("/cycle-time?view=$it") } }
    val view = boot.views.firstOrNull { it.id == viewId }
    Column(Modifier.fillMaxSize()) {
        TopBar("Cycle time", onBack = { App.back() })
        Row(Modifier.padding(start = 16.dp, end = 16.dp, bottom = 10.dp)) { Pill("View: ${view?.name ?: "–"}", true, trailing = Icons.down) { choosing = true } }
        val d = data
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(start = 16.dp, end = 16.dp, bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            if (d == null) return@Column
            val tasks = d.objs("tasks")
            val totals = d.optJSONObject("status_totals") ?: JSONObject()
            Card(pad = 16.dp) {
                T("Where work waits", Palette.fg, 15.sp, FontWeight.SemiBold)
                Gap(8)
                boot.statuses.filter { totals.has(it.id.toString()) }.forEach { s ->
                    Row(Modifier.padding(vertical = 3.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Dot(s.color, 10)
                        T(s.name, Palette.fg, 14.sp, modifier = Modifier.weight(1f))
                        T(span(totals.optDouble(s.id.toString())), Palette.fg, 14.sp, FontWeight.SemiBold)
                    }
                }
                T("Time in each status, summed over the ${if (tasks.size == 1) "task" else "${tasks.size} tasks"} below.", Palette.subtle, 12.sp, modifier = Modifier.padding(top = 6.dp))
            }
            if (tasks.isEmpty()) Empty("No tasks in this view.")
            else Card(pad = 16.dp) {
                val max = tasks.maxOf { it.optDouble("total_h") }.coerceAtLeast(0.001)
                tasks.forEach { t ->
                    Column(Modifier.fillMaxWidth().clickable { App.go("task", "id" to t.getLong("task_id")) }.padding(vertical = 6.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Row {
                            T(t.optString("title"), Palette.fg, 14.sp, modifier = Modifier.weight(1f), oneLine = true)
                            T(span(t.optDouble("total_h")), Palette.muted, 13.sp)
                        }
                        BoxWithConstraints(Modifier.fillMaxWidth().height(10.dp)) {
                            val w = maxWidth
                            Row(Modifier.fillMaxHeight().clip(RoundedCornerShape(3.dp))) {
                                t.objs("segments").forEach { s ->
                                    Box(Modifier.width(w * (s.optDouble("hours") / max).toFloat()).fillMaxHeight().background(boot.status(s.id("status_id"))?.color ?: Palette.accent))
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    if (choosing) PickSheet("View", boot.views.map { it.id to it.name }, { choosing = false }) { viewId = it; choosing = false }
}

/** Hours as days once past a day: "5d", "18h". */
private fun span(h: Double): String = if (h >= 24) "${num(Math.round(h / 24 * 10) / 10.0)}d" else hrs(h)
