package com.aakash.jitterbug

import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimePicker
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import kotlinx.coroutines.delay
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZoneOffset

/** One energy type of a session: share in percent, intensity 1-5. */
data class Part(val typeId: Long, val share: Int, val difficulty: Int?)

/** A session being written, as web/src/sessions/SessionForm.tsx's SessionDraft. */
data class Draft(
    val hours: Double? = null,
    val taskId: Long? = null,
    val taskTitle: String? = null,
    val label: String = "",
    val areaId: Long? = null,
    val kind: String = "task",
    val parts: List<Part> = emptyList(),
    val subtypes: List<Long> = emptyList(),
    val loggedFor: LocalDate = LocalDate.now(),
    val startedAt: LocalTime? = null,
    val note: String = "",
    val custom: JSONObject = JSONObject(),
) {
    /** Shares must add up to 100 when there is more than one type. */
    val valid get() = (hours ?: 0.0) > 0 && parts.isNotEmpty() && (parts.size == 1 || parts.sumOf { it.share } == 100)

    fun body(): JSONObject {
        val first = parts.firstOrNull()
        return jsonOf(
            "task_id" to taskId,
            "label" to label.trim().ifBlank { null },
            "area_id" to areaId,
            "kind" to kind,
            "energy_type_id" to first?.typeId,
            "hours" to hours,
            "difficulty" to first?.difficulty,
            "subtypes" to JSONArray(subtypes),
            "logged_for" to loggedFor.toString(),
            "started_at" to startedAt?.let { loggedFor.atTime(it).atZone(ZoneId.systemDefault()).toInstant().toString() },
            "note" to note.ifBlank { null },
            "custom" to custom,
        ).apply {
            if (parts.size > 1) put("energies", JSONArray(parts.map { jsonOf("energy_type_id" to it.typeId, "share" to it.share / 100.0, "difficulty" to it.difficulty) }))
        }
    }

    companion object {
        /** A saved session, back into a draft for editing. */
        fun of(s: JSONObject): Draft {
            val energies = s.objs("energies")
            val parts = if (energies.isNotEmpty()) energies.map { Part(it.getLong("energy_type_id"), Math.round(it.optDouble("share") * 100).toInt(), it.id("difficulty")?.toInt()) }
            else listOf(Part(s.getLong("energy_type_id"), 100, s.id("difficulty")?.toInt()))
            return Draft(
                hours = s.optDouble("hours"), taskId = s.id("task_id"), label = s.str("label") ?: "", areaId = s.id("area_id"),
                kind = s.optString("kind", "task"), parts = parts, subtypes = s.objs("subtypes").map { it.getLong("subtype_id") },
                loggedFor = LocalDate.parse(s.getString("logged_for")),
                startedAt = s.str("started_at")?.let { Instant.parse(it).atZone(ZoneId.systemDefault()).toLocalTime() },
                note = s.str("note") ?: "", custom = s.optJSONObject("custom") ?: JSONObject(),
            )
        }
    }
}

/** "1.5", "1 h 30 m", "90m", "1:30" -> hours. Input parsing only. */
fun parseHours(s: String): Double? {
    val t = s.trim().lowercase()
    if (t.isEmpty()) return null
    Regex("""^(\d+):(\d{1,2})$""").find(t)?.let { return it.groupValues[1].toInt() + it.groupValues[2].toInt() / 60.0 }
    t.toDoubleOrNull()?.let { return it }
    val h = Regex("""([\d.]+)\s*h""").find(t)?.groupValues?.get(1)?.toDoubleOrNull() ?: 0.0
    val m = Regex("""([\d.]+)\s*m""").find(t)?.groupValues?.get(1)?.toDoubleOrNull() ?: 0.0
    return if (h == 0.0 && m == 0.0) null else h + m / 60
}

