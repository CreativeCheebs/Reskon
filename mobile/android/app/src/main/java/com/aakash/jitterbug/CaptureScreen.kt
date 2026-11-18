package com.aakash.jitterbug

import android.app.Activity
import android.content.Intent
import android.speech.RecognizerIntent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
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
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.json.JSONObject

/** One thing quick capture read from the line: a session or a task. */
data class Entry(
    val key: Int, val intent: String, val session: Draft, val taskTitle: String, val taskArea: Long?, val parse: JSONObject,
    /** Tags for a new task, by name (a session's are in its draft). The model picks only tags that exist. */
    val taskTags: List<String> = emptyList(),
)

private var nextKey = 1

/**
 * Quick capture: one line, read by POST /api/capture (which never writes),
 * shown as entries to check, saved only on confirm. Route args: text, inbox.
 */
@Composable
fun CaptureScreen(r: Route) {
    var text by remember { mutableStateOf(r.args["text"] ?: "") }
    val entries = remember { mutableStateListOf<Entry>() }
    var parsed by remember { mutableStateOf<JSONObject?>(null) }
    var reading by remember { mutableStateOf(false) }
    var editing by remember { mutableStateOf<Int?>(null) }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val dictate = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { res ->
        if (res.resultCode == Activity.RESULT_OK) {
            res.data?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)?.firstOrNull()?.let { text = if (text.isBlank()) it else "$text $it" }
        }
    }

    // Read the line a moment after typing stops.
    LaunchedEffect(text) {
        if (text.isBlank()) { entries.clear(); parsed = null; return@LaunchedEffect }
        delay(700)
        reading = true
        val p = attempt("Could not read the line") { Api.post("/capture", jsonOf("text" to text.trim())) }
        reading = false
        if (p != null) {
            parsed = p
            entries.clear()
            val list = p.objs("entries").ifEmpty { listOf(p) }
            entries.addAll(list.map { withTaskTags(toEntry(it, text.trim())) })
        }
    }

    Box(Modifier.fillMaxSize().background(Color(0xFF0E1113))) {
        Column(
            Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.statusBars).padding(top = 16.dp)
                .clip(RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp)).background(Palette.raised),
        ) {
            Box(Modifier.fillMaxWidth().padding(top = 10.dp, bottom = 2.dp), contentAlignment = Alignment.Center) {
                Box(Modifier.width(36.dp).height(4.dp).clip(RoundedCornerShape(2.dp)).background(Palette.strong))
            }
            Row(Modifier.padding(start = 20.dp, end = 8.dp, top = 4.dp, bottom = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                T("Quick capture", Palette.fg, 20.sp, FontWeight.SemiBold, Modifier.weight(1f))
                IconButton(Icons.mic, "Dictate") {
                    runCatching { dictate.launch(Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)) }
                        .onFailure { App.say("No speech recogniser on this phone") }
                }
            }
            Column(
                Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(start = 16.dp, end = 16.dp, top = 4.dp, bottom = 16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                BasicTextField(
                    text, { text = it }, cursorBrush = SolidColor(Palette.accent),
                    textStyle = TextStyle(color = Palette.fg, fontSize = 16.sp),
                    modifier = Modifier.fillMaxWidth().height(92.dp).clip(RoundedCornerShape(14.dp)).background(Palette.bg)
                        .border(1.dp, Palette.accent, RoundedCornerShape(14.dp)).padding(horizontal = 14.dp, vertical = 12.dp),
                    decorationBox = { inner -> if (text.isEmpty()) T("e.g. 2 hours on the tax receipts, level 4", Palette.strong, 16.sp); inner() },
                )
                val status = when {
                    reading -> "Reading…"
                    parsed == null -> "Type a line. Nothing is saved until you confirm."
                    parsed?.optBoolean("fallback") == true -> "Read without the model (${parsed?.optString("fallback_reason")}). Check the entries."
                    else -> "Read as ${entries.size} ${if (entries.size == 1) "entry" else "entries"}. Nothing is saved until you confirm."
                }
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (parsed != null && !reading) Icon(Icons.check, Palette.green, 16, 2.5f)
                    T(status, Palette.muted, 13.sp)
                }
                entries.forEachIndexed { i, e ->
                    EntryCard(e, onRemove = { entries.removeAt(i) }, onEdit = { editing = e.key }, onSwitch = {
                        entries[i] = e.copy(intent = if (e.intent == "task") "session" else "task")
                    })
                }
                TextLink("+ Add another entry by hand") {
                    entries.add(Entry(nextKey++, "session", Draft(label = "", note = text.trim()), "", null, JSONObject()))
                    editing = entries.last().key
                }
            }
            val can = entries.isNotEmpty() && entries.all { if (it.intent == "task") it.taskTitle.isNotBlank() && it.taskArea != null else it.session.valid }
            BottomAction(
                if (entries.size > 1) "Save ${entries.size} entries" else "Save", enabled = can && !busy,
                secondary = "Cancel", onSecondary = { App.back() },
            ) {
                if (busy) return@BottomAction
                busy = true
                scope.launch {
                    // Saves one by one; a saved entry leaves the list, so after an error only the rest remain.
                    while (entries.isNotEmpty()) {
                        val e = entries.first()
                        val ok = attempt("Not saved") { save(e, text.trim(), entries.size) } != null
                        if (!ok) break
                        entries.removeAt(0)
                    }
                    busy = false
                    App.changed() // also after a partial save, so what was saved shows
                    if (entries.isEmpty()) {
                        r.long("inbox")?.let { attempt("Inbox not updated") { Api.post("/inbox/$it/triage") } }
                        // A tag added by hand may be new, so the lists that name tags are read again.
                        runCatching { App.reloadBoot() }
                        App.back()
                        App.say("Saved")
                    }
                }
            }
        }
    }

    editing?.let { key ->
        val i = entries.indexOfFirst { it.key == key }
        if (i < 0) editing = null else EditEntrySheet(entries[i], { entries[i] = it }) { editing = null }
    }
}

