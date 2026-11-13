package com.aakash.jitterbug

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.time.LocalDate
import java.time.temporal.ChronoUnit

/** A saved view: Board, List (table layout) or Timeline. Tasks come from GET /api/tasks?view=:id. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BoardScreen(r: Route) {
    val boot = App.boot ?: return
    val views = boot.views.sortedBy { it.raw.optInt("position") }
    val view = views.firstOrNull { it.id == (r.long("view") ?: Prefs.lastView) } ?: views.firstOrNull() ?: return
    Prefs.lastView = view.id
    var query by remember { mutableStateOf("") }
    var searching by remember { mutableStateOf(false) }
    var choosingView by remember { mutableStateOf(false) }
    var layoutSheet by remember { mutableStateOf(false) }
    var moving by remember { mutableStateOf<JSONObject?>(null) }
    val tasks by loaded(view.id, query) { EpicNames.load(); Api.arr("/tasks?view=${view.id}" + if (query.isNotBlank()) "&q=${java.net.URLEncoder.encode(query, "UTF-8")}" else "").objs() }
    val scope = rememberCoroutineScope()
    // Snoozed tasks, and blocked ones while this view hides them, are not listed; their buttons open them.
    val hideBlocked = hidesBlocked(view)
    val checksDetails = requiredFields(boot.settings).isNotEmpty()
    val split = remember(tasks, hideBlocked, checksDetails) { tasks?.let { splitTasks(it, hideBlocked, checksDetails) } }
    var hiddenSheet by remember { mutableStateOf<String?>(null) }
    var waking by remember { mutableStateOf(setOf<Long>()) }

    Box(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize()) {
            Row(
                Modifier.fillMaxWidth().windowInsetsPadding(WindowInsets.statusBars).padding(start = 12.dp, end = 8.dp, top = 8.dp, bottom = 2.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                if (searching) {
                    IconButton(Icons.back, "Close search", Palette.fg) { searching = false; query = "" }
                    BasicTextField(
                        query, { query = it }, singleLine = true, cursorBrush = SolidColor(Palette.accent),
                        textStyle = TextStyle(color = Palette.fg, fontSize = 17.sp), modifier = Modifier.weight(1f).padding(8.dp),
                        decorationBox = { inner -> if (query.isEmpty()) T("Search ${view.name}", Palette.subtle, 17.sp); inner() },
                    )
                } else {
                    Row(
                        Modifier.weight(1f).height(48.dp).clip(RoundedCornerShape(12.dp)).clickable { choosingView = true }.padding(horizontal = 8.dp),
                        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Box(Modifier.size(12.dp).clip(RoundedCornerShape(3.dp)).background(view.color))
                        T(view.name, Palette.fg, 22.sp, FontWeight.SemiBold, oneLine = true)
                        Icon(Icons.down, Palette.muted, 20)
                    }
                    IconButton(Icons.search, "Search this view", size = 44) { searching = true }
                }
                IconButton(Icons.filters, "Layout, grouping and filters", size = 44) { layoutSheet = true }
            }
            split?.let { HiddenGroup(it) { which -> hiddenSheet = which } }
            val list = split?.shown
            if (list != null) when (view.kind) {
                "List" -> ListLayout(view, list) { moving = it }
                "Timeline" -> TimelineLayout(list)
                else -> BoardLayout(view, list) { moving = it }
            }
        }
        Fab(null, Modifier.align(Alignment.BottomEnd).padding(16.dp)) { App.go("newtask", "view" to view.id) }
    }

    if (choosingView) PickSheet("Views", views.map { it.id to "${it.name}  ·  ${it.kind}" }, { choosingView = false }) {
        choosingView = false; App.go("board", "view" to it)
    }
    if (layoutSheet) LayoutSheet(view) { layoutSheet = false }
    if (split != null) when (hiddenSheet) {
        "snoozed" -> SnoozedSheet(snoozedOrder(split.snoozed), waking, { t ->
            val id = t.getLong("id")
            if (id !in waking) {
                waking = waking + id
                scope.launch {
                    val done = attempt("Not woken") { snoozeTask(id, 0); App.changed() }
                    waking = waking - id
                    if (done == null) hiddenSheet = null
                }
            }
        }) { hiddenSheet = null }
        "blocked" -> BlockedSheet(split.blocked, hideBlocked, { hide ->
            scope.launch {
                val done = attempt("Not saved") {
                    Api.patch("/views/${view.id}", jsonOf("board_state" to boardStateWith(view.raw, "hide_blocked", hide)))
                    App.reloadBoot(); App.changed()
                }
                if (done == null) hiddenSheet = null
            }
        }) { hiddenSheet = null }
        "incomplete" -> IncompleteSheet(split.incomplete) { hiddenSheet = null }
    }
    moving?.let { t ->
        PickSheet("Move \"${t.optString("title")}\" to", boot.statuses.filter { it.id != t.getLong("status_id") }.map { it.id to it.name }, { moving = null }) { sid ->
            moving = null
            scope.launch { attempt("Not moved") { Api.post("/tasks/${t.getLong("id")}/move", jsonOf("status_id" to sid, "today" to today())); App.changed() } }
        }
    }
}

/** Remembers the last view opened, so Board opens on it. */
object Prefs {
    var lastView: Long? = null
    var lastDashboard: Long? = null
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun LayoutSheet(view: ViewRef, onDismiss: () -> Unit) {
    val scope = rememberCoroutineScope()
    val state = view.raw.optJSONObject("board_state") ?: JSONObject()
    fun patch(body: JSONObject) = scope.launch {
        attempt("Not saved") { Api.patch("/views/${view.id}", body); App.reloadBoot(); App.changed() }
    }
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), containerColor = Palette.raised) {
        Column(Modifier.padding(start = 20.dp, end = 20.dp, bottom = 32.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            T("Layout", Palette.fg, 18.sp, FontWeight.SemiBold)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Pill("Board", view.kind == "Board") { patch(jsonOf("layout" to "board", "board_state" to boardStateWith(view.raw, "timeline", false))) }
                Pill("List", view.kind == "List") { patch(jsonOf("layout" to "table", "board_state" to boardStateWith(view.raw, "timeline", false))) }
                Pill("Timeline", view.kind == "Timeline") { patch(jsonOf("board_state" to boardStateWith(view.raw, "timeline", true))) }
            }
            T("Group by (list)", Palette.fg, 15.sp, FontWeight.SemiBold)
            androidx.compose.foundation.layout.FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                val g = state.optString("group_by", "status").ifBlank { "status" }
                listOf("status", "priority", "area", "energy_type", "epic", "none").forEach { k ->
                    Pill(if (k == "epic") Terms.capEpic else k.replace('_', ' ').replaceFirstChar { it.uppercase() }, g == k) { patch(jsonOf("board_state" to boardStateWith(view.raw, "group_by", k))) }
                }
            }
            T("Filters and card fields are set on the web app.", Palette.subtle, 13.sp)
        }
    }
}

