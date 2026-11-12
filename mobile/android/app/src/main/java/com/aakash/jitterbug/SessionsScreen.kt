package com.aakash.jitterbug

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.time.DayOfWeek
import java.time.LocalDate

private val RANGES = listOf("This week", "Last 7 days", "This month", "Last 30 days")

private fun rangeOf(name: String): Pair<LocalDate, LocalDate> {
    val now = LocalDate.now()
    return when (name) {
        "This week" -> now.with(DayOfWeek.MONDAY) to now
        "This month" -> now.withDayOfMonth(1) to now
        "Last 30 days" -> now.minusDays(29) to now
        else -> now.minusDays(6) to now
    }
}

/** Sessions by day, with each day's totals by type from the metrics API. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SessionsScreen() {
    val boot = App.boot ?: return
    var range by remember { mutableStateOf(RANGES[0]) }
    var area by remember { mutableStateOf<Long?>(null) }
    var type by remember { mutableStateOf<Long?>(null) }
    var task by remember { mutableStateOf<JSONObject?>(null) }
    var picking by remember { mutableStateOf<String?>(null) }
    var selecting by remember { mutableStateOf(false) }
    var selected by remember { mutableStateOf(setOf<Long>()) }
    val scope = rememberCoroutineScope()

    val (from, to) = rangeOf(range)
    val data by loaded(range, area, type, task) {
        SessionTitles.load()
        val q = StringBuilder("from=$from&to=$to")
        val mf = StringBuilder("from=$from&to=$to")
        area?.let { q.append("&area=$it"); mf.append("&filters[area]=$it") }
        type?.let { q.append("&energy_type=$it"); mf.append("&filters[energy_type]=$it") }
        task?.let { q.append("&task_id=${it.getLong("id")}"); mf.append("&filters[task_id]=${it.getLong("id")}") }
        Triple(
            Api.arr("/sessions?$q").objs(),
            Api.obj("/metrics?metric=session_hours&group=day&split=energy_type&$mf").objs("points"),
            Api.obj("/metrics?metric=session_hours&group=day&$mf").objs("points"),
        )
    }

    Box(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize()) {
            TopBar(if (selecting) "${selected.size} selected" else "Sessions") {
                if (selecting) {
                    TextLink("Delete", Palette.red) {
                        scope.launch {
                            attempt("Not deleted") {
                                Api.post("/sessions/bulk", jsonOf("ids" to JSONArray(selected.toList()), "delete" to true))
                                App.say("Deleted ${selected.size}")
                                selected = emptySet(); selecting = false; App.changed()
                            }
                        }
                    }
                    TextLink("Done") { selecting = false; selected = emptySet() }
                } else IconButton(Icons.select, "Select sessions") { selecting = true }
            }
            Row(Modifier.horizontalScroll(rememberScrollState()).padding(start = 16.dp, end = 16.dp, top = 6.dp, bottom = 10.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Pill(range, true, trailing = Icons.down) { picking = "range" }
                Pill(boot.area(area)?.name ?: "Area", area != null, trailing = Icons.down) { picking = "area" }
                Pill(boot.type(type)?.name ?: "Energy type", type != null, trailing = Icons.down) { picking = "type" }
                Pill(task?.optString("title")?.take(18) ?: Terms.capTask, task != null, trailing = Icons.down) { picking = "task" }
            }
            val (sessions, split, totals) = data ?: Triple(emptyList(), emptyList(), emptyList())
            val days = sessions.groupBy { it.getString("logged_for") }.toSortedMap(compareByDescending { it })
            LazyColumn(
                Modifier.weight(1f), contentPadding = androidx.compose.foundation.layout.PaddingValues(start = 16.dp, end = 16.dp, bottom = 120.dp),
                verticalArrangement = Arrangement.spacedBy(18.dp),
            ) {
                if (data != null && days.isEmpty()) item { Empty("No sessions in this range.") }
                items(days.entries.toList(), key = { it.key }) { (day, rows) ->
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Row(verticalAlignment = Alignment.Bottom) {
                            T(relDay(day).let { if (' ' in it) it else "$it · ${dayLabel(day)}" }, Palette.fg, 15.sp, FontWeight.SemiBold, Modifier.weight(1f))
                            T(hrs(totals.firstOrNull { it.optString("key") == day }?.num("value")), Palette.muted, 13.sp)
                        }
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            split.filter { it.optString("key") == day && it.optDouble("value") > 0 }.forEach { p ->
                                val t = boot.type(p.optString("split").toLongOrNull())
                                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                    Dot(t?.color ?: Palette.subtle)
                                    T(t?.name ?: p.optString("split"), Palette.muted, 13.sp)
                                    T(hrs(p.optDouble("value")), Palette.fg, 13.sp)
                                }
                            }
                        }
                        Card {
                            rows.forEachIndexed { i, s ->
                                if (i > 0) Line()
                                SessionRow(s, selecting, s.getLong("id") in selected) {
                                    val id = s.getLong("id")
                                    if (selecting) selected = if (id in selected) selected - id else selected + id
                                    else { Editing.session = s; App.go("log", "session" to id) }
                                }
                            }
                        }
                    }
                }
            }
        }
        if (!selecting) Fab("Log session", Modifier.align(Alignment.BottomEnd).padding(16.dp)) { App.go("log") }
    }

    when (picking) {
        "range" -> PickSheet("Range", RANGES.mapIndexed { i, n -> i.toLong() to n }, { picking = null }) { range = RANGES[it.toInt()]; picking = null }
        "area" -> PickSheet("Area", listOf(0L to "Every area") + boot.areas.map { it.id to it.name }, { picking = null }) { area = it.takeIf { it > 0 }; picking = null }
        "type" -> PickSheet("Energy type", listOf(0L to "Every type") + boot.energyTypes.map { it.id to it.name }, { picking = null }) { type = it.takeIf { it > 0 }; picking = null }
        "task" -> TaskPicker(onDismiss = { picking = null }) { task = it; picking = null }
    }
}

/** One session: description, task, its energy types, hours, time, points. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SessionRow(s: JSONObject, selecting: Boolean = false, on: Boolean = false, taskTitle: String? = null, onClick: () -> Unit) {
    val boot = App.boot ?: return
    val energies = s.objs("energies")
    Row(Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 16.dp, vertical = 12.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        if (selecting) {
            Box(
                Modifier.padding(top = 2.dp).size(20.dp).clip(RoundedCornerShape(5.dp)).background(if (on) Palette.accent else Palette.panel)
                    .border(2.dp, if (on) Palette.accent else Palette.strong, RoundedCornerShape(5.dp)),
                contentAlignment = Alignment.Center,
            ) { if (on) Icon(Icons.check, Palette.onAccent, 14, 3f) }
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            val title = s.str("label") ?: s.str("note") ?: if (s.optString("kind") == "event") "Event" else "Session"
            T(title, Palette.fg, 15.sp, FontWeight.Medium)
            T(taskTitle ?: SessionTitles.of(s.id("task_id")) ?: "No ${Terms.task}", Palette.muted, 13.sp, oneLine = true)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(4.dp), modifier = Modifier.padding(top = 2.dp)) {
                energies.forEach { e ->
                    val t = boot.type(e.getLong("energy_type_id"))
                    val share = if (energies.size > 1) " ${Math.round(e.optDouble("share") * 100)}%" else ""
                    val diff = e.id("difficulty")?.let { " · $it" } ?: ""
                    Tag("${t?.name ?: "?"}$share$diff", t?.color)
                }
            }
        }
        Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(3.dp)) {
            T(hrs(s.optDouble("hours")), Palette.fg, 15.sp, FontWeight.SemiBold)
            s.str("started_at")?.let { T(java.time.Instant.parse(it).atZone(java.time.ZoneId.systemDefault()).toLocalTime().toString().take(5), Palette.subtle, 12.sp) }
            T("${num(s.num("points"))} pts", Palette.subtle, 12.sp)
        }
    }
}

/** Task titles for session rows, loaded once per change (GET /api/tasks?brief=1). */
object SessionTitles {
    private var version = -1
    private var titles: Map<Long, String> = emptyMap()
    fun of(id: Long?): String? = id?.let { titles[it] }
    suspend fun load() {
        if (version == App.version) return
        titles = Api.arr("/tasks?brief=1").objs().associate { it.getLong("id") to it.getString("title") }
        version = App.version
    }
}