/** An entry matched to an existing task shows that task's tags (they follow it); its own tags never repeat them. */
private suspend fun withTaskTags(e: Entry): Entry {
    val id = e.session.taskId ?: return e
    val boot = App.boot ?: return e
    val t = runCatching { Api.obj("/tasks/$id") }.getOrNull() ?: return e
    val fromTask = boot.tagNames(t.tagIds())
    return e.copy(session = e.session.copy(inheritedTags = fromTask, tags = e.session.tags.filter { n -> fromTask.none { it.equals(n, true) } }))
}

private fun toEntry(p: JSONObject, raw: String): Entry {
    val boot = App.boot!!
    fun typeId(name: String?) = boot.energyTypes.firstOrNull { it.name.equals(name, true) }?.id
    val area = boot.areas.firstOrNull { it.name.equals(p.str("area"), true) }?.id
    val energy = typeId(p.str("energy_type"))
    val several = p.objs("energies").map { Part(typeId(it.str("energy_type")) ?: 0, it.optInt("share"), it.id("difficulty")?.toInt()) }
    val parts = if (several.size > 1 && several.all { it.typeId != 0L }) several
    else energy?.let { listOf(Part(it, 100, p.id("difficulty")?.toInt())) } ?: emptyList()
    val subtypes = p.strs("subtypes").mapNotNull { n -> boot.subtypes.firstOrNull { it.name.equals(n, true) && (energy == null || it.raw.optLong("energy_type_id") == energy) }?.id }.take(4)
    val matched = p.id("matched_task_id")
    val title = p.str("title")
    // Only tags that exist, in their own spelling; capture never makes one.
    val tags = p.strs("tags").mapNotNull { n -> boot.tags.map { it.optString("name") }.firstOrNull { it.equals(n, true) } }.distinctBy { it.lowercase() }.take(5)
    return Entry(
        nextKey++, if (p.str("intent") == "task") "task" else "session",
        Draft(
            hours = p.num("hours"), taskId = matched, taskTitle = if (matched != null) title else null,
            label = if (matched != null) "" else title ?: raw, areaId = area,
            kind = if (p.str("kind") == "event") "event" else "task", parts = parts, subtypes = subtypes,
            note = if (raw.isNotEmpty() && !p.optBoolean("fallback") && title != null && title != raw) raw else "",
            tags = tags,
        ),
        title ?: raw, area ?: boot.areas.firstOrNull()?.id, p, tags,
    )
}

private suspend fun save(e: Entry, raw: String, count: Int) {
    val audit = jsonOf("_capture" to jsonOf("raw" to raw, "parse" to e.parse, "entries" to count, "at" to java.time.Instant.now().toString()))
    if (e.intent == "task") {
        val t = e.session.parts.firstOrNull()
        Api.post("/tasks", jsonOf("title" to e.taskTitle.trim(), "area_id" to e.taskArea, "custom" to audit, "today" to today(),
            "energy_type_id" to t?.typeId, "difficulty" to t?.difficulty, "tags" to e.taskTags.asJson()))
    } else {
        val body = e.session.body()
        body.getJSONObject("custom").put("_capture", audit.getJSONObject("_capture"))
        Api.post("/sessions", body)
    }
}

