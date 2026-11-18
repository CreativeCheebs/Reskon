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
import androidx.compose.foundation.layout.heightIn
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.semantics
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
                    // The view's name, then the Snoozed / Blocked / Incomplete buttons right after it (they wrap when there is no room).
                    FlowRow(Modifier.weight(1f), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Row(
                            Modifier.align(Alignment.CenterVertically).heightIn(min = 48.dp).clip(RoundedCornerShape(12.dp)).clickable { choosingView = true }.padding(horizontal = 8.dp),
                            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            Box(Modifier.size(12.dp).clip(RoundedCornerShape(3.dp)).background(view.color))
                            T(view.name, Palette.fg, 22.sp, FontWeight.SemiBold, oneLine = true, modifier = Modifier.weight(1f, fill = false))
                            Icon(Icons.down, Palette.muted, 20)
                        }
                        split?.let { HiddenGroup(it, Modifier.align(Alignment.CenterVertically)) { which -> hiddenSheet = which } }
                    }
                    IconButton(Icons.search, "Search this view", size = 44) { searching = true }
                }
                IconButton(Icons.filters, "Layout, grouping and filters", size = 44) { layoutSheet = true }
            }
            // While searching the header is the search box; the buttons (with counts that follow the search) go below it.
            if (searching) split?.let { sp ->
                FlowRow(Modifier.padding(start = 16.dp, end = 16.dp, bottom = 4.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    HiddenGroup(sp) { which -> hiddenSheet = which }
                }
            }
            val list = split?.shown
            if (list != null) when (view.kind) {
                "Timeline" -> TimelineLayout(list)
                else -> ListLayout(view, list) { moving = it }
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
                // The phone has no columns layout: a Board or Table view of the web app shows as this list.
                // Choosing it only turns the timeline off; the view's own layout (as the web app sees it) is left alone.
                Pill("List", view.kind == "List") { patch(jsonOf("board_state" to boardStateWith(view.raw, "timeline", false))) }
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

/** Epic titles, for grouping the list by epic and for the task screen. */
object EpicNames {
    private var names: Map<Long, String> = emptyMap()
    private var version = -1
    fun of(id: Long) = names[id]
    fun all(): Map<Long, String> = names
    suspend fun load() {
        if (version == App.version) return
        names = Api.arr("/tasks?type=epic").objs().associate { it.getLong("id") to it.getString("title") }
        version = App.version
    }
}

// ---------------------------------------------------------------- List

/** One section of the list: a status, priority, area... and the tasks in it. */
private class Group(
    val key: String, val name: String, val color: Color, val rows: List<JSONObject>, val hiddenStatus: Long? = null,
    /** What "+ Add" under this group fills in on the new task: a field (status_id, priority_id...) and its id. Null for "No area", "All"... */
    val field: String? = null, val fieldId: Long? = null,
)

/**
 * The phone's only layout for a view: a section for each group (by default each status), one under
 * another, so nothing scrolls sideways. A wrapping row of buttons, one per group with its count,
 * jumps to that section. Grouped by status, a hidden status (Backlog, Cancelled...) has a button too
 * and opens as a section when tapped.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ListLayout(view: ViewRef, allTasks: List<JSONObject>, onLongPress: (JSONObject) -> Unit) {
    val boot = App.boot ?: return
    // Tasks in a hidden status (Backlog...) stay out of the list until their button is tapped.
    var opened by remember(view.id) { mutableStateOf(OpenedStatuses.of(view.id)) }
    val tasks = withoutHiddenStatuses(allTasks, boot.statuses, opened)
    val groupBy = view.raw.optJSONObject("board_state")?.optString("group_by")?.ifBlank { null } ?: "status"
    // A group is its name, colour and the id it stands for; the id is null for a "No ..." group (also when the
    // task's id is no longer known), so "+ Add" there fills nothing in, and two epics with one title stay apart.
    fun keyOf(t: JSONObject): Triple<String, Color, Long?> = when (groupBy) {
        "priority" -> boot.priority(t.id("priority_id"))?.let { Triple(it.name, it.color, it.id) } ?: Triple("No priority", Palette.subtle, null)
        "area" -> boot.area(t.id("area_id"))?.let { Triple(it.name, it.color, it.id) } ?: Triple("No area", Palette.subtle, null)
        "energy_type" -> boot.type(t.id("energy_type_id"))?.let { Triple(it.name, it.color, it.id) } ?: Triple("No energy type", Palette.subtle, null)
        "epic" -> t.id("epic_id")?.let { id -> EpicNames.of(id)?.let { Triple(it, Palette.purple, id) } } ?: Triple("No ${Terms.epic}", Palette.purple, null)
        "none" -> Triple("All", Palette.accent, null)
        else -> boot.status(t.id("status_id"))?.let { Triple(it.name, it.color, it.id) } ?: Triple("?", Palette.subtle, null)
    }
    // The task field a group stands for; a "No ..." group or the one "All" group fills in nothing.
    val fieldName = when (groupBy) { "priority" -> "priority_id"; "area" -> "area_id"; "energy_type" -> "energy_type_id"; "epic" -> "epic_id"; else -> null }
    val groups: List<Group> = if (groupBy == "status") {
        // Every status on the board is a section, even an empty one; a hidden one is a section once opened.
        boot.statuses.filter { it.onBoard || it.id in opened }.map { s ->
            Group("s${s.id}", s.name, s.color, tasks.filter { it.optLong("status_id", -1) == s.id }, hiddenStatus = s.id.takeIf { !s.onBoard }, field = "status_id", fieldId = s.id)
        }
    } else {
        tasks.groupBy { keyOf(it) }.entries.map { (k, rows) -> Group("${k.first}|${k.second.value}|${k.third}", k.first, k.second, rows, field = fieldName.takeIf { k.third != null }, fieldId = k.third) }
    }
    // The status to scroll to once the list has been rebuilt with it (a hidden one is added first).
    var pending by remember { mutableStateOf<String?>(null) }
    val listState = rememberLazyListState()
    LaunchedEffect(pending, groups.size) {
        val key = pending ?: return@LaunchedEffect
        groups.indexOfFirst { it.key == key }.takeIf { it >= 0 }?.let { listState.animateScrollToItem(it) }
        pending = null
    }

    // At a large text size the buttons could fill the screen, so the row has its own height limit and scrolls inside it.
    FlowRow(
        Modifier.fillMaxWidth().heightIn(max = 150.dp).verticalScroll(rememberScrollState()).padding(start = 16.dp, end = 16.dp, top = 4.dp, bottom = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        if (groupBy == "status") {
            boot.statuses.forEach { s ->
                val n = allTasks.count { it.optLong("status_id", -1) == s.id }
                val open = !s.onBoard && s.id in opened
                Pill(
                    "${s.name} $n", on = open, dot = s.color, action = true, rect = true, filled = true, height = 32,
                    description = (if (!s.onBoard) (if (open) "Close ${s.name}" else "Show ${s.name}") else "Go to ${s.name}") + ", ${Terms.countTasks(n)}",
                ) {
                    // A shown hidden status closes again; any other button jumps to its section.
                    opened = when {
                        open -> opened - s.id
                        !s.onBoard -> opened + s.id
                        else -> opened
                    }
                    OpenedStatuses.set(view.id, opened)
                    if (!open) pending = "s${s.id}"
                }
            }
        } else {
            // Hidden statuses (Backlog, Cancelled) can be opened whatever the list is grouped by.
            boot.statuses.filter { !it.onBoard }.forEach { s ->
                val n = allTasks.count { it.optLong("status_id", -1) == s.id }
                val open = s.id in opened
                Pill(
                    "${s.name} $n", on = open, dot = s.color, action = true, rect = true, filled = true, height = 32,
                    description = (if (open) "Close ${s.name}" else "Show ${s.name}") + ", ${Terms.countTasks(n)}",
                ) {
                    opened = if (open) opened - s.id else opened + s.id
                    OpenedStatuses.set(view.id, opened)
                }
            }
            groups.forEach { g ->
                Pill("${g.name} ${g.rows.size}", dot = g.color, action = true, rect = true, filled = true, height = 32, description = "Go to ${g.name}, ${Terms.countTasks(g.rows.size)}") { pending = g.key }
            }
        }
    }
    if (allTasks.isEmpty()) Empty("No ${Terms.tasks} in this view.")
    else if (tasks.isEmpty()) Empty("Nothing to show here. Tap a status above to see its ${Terms.tasks}.")
    LazyColumn(state = listState, contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 96.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        items(groups, key = { it.key }) { g ->
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(Modifier.fillMaxWidth().heightIn(min = 40.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(
                        Modifier.weight(1f).semantics(mergeDescendants = true) { heading(); contentDescription = "${g.name}, ${Terms.countTasks(g.rows.size)}" },
                        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Dot(g.color, 9)
                        T("${g.name} · ${g.rows.size}", Palette.fg, 14.sp, FontWeight.SemiBold, oneLine = true)
                    }
                    // "+ Add": a new task that starts in this group (its status, priority, area...).
                    Row(
                        Modifier.offset(x = 8.dp).heightIn(min = 48.dp).clip(RoundedCornerShape(24.dp))
                            .clickable(role = Role.Button, onClickLabel = "Add a ${Terms.task}") {
                                val args = listOfNotNull("view" to view.id, g.field?.let { "pre" to it }, g.fieldId?.let { "preid" to it })
                                App.go("newtask", *args.toTypedArray())
                            }
                            .semantics(mergeDescendants = true) { contentDescription = "Add a ${Terms.task} to ${g.name}" }
                            .padding(horizontal = 12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) { T("+ Add", Palette.accentFg, 14.sp, FontWeight.Medium, oneLine = true) }
                }
                if (g.rows.isEmpty()) T("No ${Terms.tasks}", Palette.subtle, 13.sp, modifier = Modifier.padding(start = 4.dp))
                else Card(radius = 12.dp, bordered = false) {
                    g.rows.forEachIndexed { i, t ->
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
            // Tags get their own line, so the area and due date do not push them out of sight.
            boot.tagNames(t.tagIds()).takeIf { it.isNotEmpty() }?.let { names -> T(names.joinToString(" ") { "#$it" }, Palette.subtle, 12.sp, oneLine = true) }
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