// ---------------------------------------------------------------- Board

@Composable
private fun BoardLayout(view: ViewRef, tasks: List<JSONObject>, onLongPress: (JSONObject) -> Unit) {
    val boot = App.boot ?: return
    var shownHidden by remember { mutableStateOf(setOf<Long>()) }
    val byStatus = tasks.groupBy { it.getLong("status_id") }
    val columns = boot.statuses.filter { it.onBoard || it.id in shownHidden }
    val limits = view.raw.optJSONObject("board_state")?.optJSONObject("limits")
    val listState = rememberLazyListState()
    val scope = rememberCoroutineScope()
    var current by remember { mutableStateOf(columns.firstOrNull { it.behaviour == "in_progress" }?.id ?: columns.firstOrNull()?.id) }
    // Open on the highlighted column.
    androidx.compose.runtime.LaunchedEffect(Unit) {
        columns.indexOfFirst { it.id == current }.takeIf { it > 0 }?.let { listState.scrollToItem(it) }
    }

    Row(Modifier.horizontalScroll(rememberScrollState()).padding(start = 16.dp, end = 16.dp, top = 4.dp, bottom = 10.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        boot.statuses.forEach { s ->
            val hidden = !s.onBoard
            val on = s.id == current
            Row(
                Modifier.height(36.dp).clip(RoundedCornerShape(18.dp)).background(if (on) Palette.selected else Color.Transparent)
                    .border(1.dp, if (on) Palette.accent else Palette.strong, RoundedCornerShape(18.dp))
                    .clickable {
                        if (hidden && s.id !in shownHidden) shownHidden = shownHidden + s.id
                        current = s.id
                        scope.launch {
                            val idx = boot.statuses.filter { it.onBoard || it.id in shownHidden }.indexOfFirst { it.id == s.id }
                            if (idx >= 0) listState.animateScrollToItem(idx)
                        }
                    }.padding(horizontal = 14.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Dot(s.color)
                T(s.name, if (on) Palette.fg else if (hidden) Palette.subtle else Palette.muted, 14.sp, FontWeight.Medium)
                T((byStatus[s.id]?.size ?: 0).toString(), Palette.subtle, 14.sp)
            }
        }
    }
    LazyRow(state = listState, contentPadding = PaddingValues(start = 12.dp, end = 12.dp), horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxSize()) {
        items(columns, key = { it.id }) { s ->
            val cards = byStatus[s.id].orEmpty()
            val limit = limits?.optJSONObject(s.id.toString())
            LazyColumn(
                Modifier.width(326.dp).fillMaxHeight().clip(RoundedCornerShape(16.dp)).background(Palette.column).border(1.dp, Palette.chip, RoundedCornerShape(16.dp)),
                contentPadding = PaddingValues(start = 8.dp, end = 8.dp, top = 10.dp, bottom = 96.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                item {
                    Row(Modifier.padding(horizontal = 4.dp)) {
                        T(s.name, Palette.muted, 13.sp, modifier = Modifier.weight(1f))
                        T(if (limit != null && limit.optString("unit", "tasks") == "tasks") "${cards.size} of ${limit.optInt("max")}" else cards.size.toString(), Palette.muted, 13.sp)
                    }
                }
                if (cards.isEmpty()) item { T("No cards", Palette.subtle, 13.sp, modifier = Modifier.padding(8.dp)) }
                items(cards, key = { it.getLong("id") }) { t -> TaskCard(t, onLongPress) }
            }
        }
    }
}

/** A board card. Every number on it comes from the task as the API returns it. */
@OptIn(ExperimentalFoundationApi::class, ExperimentalLayoutApi::class)
@Composable
fun TaskCard(t: JSONObject, onLongPress: (JSONObject) -> Unit = {}) {
    val boot = App.boot ?: return
    val epic = t.optString("type") == "epic"
    val overdue = (t.num("days_to_due") ?: 1.0) < 0 && t.optString("behaviour") in setOf("todo", "in_progress")
    val edge = when { t.optBoolean("stalled") -> Palette.red; overdue -> Palette.yellow; else -> Color.Transparent }
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(Palette.panel).border(1.dp, Color(0xFF2E353C), RoundedCornerShape(10.dp))
            .drawBehind { drawRect(edge, size = androidx.compose.ui.geometry.Size(3.dp.toPx(), size.height)) }
            .combinedClickable(onLongClick = { onLongPress(t) }) { App.go("task", "id" to t.getLong("id")) }
            .padding(horizontal = 13.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(9.dp),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Box(Modifier.padding(top = 2.dp).size(16.dp).clip(RoundedCornerShape(4.dp)).background(if (epic) Palette.purple else Palette.accent), contentAlignment = Alignment.Center) {
                Icon(if (epic) Icons.bolt else Icons.check, Palette.onAccent, 12, 3.5f)
            }
            T(t.optString("title"), Palette.fg, 15.sp, FontWeight.Medium, strike = t.optString("behaviour") == "cancelled")
        }
        val labels = listOfNotNull(
            t.id("epic_id")?.let { id -> EpicNames.of(id)?.let { it to Palette.purple } },
            boot.area(t.id("area_id"))?.let { it.name to it.color },
            boot.type(t.id("energy_type_id"))?.let { it.name to it.color },
        ) + boot.tagNames(t.tagIds()).map { "#$it" to Palette.muted }
        FlowRow(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            labels.forEach { (text, c) -> Tag(text.uppercase(), bg = c.copy(alpha = 0.2f), fg = c, round = 4) }
        }
        FlowRow(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            boot.priority(t.id("priority_id"))?.let { Tag(it.name, it.color, round = 11) }
            t.id("difficulty")?.let { Tag(it.toString(), Palette.intensity[(it - 1).toInt().coerceIn(0, 4)], round = 11) }
            if (t.optInt("subtask_count") > 0) Tag("☑ ${t.optInt("subtask_done")}/${t.optInt("subtask_count")}", round = 11)
            if (epic && t.id("epic_tasks") != null) Tag("${t.optInt("epic_done")}/${t.optInt("epic_tasks")} done", Palette.purple, round = 11)
            if (t.optBoolean("stalled")) Tag("Stalled ${age(t.num("time_in_status_h"))}", bg = Palette.red.copy(alpha = 0.18f), fg = Palette.red, round = 11)
            else Tag("⧗ ${age(t.num("time_in_status_h"))}", round = 11)
            if (t.optBoolean("blocked")) Tag("Blocked", bg = Palette.yellow.copy(alpha = 0.18f), fg = Palette.yellow, round = 11)
            t.str("due_at")?.let { if (overdue) Tag("Overdue ${shortDate(it)}", bg = Palette.yellow.copy(alpha = 0.18f), fg = Palette.yellow, round = 11) else Tag("Due ${shortDate(it)}", round = 11) }
        }
        t.num("progress_pct")?.let { pct ->
            if (t.num("estimate_h") != null && t.optDouble("logged_h") > 0) {
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    val over = (t.num("remaining_h") ?: 0.0) < 0
                    BoxWithConstraints(Modifier.fillMaxWidth().height(4.dp).clip(RoundedCornerShape(2.dp)).background(Palette.dim)) {
                        Box(Modifier.width(maxWidth * (pct / 100).toFloat().coerceIn(0f, 1f)).fillMaxHeight().background(if (over) Palette.red else Palette.accent))
                    }
                    T("${hm(t.optDouble("logged_h"))} of ${hm(t.num("estimate_h"))} · " +
                        if (over) "${hm(-(t.num("remaining_h") ?: 0.0))} over" else "${hm(t.num("remaining_h"))} left",
                        if (over) Palette.red else Palette.muted, 12.sp)
                }
            }
        }
    }
}

/** Epic titles for the labels on cards. */
object EpicNames {
    private var names: Map<Long, String> = emptyMap()
    private var version = -1
    fun of(id: Long) = names[id]
    suspend fun load() {
        if (version == App.version) return
        names = Api.arr("/tasks?type=epic").objs().associate { it.getLong("id") to it.getString("title") }
        version = App.version
    }
}

// ---------------------------------------------------------------- List

@Composable
private fun ListLayout(view: ViewRef, allTasks: List<JSONObject>, onLongPress: (JSONObject) -> Unit) {
    val boot = App.boot ?: return
    // Tasks in a hidden status (Backlog...) stay out of the list until their button is tapped.
    var opened by remember(view.id) { mutableStateOf(OpenedStatuses.of(view.id)) }
    val tasks = withoutHiddenStatuses(allTasks, boot.statuses, opened)
    val hiddenCounts = boot.statuses.filter { !it.onBoard }.map { s -> s to allTasks.count { it.optLong("status_id", -1) == s.id } }.filter { it.second > 0 }
    val groupBy = view.raw.optJSONObject("board_state")?.optString("group_by")?.ifBlank { null } ?: "status"
    fun keyOf(t: JSONObject): Pair<String, Color> = when (groupBy) {
        "priority" -> boot.priority(t.id("priority_id"))?.let { it.name to it.color } ?: ("No priority" to Palette.subtle)
        "area" -> boot.area(t.id("area_id"))?.let { it.name to it.color } ?: ("No area" to Palette.subtle)
        "energy_type" -> boot.type(t.id("energy_type_id"))?.let { it.name to it.color } ?: ("No energy type" to Palette.subtle)
        "epic" -> (t.id("epic_id")?.let { EpicNames.of(it) } ?: "No ${Terms.epic}") to Palette.purple
        "none" -> "All" to Palette.accent
        else -> boot.status(t.id("status_id"))?.let { it.name to it.color } ?: ("?" to Palette.subtle)
    }
    val order = if (groupBy == "status") boot.statuses.map { it.name } else emptyList()
    val groups = tasks.groupBy { keyOf(it) }.entries.sortedBy { e -> order.indexOf(e.key.first).let { if (it < 0) Int.MAX_VALUE else it } }

    Row(Modifier.padding(start = 16.dp, end = 16.dp, top = 4.dp, bottom = 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Pill("Time in status", true)
        Pill("Group: ${if (groupBy == "epic") Terms.epic else groupBy.replace('_', ' ')}")
        Box(Modifier.weight(1f))
        T(Terms.countTasks(tasks.size), Palette.muted, 13.sp)
    }
    if (hiddenCounts.isNotEmpty()) androidx.compose.foundation.layout.FlowRow(
        Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, bottom = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        hiddenCounts.forEach { (s, n) ->
            Pill(
                "${s.name} $n", on = s.id in opened, dot = s.color, action = true,
                description = (if (s.id in opened) "Hide ${s.name}" else "Show ${s.name}") + ", ${Terms.countTasks(n)}",
            ) {
                opened = if (s.id in opened) opened - s.id else opened + s.id
                OpenedStatuses.set(view.id, opened)
            }
        }
    }
    if (tasks.isEmpty() && hiddenCounts.isNotEmpty()) Empty("Nothing to show here. Tap a status above to see its ${Terms.tasks}.")
    LazyColumn(contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 96.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        items(groups, key = { it.key.first }) { (g, rows) ->
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Dot(g.second)
                    T("${g.first} · ${rows.size}", Palette.fg, 14.sp, FontWeight.SemiBold)
                }
                Card {
                    rows.forEachIndexed { i, t ->
                        if (i > 0) Line()
                        ListRowTask(t, onLongPress)
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
internal fun ListRowTask(t: JSONObject, onLongPress: (JSONObject) -> Unit) {
    val boot = App.boot ?: return
    val overdue = (t.num("days_to_due") ?: 1.0) < 0 && t.optString("behaviour") in setOf("todo", "in_progress")
    val flag = when { t.optBoolean("stalled") -> Palette.red; overdue -> Palette.yellow; else -> Color.Transparent }
    Row(
        Modifier.fillMaxWidth().drawBehind { drawRect(flag, size = androidx.compose.ui.geometry.Size(3.dp.toPx(), size.height)) }
            .combinedClickable(onLongClickLabel = "Move to another status", onLongClick = { onLongPress(t) }) { App.go("task", "id" to t.getLong("id")) }
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            T(t.optString("title"), Palette.fg, 15.sp, FontWeight.Medium, oneLine = true)
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Dot(boot.priority(t.id("priority_id"))?.color ?: Palette.subtle, 7)
                val meta = listOfNotNull(boot.area(t.id("area_id"))?.name, boot.type(t.id("energy_type_id"))?.name,
                    t.str("due_at")?.let { if (overdue) "overdue ${shortDate(it)}" else "due ${shortDate(it)}" })
                T(meta.joinToString(" · "), Palette.muted, 13.sp, oneLine = true)
            }
        }
        T(age(t.num("time_in_status_h")), if (t.optBoolean("stalled")) Palette.red else Palette.fg, 14.sp, FontWeight.SemiBold)
    }
}

// ---------------------------------------------------------------- Timeline

@Composable
private fun TimelineLayout(tasks: List<JSONObject>) {
    val boot = App.boot ?: return
    var start by remember { mutableStateOf(LocalDate.now().with(java.time.DayOfWeek.MONDAY)) }
    val days = 14
    val end = start.plusDays(days - 1L)
    fun span(t: JSONObject): Pair<LocalDate, LocalDate>? {
        val s = t.str("start_date")?.let { LocalDate.parse(it.take(10)) }
        val e = (t.str("end_date") ?: t.str("due_at"))?.let { LocalDate.parse(it.take(10)) }
        val a = s ?: e ?: return null
        val b = e ?: s ?: return null
        return if (b.isBefore(a)) b to a else a to b
    }
    val dated = tasks.filter { span(it) != null }
    val undated = tasks.size - dated.size
    val groups = dated.groupBy { it.id("epic_id") }

    Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        IconButton(Icons.left, "Earlier", Palette.fg) { start = start.minusDays(7) }
        T("${start.dayOfMonth} – ${shortDate(end.toString())}", Palette.fg, 15.sp, FontWeight.SemiBold, Modifier.weight(1f).padding(horizontal = 4.dp))
        IconButton(Icons.right, "Later", Palette.fg) { start = start.plusDays(7) }
    }
    Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp)) {
        (0 until days).forEach { i ->
            val d = start.plusDays(i.toLong())
            val today = d == LocalDate.now()
            Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                T(d.dayOfWeek.name.take(1), if (today) Palette.accent else Palette.subtle, 11.sp)
                T(d.dayOfMonth.toString(), if (today) Palette.accent else Palette.muted, 12.sp, if (today) FontWeight.Bold else FontWeight.Medium)
            }
        }
    }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(start = 16.dp, end = 16.dp, bottom = 96.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        BoxWithConstraints(Modifier.fillMaxWidth()) {
            val w = maxWidth
            val todayIdx = ChronoUnit.DAYS.between(start, LocalDate.now())
            Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                groups.forEach { (epicId, rows) ->
                    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        T(epicId?.let { EpicNames.of(it) } ?: "No ${Terms.epic}", Palette.fg, 14.sp, FontWeight.SemiBold)
                        rows.forEach { t ->
                            val (a, b) = span(t)!!
                            val from = ChronoUnit.DAYS.between(start, a).coerceIn(0, days.toLong())
                            val to = (ChronoUnit.DAYS.between(start, b) + 1).coerceIn(0, days.toLong())
                            val color = boot.status(t.id("status_id"))?.color ?: Palette.accent
                            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).clickable { App.go("task", "id" to t.getLong("id")) }.padding(vertical = 2.dp)) {
                                T(t.optString("title"), Palette.fg, 13.sp, oneLine = true)
                                Box(Modifier.fillMaxWidth().height(10.dp)) {
                                    if (to > from) Box(
                                        Modifier.offset(x = w * (from.toFloat() / days)).width(w * ((to - from).toFloat() / days)).fillMaxHeight()
                                            .clip(RoundedCornerShape(5.dp)).background(color),
                                    )
                                }
                            }
                        }
                    }
                }
            }
            if (todayIdx in 0 until days) Box(Modifier.offset(x = w * ((todayIdx + 0.5f) / days)).width(2.dp).height(1.dp))
        }
        if (dated.isEmpty()) Empty("No ${Terms.task} in this view has dates.")
        if (undated > 0) T("${Terms.countTasks(undated)} ${if (undated == 1) "has" else "have"} no dates, so ${if (undated == 1) "it is" else "they are"} not drawn. Dates are set on the ${Terms.task}.", Palette.subtle, 13.sp)
    }
}