@Composable
private fun EntryCard(e: Entry, onRemove: () -> Unit, onEdit: () -> Unit, onSwitch: () -> Unit) {
    val boot = App.boot ?: return
    val d = e.session
    val first = d.parts.firstOrNull()
    Card(pad = 0.dp) {
        Column(Modifier.clickable(onClick = onEdit).padding(start = 16.dp, end = 8.dp, top = 10.dp, bottom = 14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.clickable(onClick = onSwitch)) { Tag(if (e.intent == "task") Terms.capTask else if (d.kind == "event") "Event" else "Session", bg = Palette.selected, fg = Palette.accentFg, round = 12) }
                Box(Modifier.weight(1f))
                IconButton(Icons.close, "Remove this entry", Palette.subtle, 40, onRemove)
            }
            Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.padding(end = 8.dp)) {
                if (e.intent != "task") T(d.hours?.let { durationText(it).replace(" ", "") } ?: "? h", if (d.hours == null) Palette.red else Palette.fg, 26.sp, FontWeight.SemiBold)
                T(if (e.intent == "task") e.taskTitle else d.label.ifBlank { d.taskTitle ?: "" }, Palette.fg, 15.sp, modifier = Modifier.padding(bottom = 3.dp))
            }
            val tagText = (if (e.intent == "task") e.taskTags else d.inheritedTags + d.tags).joinToString(", ") { "#$it" }.ifEmpty { "–" }
            val fields = if (e.intent == "task") listOf(
                Triple("Area", boot.area(e.taskArea)?.name ?: "Choose…", null),
                Triple("Energy type", boot.type(first?.typeId)?.name ?: "–", boot.type(first?.typeId)?.color),
                Triple("Tags", tagText, null),
            ) else listOf(
                Triple("Energy type", if (d.parts.size > 1) d.parts.joinToString(" + ") { boot.type(it.typeId)?.name ?: "?" } else boot.type(first?.typeId)?.name ?: "Choose…", boot.type(first?.typeId)?.color),
                Triple("Level", first?.difficulty?.let { "$it of 5" } ?: "–", first?.difficulty?.let { Palette.intensity[it - 1] }),
                Triple("Area", boot.area(d.areaId)?.name ?: "–", null),
                if (d.taskId != null) Triple(Terms.capTask, d.taskTitle ?: "#${d.taskId}", null) else Triple("Date", relDay(d.loggedFor.toString()), null),
                Triple("Tags", tagText, null),
            )
            fields.chunked(2).forEach { row ->
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(end = 8.dp)) {
                    row.forEach { (l, v, dot) -> FieldBox(l, v, Modifier.weight(1f), dot, Palette.bg, 52, onClick = onEdit) }
                    if (row.size == 1) Box(Modifier.weight(1f))
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class, androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
private fun EditEntrySheet(e: Entry, update: (Entry) -> Unit, onDismiss: () -> Unit) {
    val boot = App.boot ?: return
    var text by remember { mutableStateOf(durationText(e.session.hours)) }
    var pickTags by remember { mutableStateOf(false) }
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), containerColor = Palette.bg) {
        Column(
            Modifier.fillMaxHeight(0.92f).verticalScroll(rememberScrollState()).padding(start = 16.dp, end = 16.dp, bottom = 32.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                T(if (e.intent == "task") Terms.capTask else "Session", Palette.fg, 18.sp, FontWeight.SemiBold, Modifier.weight(1f))
                TextLink("Done", onClick = onDismiss)
            }
            if (e.intent == "task") {
                TextBox("Title", e.taskTitle) { update(e.copy(taskTitle = it)) }
                SectionTitle("Area")
                androidx.compose.foundation.layout.FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    boot.areas.forEach { a -> Pill(a.name, e.taskArea == a.id) { update(e.copy(taskArea = a.id)) } }
                }
                SectionTitle("Tags")
                androidx.compose.foundation.layout.FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    e.taskTags.forEach { n -> Pill("#$n", true, action = true, description = "Remove tag $n") { update(e.copy(taskTags = e.taskTags - n)) } }
                    Pill("+ Tags", action = true, description = "Choose tags") { pickTags = true }
                }
            } else {
                DurationCard(e.session, text, { text = it }) { update(e.copy(session = it)) }
                SessionFields(e.session) { update(e.copy(session = it)) }
            }
        }
    }
    if (pickTags) TagsSheet("Tags on this ${Terms.task}", e.taskTags, onDone = { update(e.copy(taskTags = it)) }) { pickTags = false }
}