/** Hours as the duration field shows them: "1 h 30 m". */
fun durationText(h: Double?): String {
    if (h == null) return ""
    val m = Math.round(h * 60)
    return when {
        m < 60 -> "$m m"
        m % 60 == 0L -> "${m / 60} h"
        else -> "${m / 60} h ${m % 60} m"
    }
}

/** The big duration field with quick picks (Log session). */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun DurationCard(d: Draft, text: String, onText: (String) -> Unit, set: (Draft) -> Unit) {
    Card(pad = 16.dp) {
        T("Duration", Palette.muted, 13.sp)
        BasicTextField(
            text, { onText(it); set(d.copy(hours = parseHours(it))) },
            textStyle = TextStyle(color = Palette.fg, fontSize = 34.sp, fontWeight = FontWeight.SemiBold),
            cursorBrush = SolidColor(Palette.accent), singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Text),
            modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp),
            decorationBox = { inner -> if (text.isEmpty()) T("0 h", Palette.strong, 34.sp, FontWeight.SemiBold); inner() },
        )
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf("15m" to 0.25, "30m" to 0.5, "1h" to 1.0, "2h" to 2.0).forEach { (l, h) ->
                Pill(l, d.hours == h) { onText(durationText(h)); set(d.copy(hours = h)) }
            }
            Pill("+15m") { val h = (d.hours ?: 0.0) + 0.25; onText(durationText(h)); set(d.copy(hours = h)) }
        }
    }
}

