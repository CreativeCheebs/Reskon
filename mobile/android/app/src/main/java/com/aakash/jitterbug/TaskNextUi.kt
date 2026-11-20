package com.aakash.jitterbug

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.time.LocalDate

// ---------------------------------------------------------------- Round tag

/** The round label on its own: small, monospace, accent colour (SPEC 4.17). Not part of the title. */
@Composable
fun RoundTag(tag: String?, size: TextUnit = 12.sp) {
    if (tag == null) return
    Text(tag, color = Palette.accent, maxLines = 1, style = TextStyle(fontSize = size, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Medium))
}

/**
 * A title with its round label after it. One line ([oneLine]): the title gives way (ellipsis) so
 * the label is never cut off; used by list rows. Otherwise it wraps, the label after the last word.
 * A strike-through marks the title only, never the label.
 */
@Composable
fun RoundTitle(
    t: JSONObject, color: Color = Palette.fg, size: TextUnit = 15.sp, weight: FontWeight = FontWeight.Medium,
    modifier: Modifier = Modifier, strike: Boolean = false, oneLine: Boolean = true,
) {
    val tag = roundTag(t)
    if (!oneLine) {
        val text = buildAnnotatedString {
            withStyle(SpanStyle(textDecoration = if (strike) TextDecoration.LineThrough else null)) { append(t.optString("title")) }
            if (tag != null) {
                append("  ")
                withStyle(SpanStyle(color = Palette.accent, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Medium, fontSize = (size.value * 0.8f).sp)) { append(tag) }
            }
        }
        Text(text, modifier, color = color, style = TextStyle(fontSize = size, fontWeight = weight, fontFeatureSettings = "tnum"))
        return
    }
    Row(modifier, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        T(t.optString("title"), color, size, weight, Modifier.weight(1f, fill = false), oneLine = true, strike = strike)
        RoundTag(tag, (size.value * 0.8f).sp)
    }
}

/** A title that wraps (the task screen header), with the round label after its last word. */
fun titleWithRound(title: String, tag: String?, size: TextUnit): AnnotatedString = buildAnnotatedString {
    append(title)
    if (tag != null) {
        append("  ")
        withStyle(SpanStyle(color = Palette.accent, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Medium, fontSize = (size.value * 0.65f).sp)) { append(tag) }
    }
}

// ---------------------------------------------------------------- Task screen sections

/** Chain: the task this one continues (Comes after) and the ones that continue it (Next). Hidden when there are none. */
@Composable
fun TaskChainSection(t: JSONObject) {
    val after = t.optJSONObject("follows")
    val next = t.objs("followed_by")
    if (after == null && next.isEmpty()) return
    SectionTitle("Chain")
    Card {
        (listOfNotNull(after?.let { "Comes after" to it }) + next.map { "Next" to it }).forEachIndexed { i, (rel, o) ->
            if (i > 0) Line()
            Row(
                Modifier.fillMaxWidth().heightIn(min = 48.dp).clickable(role = Role.Button) { App.go("task", "id" to o.getLong("id")) }
                    .padding(horizontal = 16.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                T(rel, Palette.muted, 14.sp, modifier = Modifier.width(96.dp))
                RoundTitle(o, Palette.fg, 15.sp, modifier = Modifier.weight(1f), oneLine = true,
                    strike = o.optString("behaviour") == "done")
                Icon(Icons.right, Palette.subtle, 18)
            }
        }
    }
}

/**
 * Rounds (or versions) of this task's series: the rounds/versions switch, then every round with its
 * number, done date or state, hours and points, listed side by side and never added up. Shown only
 * for a task that is a round.
 */
@Composable
fun TaskRoundsSection(t: JSONObject) {
    val tag = roundTag(t) ?: return
    val scope = rememberCoroutineScope()
    val kind = t.str("round_kind") ?: "round"
    val id = t.getLong("id")
    SectionTitle(if (kind == "version") "Versions" else "Rounds")
    Card {
        Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            T("This one", Palette.muted, 14.sp)
            RoundTag(tag, 14.sp)
            Box(Modifier.weight(1f))
            fun set(k: String) {
                if (k != kind) scope.launch { attempt("Not saved") { Api.post("/tasks/$id/round-kind", jsonOf("kind" to k)); App.changed() } }
            }
            Pill("Rounds #", kind != "version", height = 48, dense = true) { set("round") }
            Pill("Versions v", kind == "version", height = 48, dense = true) { set("version") }
        }
        t.objs("rounds").forEach { r ->
            Line()
            val here = r.getLong("id") == id
            Row(
                Modifier.fillMaxWidth().heightIn(min = 48.dp)
                    .then(if (here) Modifier else Modifier.clickable(role = Role.Button) { App.go("task", "id" to r.getLong("id")) })
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Box(Modifier.width(44.dp)) { RoundTag(roundTag(r.id("no"), kind), 14.sp) }
                T(roundState(r) + if (here) " · this one" else "", if (here) Palette.fg else Palette.muted, 14.sp, modifier = Modifier.weight(1f), oneLine = true)
                T(hrs(r.optDouble("logged_h")), Palette.fg, 14.sp)
                T("${num(r.optDouble("points"))} pts", Palette.muted, 14.sp)
            }
        }
    }
}

