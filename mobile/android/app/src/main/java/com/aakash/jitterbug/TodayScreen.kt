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
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneOffset

/**
 * Today: the morning plan (focus, ceilings, what is in force) and the evening
 * readout (planned against actual, feedback on the ceilings). GET/PATCH /api/day/{date}.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TodayScreen(r: Route) {
    var date by remember { mutableStateOf(r.args["date"]?.let { LocalDate.parse(it) } ?: LocalDate.now()) }
    var tab by remember {
        mutableStateOf(r.args["tab"] ?: if (LocalTime.now().hour >= 17) "readout" else "plan")
    }
    var picking by remember { mutableStateOf(false) }
    val day by loaded(date) { Api.obj("/day/$date") }
    val scope = rememberCoroutineScope()
    fun save(patch: JSONObject) = scope.launch {
        attempt("Not saved") { Api.patch("/day/$date", patch); App.changed() }
    }

    Box(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize()) {
            Row(
                Modifier.fillMaxWidth().windowInsetsPadding(WindowInsets.statusBars).padding(horizontal = 8.dp, vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconButton(Icons.left, "Previous day", Palette.fg) { date = date.minusDays(1) }
                Column(
                    Modifier.weight(1f).clip(RoundedCornerShape(12.dp)).clickable { picking = true }.padding(vertical = 2.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    val rel = relDay(date.toString())
                    T(if (' ' !in rel) rel else date.dayOfWeek.getDisplayName(java.time.format.TextStyle.FULL, java.util.Locale.ENGLISH), Palette.fg, 20.sp, FontWeight.SemiBold)
                    T(dayLabel(date.toString()), Palette.muted, 13.sp)
                }
                IconButton(Icons.right, "Next day", Palette.fg) { date = date.plusDays(1) }
            }
            // Morning / evening switch.
            Row(
                Modifier.padding(horizontal = 16.dp, vertical = 6.dp).fillMaxWidth().height(44.dp).clip(RoundedCornerShape(22.dp))
                    .background(Palette.dim).padding(4.dp),
            ) {
                listOf("plan" to "Morning · plan", "readout" to "Evening · readout").forEach { (k, label) ->
                    val on = tab == k
                    Box(
                        Modifier.weight(1f).fillMaxSize().clip(RoundedCornerShape(18.dp)).background(if (on) Palette.panel else Palette.dim)
                            .clickable { tab = k },
                        contentAlignment = Alignment.Center,
                    ) { T(label, if (on) Palette.fg else Palette.muted, 14.sp, FontWeight.SemiBold) }
                }
            }
            val d = day
            Column(
                Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 96.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                if (d != null) {
                    if (tab == "plan") Plan(d, ::save) else Readout(d, ::save)
                    InForce(d)
                }
            }
        }
        Fab("Log session", Modifier.align(Alignment.BottomEnd).padding(16.dp)) { App.go("log", "date" to date) }
    }

    if (picking) {
        val state = rememberDatePickerState(initialSelectedDateMillis = date.atStartOfDay().toInstant(ZoneOffset.UTC).toEpochMilli())
        DatePickerDialog(
            onDismissRequest = { picking = false },
            confirmButton = {
                TextButton(onClick = {
                    state.selectedDateMillis?.let { date = Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate() }
                    picking = false
                }) { T("OK", Palette.accent, 15.sp, FontWeight.SemiBold) }
            },
            dismissButton = { TextButton(onClick = { picking = false }) { T("Cancel", Palette.muted, 15.sp) } },
        ) { DatePicker(state = state) }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Plan(d: JSONObject, save: (JSONObject) -> Unit) {
    val boot = App.boot ?: return
    val plan = d.getJSONObject("plan")
    val suggested = d.getJSONObject("suggested")
    val saved = plan.optBoolean("saved")
    val src = if (saved) plan else suggested
    val focus = src.strs("focus")
    val ceilings = src.optJSONObject("ceilings") ?: JSONObject()
    val held = if (saved) JSONObject() else suggested.optJSONObject("held") ?: JSONObject()
    // An edit to an unsaved day saves the carried-forward plan with it.
    fun saveWith(newFocus: List<String> = focus, newCeilings: JSONObject = ceilings) =
        save(jsonOf("focus" to org.json.JSONArray(newFocus), "ceilings" to newCeilings))

    if (!saved) {
        Row(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(Palette.dim).padding(start = 14.dp, end = 6.dp, top = 6.dp, bottom = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            val carried = ceilings.length() > 0 || focus.isNotEmpty()
            T(if (carried) "Carried forward from your last plan." else "No plan yet for this day.", Palette.muted, 13.sp, modifier = Modifier.weight(1f))
            TextLink("Keep this plan") { saveWith() }
        }
    }

    SectionTitle("Focus")
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        boot.areas.forEach { a ->
            val on = a.name in focus
            Pill(a.name, on, trailing = if (on) Icons.check else null) {
                saveWith(newFocus = if (on) focus - a.name else focus + a.name)
            }
        }
    }

    SectionTitle("Ceilings")
    Card {
        boot.energyTypes.forEachIndexed { i, t ->
            if (i > 0) Line()
            val v = ceilings.num(t.id.toString())
            fun set(nv: Double?) {
                val next = JSONObject(ceilings.toString())
                if (nv == null) next.remove(t.id.toString()) else next.put(t.id.toString(), nv.coerceIn(0.0, 24.0))
                saveWith(newCeilings = next)
            }
            Column(Modifier.padding(start = 16.dp, end = 8.dp, top = 6.dp, bottom = 6.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Dot(t.color, 10)
                    HGap(10)
                    T(t.name, Palette.fg, 15.sp, FontWeight.Medium, Modifier.weight(1f))
                    StepButton(Icons.minus, "Lower ${t.name} ceiling", v != null && v > 0) { set((v ?: 0.0) - 0.5) }
                    T(if (v == null) "–" else hrs(v).replace("h", " h"), if (v == null) Palette.subtle else Palette.fg, 15.sp, FontWeight.SemiBold,
                        Modifier.width(56.dp), oneLine = true)
                    StepButton(Icons.plus, "Raise ${t.name} ceiling", true) { set(if (v == null) 1.0 else v + 0.5) }
                    StepButton(Icons.close, "No ${t.name} ceiling", v != null) { set(null) }
                }
                held.optJSONObject(t.id.toString())?.let { h ->
                    val since = shortDate(h.optString("since"))
                    T(
                        if (h.optInt("day") <= 3) "Holding at ${hrs(v)} after \"too high\" on $since (day ${h.optInt("day")} of 3)."
                        else "Easing back toward ${hrs(h.num("from"))} after \"too high\" on $since.",
                        Palette.muted, 12.sp, modifier = Modifier.padding(start = 20.dp, bottom = 4.dp),
                    )
                }
            }
        }
    }
}

@Composable
private fun Readout(d: JSONObject, save: (JSONObject) -> Unit) {
    val boot = App.boot ?: return
    val rows = d.objs("readout")
    val feedback = d.getJSONObject("plan").optJSONObject("ceiling_feedback") ?: JSONObject()
    SectionTitle("Planned and actual")
    if (rows.isEmpty()) Card(pad = 16.dp) { T("Nothing logged or planned for this day.", Palette.muted, 14.sp) }
    else {
        // One scale for every bar: 8 h, or more if a value is bigger.
        val scale = maxOf(8.0, rows.maxOf { maxOf(it.optDouble("spent"), it.num("planned") ?: 0.0) })
        Card {
            rows.forEachIndexed { i, r ->
                if (i > 0) Line()
                val t = boot.type(r.getLong("energy_type_id"))
                val planned = r.num("planned")
                val over = r.optBoolean("over")
                Column(Modifier.padding(horizontal = 16.dp, vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Dot(t?.color ?: Palette.subtle, 10)
                        T(r.optString("name"), Palette.fg, 15.sp, FontWeight.Medium, Modifier.weight(1f))
                        if (planned != null) T("planned ${hrs(planned)}", Palette.subtle, 13.sp)
                        T(hrs(r.optDouble("spent")), if (over) Palette.red else Palette.fg, 15.sp, FontWeight.SemiBold)
                        if (over) Tag("over", bg = Palette.red.copy(alpha = 0.18f), fg = Palette.red)
                    }
                    BoxWithConstraints(Modifier.fillMaxWidth().height(8.dp).clip(RoundedCornerShape(4.dp)).background(Palette.dim)) {
                        val w = maxWidth
                        Box(Modifier.width(w * (r.optDouble("spent") / scale).toFloat().coerceIn(0f, 1f)).fillMaxSize()
                            .clip(RoundedCornerShape(4.dp)).background(t?.color ?: Palette.accent))
                        if (planned != null) Box(Modifier.offset(x = w * (planned / scale).toFloat().coerceIn(0f, 1f) - 1.dp).width(2.dp).fillMaxSize().background(Color.White))
                    }
                }
            }
        }
        T("Bars share one scale, 0 to ${num(scale)} h. The white mark is the ceiling you set.", Palette.subtle, 12.sp)
    }

    val withCeiling = rows.filter { it.num("planned") != null }
    if (withCeiling.isNotEmpty()) {
        SectionTitle("Were today's ceilings about right?")
        Card {
            withCeiling.forEachIndexed { i, r ->
                if (i > 0) Line()
                val id = r.getLong("energy_type_id").toString()
                Column(Modifier.padding(horizontal = 16.dp, vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    T(r.optString("name"), Palette.fg, 15.sp, FontWeight.Medium)
                    Row(Modifier.fillMaxWidth().height(40.dp).clip(RoundedCornerShape(20.dp)).border(1.dp, Palette.strong, RoundedCornerShape(20.dp))) {
                        listOf("too_low" to "Too low", "about_right" to "About right", "too_high" to "Too high").forEachIndexed { j, (v, label) ->
                            val on = feedback.optString(id) == v
                            if (j > 0) Box(Modifier.width(1.dp).fillMaxSize().background(Palette.strong))
                            Box(
                                Modifier.weight(1f).fillMaxSize().background(if (on) Palette.selected else Color.Transparent)
                                    .clickable { save(jsonOf("ceiling_feedback" to jsonOf(id to (if (on) null else v)))) },
                                contentAlignment = Alignment.Center,
                            ) { T(label, if (on) Palette.accentFg else Palette.muted, 13.sp, FontWeight.SemiBold) }
                        }
                    }
                }
            }
        }
        T("\"Too high\" suggests about 20% less for that type for the next three days, then eases back. Tap an answer again to clear it.", Palette.subtle, 12.sp)
    }
}

@Composable
private fun InForce(d: JSONObject) {
    val states = d.objs("in_force")
    SectionTitle("In force")
    Card {
        if (states.isEmpty()) T("Nothing in force.", Palette.muted, 14.sp, modifier = Modifier.padding(16.dp))
        states.forEachIndexed { i, s ->
            if (i > 0) Line()
            Row(
                Modifier.fillMaxWidth().clickable { App.go("states") }.padding(horizontal = 16.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                SeverityRing(s.optString("kind"), s.optDouble("effective_severity"), 18)
                Column {
                    T(s.optString("name"), Palette.fg, 15.sp, FontWeight.Medium)
                    T(stateDetail(s), Palette.muted, 13.sp)
                }
            }
        }
    }
}

@Composable
private fun StepButton(d: String, label: String, enabled: Boolean, onClick: () -> Unit) {
    Box(
        Modifier.size(40.dp).clip(CircleShape).clickable(enabled = enabled, onClickLabel = label, onClick = onClick).semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) { Icon(d, if (enabled) Palette.fg else Palette.strong, 18) }
}

@Composable
fun TextLink(text: String, color: Color = Palette.accent, onClick: () -> Unit) {
    Box(Modifier.clip(RoundedCornerShape(18.dp)).clickable(onClick = onClick).padding(horizontal = 12.dp, vertical = 8.dp)) {
        T(text, color, 14.sp, FontWeight.SemiBold)
    }
}