/** Date, start time, description, task, area, energy types and subtypes. */
@OptIn(ExperimentalLayoutApi::class, ExperimentalMaterial3Api::class)
@Composable
fun SessionFields(d: Draft, set: (Draft) -> Unit) {
    val boot = App.boot ?: return
    var pickDate by remember { mutableStateOf(false) }
    var pickTime by remember { mutableStateOf(false) }
    var pickTask by remember { mutableStateOf(false) }
    var addingSubtype by remember { mutableStateOf(false) }
    var showNote by remember { mutableStateOf(d.note.isNotEmpty()) }

    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            FieldBox("Date logged", relDay(d.loggedFor.toString()).let { if (' ' in it) it else "$it, ${shortDate(d.loggedFor.toString())}" }, Modifier.weight(1f)) { pickDate = true }
            FieldBox("Started at", d.startedAt?.toString()?.take(5) ?: "–", Modifier.weight(1f)) { pickTime = true }
        }
        TextBox("Description", d.label, "What did you do?") { set(d.copy(label = it)) }
        Row(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(Palette.panel).border(1.dp, Palette.border, RoundedCornerShape(14.dp))
                .clickable { pickTask = true }.padding(start = 14.dp, end = 8.dp, top = 10.dp, bottom = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                T("Task", Palette.muted, 12.sp)
                T(d.taskTitle ?: if (d.taskId != null) "Task #${d.taskId}" else "No task", Palette.fg, 15.sp, FontWeight.Medium)
            }
            Icon(Icons.right, Palette.subtle, 20)
        }

        SectionTitle("Details")
        Card {
            Row(Modifier.padding(horizontal = 16.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                T("Kind", Palette.muted, 14.sp, modifier = Modifier.width(64.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Pill("Work", d.kind == "task") { set(d.copy(kind = "task")) }
                    Pill("Event", d.kind == "event") { set(d.copy(kind = "event")) }
                }
            }
            Line()
            Row(Modifier.padding(horizontal = 16.dp, vertical = 12.dp), verticalAlignment = Alignment.Top) {
                T("Area", Palette.muted, 14.sp, modifier = Modifier.width(64.dp).padding(top = 8.dp))
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    boot.areas.forEach { a -> Pill(a.name, d.areaId == a.id) { set(d.copy(areaId = if (d.areaId == a.id) null else a.id)) } }
                }
            }
            Line()
            Column(Modifier.padding(horizontal = 16.dp, vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    T("Energy types", Palette.muted, 14.sp, modifier = Modifier.weight(1f))
                    val unused = boot.energyTypes.filter { t -> d.parts.none { it.typeId == t.id } }
                    if (d.parts.size < 4 && unused.isNotEmpty()) TextLink("+ Add a type") {
                        val parts = d.parts + Part(unused.first().id, 0, d.parts.lastOrNull()?.difficulty ?: 2)
                        set(d.copy(parts = parts.mapIndexed { i, p -> p.copy(share = if (parts.size == 1) 100 else if (i == 0) 100 - (parts.size - 1) * (100 / parts.size) else 100 / parts.size) }))
                    }
                }
                if (d.parts.isEmpty()) {
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        boot.energyTypes.forEach { t -> Pill(t.name, dot = t.color) { set(d.copy(parts = listOf(Part(t.id, 100, 2)))) } }
                    }
                }
                d.parts.forEachIndexed { i, p -> PartEditor(d, i, p, set) }
                if (d.parts.size > 1) {
                    val sum = d.parts.sumOf { it.share }
                    T(if (sum == 100) "Shares add up to 100%. Each type earns points at its own rate." else "Shares add up to $sum%; they need to make 100%.",
                        if (sum == 100) Palette.subtle else Palette.red, 12.sp)
                }
            }
            Line()
            Row(Modifier.padding(horizontal = 16.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                T("Subtypes", Palette.muted, 14.sp, modifier = Modifier.width(72.dp))
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    d.subtypes.forEach { id ->
                        Box(Modifier.clickable { set(d.copy(subtypes = d.subtypes - id)) }) { Tag(boot.subtype(id)?.name ?: "#$id", round = 16) }
                    }
                    Box(
                        Modifier.size(32.dp).clip(RoundedCornerShape(16.dp)).border(1.dp, Palette.strong, RoundedCornerShape(16.dp)).clickable { addingSubtype = true },
                        contentAlignment = Alignment.Center,
                    ) { T("+", Palette.muted, 18.sp) }
                }
            }
        }
        if (showNote) TextBox("Note", d.note, "Anything to remember", single = false) { set(d.copy(note = it)) }
        else TextLink("+ Add a note") { showNote = true }
    }

    if (pickDate) DateDialog(d.loggedFor, { pickDate = false }) { set(d.copy(loggedFor = it)) }
    if (pickTime) {
        val now = d.startedAt ?: LocalTime.now()
        val state = rememberTimePickerState(now.hour, now.minute, true)
        DatePickerDialog(
            onDismissRequest = { pickTime = false },
            confirmButton = { TextButton({ set(d.copy(startedAt = LocalTime.of(state.hour, state.minute))); pickTime = false }) { T("OK", Palette.accent, 15.sp, FontWeight.SemiBold) } },
            dismissButton = { TextButton({ set(d.copy(startedAt = null)); pickTime = false }) { T("No time", Palette.muted, 15.sp) } },
        ) { Box(Modifier.fillMaxWidth().padding(16.dp), contentAlignment = Alignment.Center) { TimePicker(state) } }
    }
    if (pickTask) TaskPicker(onDismiss = { pickTask = false }) { t ->
        set(d.copy(taskId = t?.getLong("id"), taskTitle = t?.getString("title"),
            areaId = t?.getLong("area_id") ?: d.areaId,
            parts = if (d.parts.isEmpty() && t?.id("energy_type_id") != null) listOf(Part(t.getLong("energy_type_id"), 100, t.id("difficulty")?.toInt() ?: 2)) else d.parts))
        pickTask = false
    }
    if (addingSubtype) {
        val types = d.parts.map { it.typeId }.toSet()
        val options = boot.subtypes.filter { (types.isEmpty() || it.raw.optLong("energy_type_id") in types) && it.id !in d.subtypes }
        PickSheet("Add a subtype", options.map { it.id to it.name }, { addingSubtype = false }) { set(d.copy(subtypes = d.subtypes + it)); addingSubtype = false }
    }
}