// ---------------------------------------------------------------- What's next?

/**
 * "What's next?" for task [t]. [start] is "ask" (after marking it done: Continue, Next round or
 * Nothing), "continue" or "round" (from a menu). Errors show in the sheet and what was typed stays.
 * After a task is made it says so and offers to open it.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WhatsNextSheet(t: JSONObject, start: String, onDismiss: () -> Unit) {
    val isEpic = t.optString("type") == "epic"
    var mode by remember { mutableStateOf(start.takeIf { it != "ask" }) }
    var made by remember { mutableStateOf<JSONObject?>(null) }
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), containerColor = Palette.raised) {
        Column(
            Modifier.verticalScroll(rememberScrollState()).padding(horizontal = 20.dp).padding(bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            val done = made
            if (done != null) {
                T("Made", Palette.muted, 13.sp)
                RoundTitle(done, size = 17.sp, weight = FontWeight.SemiBold)
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Pill("Open it", true, height = 48, action = true) { onDismiss(); App.go("task", "id" to done.getLong("id")) }
                    Pill("Close", height = 48, action = true) { onDismiss() }
                }
                return@Column
            }
            T(when (start) { "continue" -> "Continue with a new ${Terms.task}"; "round" -> "Start next round"; else -> "What's next?" }, Palette.fg, 18.sp, FontWeight.SemiBold,
                Modifier.semantics { heading() })
            if (start == "ask") {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Pill("Continue", mode == "continue", height = 48) { mode = "continue" }
                    if (!isEpic) Pill("Next round", mode == "round", height = 48) { mode = "round" }
                    Pill("Nothing", height = 48, action = true) { onDismiss() }
                }
                if (mode == null) T("The ${Terms.task} is done either way.", Palette.muted, 13.sp)
            }
            when (mode) {
                "continue" -> ContinueForm(t) { made = it; App.changed() }
                "round" -> NextRoundForm(t) { made = it; App.changed() }
            }
        }
    }
}

/** Runs a create and gives back the error text instead of a toast (a toast would sit under the sheet). */
private suspend fun tryCreate(f: suspend () -> JSONObject): Pair<JSONObject?, String?> = try {
    f() to null
} catch (e: CancellationException) {
    throw e
} catch (e: Exception) {
    null to (e.message ?: "Not made")
}