@Composable
private fun PartEditor(d: Draft, i: Int, p: Part, set: (Draft) -> Unit) {
    val boot = App.boot ?: return
    val t = boot.type(p.typeId)
    var choosing by remember { mutableStateOf(false) }
    fun update(np: Part) = set(d.copy(parts = d.parts.toMutableList().also { it[i] = np }))
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(Modifier.weight(1f).clip(RoundedCornerShape(8.dp)).clickable { choosing = true }.padding(vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Dot(t?.color ?: Palette.subtle, 10)
                T(t?.name ?: "?", Palette.fg, 15.sp, FontWeight.Medium)
                Icon(Icons.down, Palette.subtle, 16)
            }
            if (d.parts.size > 1) {
                T("share", Palette.muted, 13.sp)
                // Selects the number on focus, so typing replaces it.
                var tfv by remember { mutableStateOf(TextFieldValue(p.share.toString())) }
                var focused by remember { mutableStateOf(false) }
                if ((tfv.text.toIntOrNull() ?: 0) != p.share) tfv = TextFieldValue(p.share.toString(), TextRange(p.share.toString().length))
                LaunchedEffect(focused) { if (focused) { delay(80); tfv = tfv.copy(selection = TextRange(0, tfv.text.length)) } }
                BasicTextField(
                    tfv, { v ->
                        val digits = v.text.filter(Char::isDigit).take(3)
                        tfv = v.copy(text = digits)
                        update(p.copy(share = digits.toIntOrNull() ?: 0))
                    },
                    textStyle = TextStyle(color = Palette.fg, fontSize = 14.sp), singleLine = true, cursorBrush = SolidColor(Palette.accent),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.onFocusChanged { focused = it.isFocused }.width(52.dp).height(36.dp).clip(RoundedCornerShape(10.dp)).background(Palette.dim)
                        .border(1.dp, Palette.strong, RoundedCornerShape(10.dp)).padding(horizontal = 10.dp, vertical = 8.dp),
                )
                T("%", Palette.muted, 13.sp)
                IconButton(Icons.close, "Remove ${t?.name}", Palette.subtle, 36) {
                    val rest = d.parts.filterIndexed { j, _ -> j != i }
                    set(d.copy(parts = if (rest.size == 1) rest.map { it.copy(share = 100) } else rest))
                }
            } else if (d.parts.size == 1) {
                IconButton(Icons.close, "Clear energy type", Palette.subtle, 36) { set(d.copy(parts = emptyList())) }
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            (1..5).forEach { n ->
                val on = p.difficulty == n
                Row(
                    Modifier.weight(1f).height(36.dp).clip(RoundedCornerShape(10.dp)).background(if (on) Palette.selected else Color.Transparent)
                        .border(1.dp, if (on) Palette.accent else Palette.strong, RoundedCornerShape(10.dp))
                        .clickable { update(p.copy(difficulty = if (on) null else n)) },
                    horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically,
                ) {
                    Dot(Palette.intensity[n - 1])
                    HGap(4)
                    T(n.toString(), if (on) Palette.fg else Palette.muted, 14.sp, FontWeight.SemiBold)
                }
            }
        }
    }
    if (choosing) {
        val options = boot.energyTypes.filter { o -> o.id == p.typeId || d.parts.none { it.typeId == o.id } }
        PickSheet("Energy type", options.map { it.id to it.name }, { choosing = false }) { update(p.copy(typeId = it)); choosing = false }
    }
}

/** Labelled text field in the mockups' boxed style. */
@Composable
fun TextBox(label: String, value: String, placeholder: String = "", single: Boolean = true, keyboard: KeyboardType = KeyboardType.Text, password: Boolean = false, onChange: (String) -> Unit) {
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(Palette.panel).border(1.dp, Palette.border, RoundedCornerShape(14.dp))
            .padding(horizontal = 14.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        T(label, Palette.muted, 12.sp)
        BasicTextField(
            value, onChange, singleLine = single, cursorBrush = SolidColor(Palette.accent),
            textStyle = TextStyle(color = Palette.fg, fontSize = 15.sp),
            keyboardOptions = KeyboardOptions(keyboardType = if (password) KeyboardType.Password else keyboard),
            visualTransformation = if (password) androidx.compose.ui.text.input.PasswordVisualTransformation() else androidx.compose.ui.text.input.VisualTransformation.None,
            modifier = Modifier.fillMaxWidth().padding(top = 2.dp, bottom = 4.dp).semantics { contentDescription = label },
            decorationBox = { inner -> if (value.isEmpty()) T(placeholder, Palette.subtle, 15.sp); inner() },
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DateDialog(initial: LocalDate?, onDismiss: () -> Unit, clearLabel: String? = null, onClear: () -> Unit = {}, onPick: (LocalDate) -> Unit) {
    val state = rememberDatePickerState(initialSelectedDateMillis = (initial ?: LocalDate.now()).atStartOfDay().toInstant(ZoneOffset.UTC).toEpochMilli())
    DatePickerDialog(
        onDismissRequest = onDismiss,
        confirmButton = {
            TextButton({ state.selectedDateMillis?.let { onPick(Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate()) }; onDismiss() }) {
                T("OK", Palette.accent, 15.sp, FontWeight.SemiBold)
            }
        },
        dismissButton = {
            TextButton({ if (clearLabel != null) onClear(); onDismiss() }) { T(clearLabel ?: "Cancel", Palette.muted, 15.sp) }
        },
    ) { DatePicker(state = state) }
}

/** A bottom sheet listing choices. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PickSheet(title: String, options: List<Pair<Long, String>>, onDismiss: () -> Unit, onPick: (Long) -> Unit) {
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), containerColor = Palette.raised) {
        T(title, Palette.fg, 18.sp, FontWeight.SemiBold, Modifier.padding(start = 20.dp, bottom = 8.dp))
        if (options.isEmpty()) Empty("Nothing to choose.")
        LazyColumn {
            items(options, key = { it.first }) { (id, name) ->
                T(name, Palette.fg, modifier = Modifier.fillMaxWidth().clickable { onPick(id) }.padding(horizontal = 20.dp, vertical = 14.dp))
            }
        }
        Spacer(Modifier.height(24.dp))
    }
}

/** Search every task (GET /api/tasks?brief=1). Picks null for "No task". */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TaskPicker(onDismiss: () -> Unit, allowNone: Boolean = true, onPick: (JSONObject?) -> Unit) {
    var query by remember { mutableStateOf("") }
    val tasks by loaded { Api.arr("/tasks?brief=1").objs() }
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), containerColor = Palette.raised) {
        Column(Modifier.fillMaxHeight(0.85f)) {
            T("Pick a task", Palette.fg, 18.sp, FontWeight.SemiBold, Modifier.padding(start = 16.dp, end = 16.dp, bottom = 8.dp))
            OutlinedTextField(
                query, { query = it }, singleLine = true, modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
                leadingIcon = { Icon(Icons.search, Palette.muted, 20) }, placeholder = { T("Search tasks", Palette.subtle) },
            )
            Spacer(Modifier.height(8.dp))
            val shown = tasks.orEmpty().filter { (query.isBlank() || it.optString("title").contains(query, true)) && it.optString("behaviour") != "cancelled" }
            LazyColumn {
                if (allowNone && query.isBlank()) item {
                    T("No task", Palette.muted, modifier = Modifier.fillMaxWidth().clickable { onPick(null) }.padding(horizontal = 16.dp, vertical = 14.dp))
                }
                items(shown, key = { it.getLong("id") }) { t ->
                    Row(Modifier.fillMaxWidth().clickable { onPick(t) }.padding(horizontal = 16.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                        T(t.optString("title"), if (t.optString("behaviour") == "done") Palette.subtle else Palette.fg, oneLine = true, modifier = Modifier.weight(1f))
                        App.boot?.area(t.id("area_id"))?.let { T(it.name, Palette.subtle, 12.sp) }
                    }
                }
            }
        }
    }
}