/** The form's send button: filled accent, grey while it can't be sent. */
@Composable
private fun PrimaryButton(label: String, enabled: Boolean, onClick: () -> Unit) {
    Box(
        Modifier.fillMaxWidth().heightIn(min = 48.dp).clip(RoundedCornerShape(24.dp))
            .background(if (enabled) Palette.accent else Palette.chip).clickable(enabled = enabled, role = Role.Button, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) { T(label, if (enabled) Palette.onAccent else Palette.subtle, 15.sp, FontWeight.SemiBold) }
}

@Composable
private fun ChoiceRow(label: String, on: Boolean, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().heightIn(min = 48.dp).clickable(role = Role.RadioButton, onClick = onClick).semantics { selected = on },
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(Modifier.width(20.dp), contentAlignment = Alignment.Center) {
            if (on) Icon(Icons.check, Palette.accent, 18, 3f) else Icon(Icons.circle, Palette.strong, 18)
        }
        T(label, if (on) Palette.fg else Palette.muted, 15.sp, modifier = Modifier.weight(1f))
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ContinueForm(t: JSONObject, onMade: (JSONObject) -> Unit) {
    val id = t.getLong("id")
    val kind = remember { continueKind(t) }
    val scope = rememberCoroutineScope()
    var title by remember { mutableStateOf("") }
    var copy by remember { mutableStateOf(CONTINUE_COPIES.map { it.first }.toSet()) }
    var epics by remember { mutableStateOf(EpicNames.all()) }
    var parentName by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(Unit) {
        runCatching { EpicNames.load(); epics = EpicNames.all() }
        t.id("parent_id")?.let { p -> parentName = runCatching { Api.obj("/tasks/$p").optString("title") }.getOrNull() }
    }
    val options = epicOptions(kind, t.id("epic_id")?.let { epics[it] }, parentName, epics.isNotEmpty())
    var choice by remember { mutableStateOf(options.firstOrNull()?.key) }
    var epicTitle by remember { mutableStateOf(t.optString("title")) }
    var epicId by remember { mutableStateOf<Long?>(null) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    TextBox("Next ${Terms.task}", title, "What comes after this?") { title = it }
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        T("Take from this ${Terms.task} (the area always comes along)", Palette.muted, 12.sp)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            CONTINUE_COPIES.forEach { (k, label) -> Pill(label, k in copy, height = 48, dense = true) { copy = if (k in copy) copy - k else copy + k } }
        }
    }
    if (options.isNotEmpty()) Column {
        T(if (kind == ContinueKind.SUBTASK) "Where it goes" else Terms.capEpic, Palette.muted, 12.sp)
        options.forEach { o ->
            ChoiceRow(o.label, choice == o.key) { choice = o.key }
            if (choice == o.key && o.key == "new") TextBox("${Terms.capEpic} name", epicTitle) { epicTitle = it }
            if (choice == o.key && o.key == "pick") FlowRow(Modifier.padding(start = 32.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                epics.forEach { (eid, name) -> Pill(name, epicId == eid, height = 48, dense = true) { epicId = eid } }
            }
        }
    }
    error?.let { T(it, Palette.red, 14.sp) }
    PrimaryButton(if (busy) "Making…" else "Make the next ${Terms.task}", canContinue(title, choice, epicId) && !busy) {
        busy = true
        error = null
        scope.launch {
            val (made, err) = tryCreate { Api.post("/tasks/$id/continue", continueBody(kind, title, copy, choice, epicTitle, epicId, today())) }
            busy = false
            error = err
            made?.let(onMade)
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun NextRoundForm(t: JSONObject, onMade: (JSONObject) -> Unit) {
    val id = t.getLong("id")
    val boot = App.boot ?: return
    val scope = rememberCoroutineScope()
    val first = t.id("round_of") == null
    var kind by remember { mutableStateOf("round") }
    var snooze by remember { mutableStateOf<LocalDate?>(null) }
    var picking by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val today = remember { LocalDate.now() }
    val choices = remember(boot.settings) { snoozeChoices(boot.settings, today) }

    T(if (first) "The same ${Terms.task} again. This one becomes the first; the new one is the next."
      else "The same ${Terms.task} again, numbered after the highest so far.", Palette.muted, 14.sp)
    if (first) Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        T("Count them as", Palette.muted, 12.sp)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Pill("Rounds #", kind == "round", height = 48, dense = true) { kind = "round" }
            Pill("Versions v", kind == "version", height = 48, dense = true) { kind = "version" }
        }
    }
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        T("Comes back", Palette.muted, 12.sp)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Pill("Right away", snooze == null, height = 48, dense = true) { snooze = null }
            choices.forEach { c -> Pill(c.label, snooze == c.date, height = 48, dense = true) { snooze = c.date } }
            val other = snooze?.takeIf { s -> choices.none { it.date == s } }
            Pill(other?.let { dayLabel(it.toString()) } ?: "Pick a date…", other != null, height = 48, dense = true) { picking = true }
        }
        snooze?.let { T("Snoozed until ${dayLabel(it.toString())}", Palette.muted, 12.sp) }
    }
    error?.let { T(it, Palette.red, 14.sp) }
    PrimaryButton(if (busy) "Starting…" else "Start next round", !busy) {
        busy = true
        error = null
        scope.launch {
            val (made, err) = tryCreate { Api.post("/tasks/$id/next-round", nextRoundBody(first, kind, snooze, today())) }
            busy = false
            error = err
            made?.let(onMade)
        }
    }
    if (picking) {
        val max = snoozeMaxDays(boot.settings)
        DateDialog(snooze ?: today.plusDays(1), { picking = false }, range = today.plusDays(1)..today.plusDays(max.toLong())) { snooze = it }
    }
}
