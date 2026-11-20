package com.aakash.jitterbug

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.time.LocalDate

// The "What's next?" sheet (SPEC 4.17). Continue and Next round have one shape, as on the web: a
// column of labels with one line each, then the main button at the bottom right. Switching between
// them keeps what was typed (each form's state lives in the sheet).

private val LABEL_W = 92.dp
private val FIELD_SHAPE = RoundedCornerShape(12.dp)

/** What the Continue form holds while the sheet is open. */
private class ContinueState(t: JSONObject) {
    val kind = continueKind(t)
    var title by mutableStateOf("")
    var copy by mutableStateOf(CONTINUE_COPIES.map { it.first }.toSet())
    var choice by mutableStateOf(epicOptions(kind, null, null, true).firstOrNull()?.key)
    var epicTitle by mutableStateOf(t.optString("title"))
    var epicId by mutableStateOf<Long?>(null)
}

/**
 * A create in flight and its error, one for the whole sheet: a form left mid-send (tab switched)
 * must not offer its button again, and the other form must not send at the same time.
 */
private class Sending {
    var busy by mutableStateOf(false)
    var error by mutableStateOf<String?>(null)
}

/** What the Next round form holds while the sheet is open. */
private class RoundState {
    var kind by mutableStateOf("round")
    var snooze by mutableStateOf<LocalDate?>(null)
}

/**
 * "What's next?" for task [t]. [start] is "ask" (after marking it done), "continue" or "round"
 * (from a menu); "ask" opens on Continue. Skip closes it. Errors show in the sheet and what was
 * typed stays. After a task is made it says so and offers to open it. [scope] must outlive the
 * sheet, so a create still finishes (and the screens reload) if the sheet is closed while it runs.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WhatsNextSheet(t: JSONObject, start: String, scope: CoroutineScope, onDismiss: () -> Unit) {
    val isEpic = t.optString("type") == "epic"
    var mode by remember { mutableStateOf(if (start == "round" && !isEpic) "round" else "continue") }
    var made by remember { mutableStateOf<JSONObject?>(null) }
    val cont = remember { ContinueState(t) }
    val round = remember { RoundState() }
    val sending = remember { Sending() }
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
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                T("What's next?", Palette.fg, 18.sp, FontWeight.SemiBold, Modifier.weight(1f).semantics { heading() })
                // A plain text button, as on the web: Skip makes nothing.
                Box(
                    Modifier.heightIn(min = 48.dp).clip(RoundedCornerShape(24.dp)).clickable(role = Role.Button) { onDismiss() }
                        .padding(horizontal = 14.dp),
                    contentAlignment = Alignment.Center,
                ) { T("Skip", Palette.muted, 15.sp, FontWeight.Medium) }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Pill("Continue", mode == "continue", height = 48, dense = true) { if (!sending.busy) { mode = "continue"; sending.error = null } }
                if (!isEpic) Pill("Next round", mode == "round", height = 48, dense = true) { if (!sending.busy) { mode = "round"; sending.error = null } }
            }
            when (mode) {
                "continue" -> ContinueForm(t, cont, sending, scope) { made = it }
                else -> NextRoundForm(t, round, sending, scope) { made = it }
            }
        }
    }
}

// ---------------------------------------------------------------- The two forms

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ContinueForm(t: JSONObject, s: ContinueState, sending: Sending, scope: CoroutineScope, onMade: (JSONObject) -> Unit) {
    val id = t.getLong("id")
    var epics by remember { mutableStateOf(EpicNames.all()) }
    var parentName by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(Unit) {
        orNull { EpicNames.load(); epics = EpicNames.all() }
        t.id("parent_id")?.let { p -> parentName = orNull { Api.obj("/tasks/$p").optString("title") } }
    }
    val options = epicOptions(s.kind, t.id("epic_id")?.let { epics[it] }, parentName, epics.isNotEmpty())
    // A choice no longer offered (no epics left to pick) falls back to the first one.
    LaunchedEffect(options.map { it.key }) {
        if (options.isNotEmpty() && options.none { it.key == s.choice }) s.choice = options.first().key
    }
    val ok = canContinue(s.title, s.choice, s.epicId) && !sending.busy
    val send: () -> Unit = {
        if (canContinue(s.title, s.choice, s.epicId) && !sending.busy) { // read now: a second tap before the screen redraws
            sending.busy = true
            sending.error = null
            // An emptied epic name falls back to the task's title, as on the web.
            val epicTitle = s.epicTitle.ifBlank { t.optString("title") }
            scope.launch {
                val (made, err) = tryCreate { Api.post("/tasks/$id/continue", continueBody(s.kind, s.title, s.copy, s.choice, epicTitle, s.epicId, today())) }
                sending.busy = false
                sending.error = err
                made?.let(onMade)
            }
        }
    }

    FormRow("Next ${Terms.task}") {
        FieldBox(s.title, "What comes after this?", "Next ${Terms.task} title", onDone = send) { s.title = it }
    }
    if (options.isNotEmpty()) {
        FormRow(if (s.kind == ContinueKind.SUBTASK) "Goes" else Terms.capEpic) {
            ChoiceBox(if (s.kind == ContinueKind.SUBTASK) "Where it goes" else Terms.capEpic, options.firstOrNull { it.key == s.choice }?.label ?: "",
                options.map { it.key to it.label }) { s.choice = it }
            if (s.choice == "new") FieldBox(s.epicTitle, "", "${Terms.capEpic} name") { s.epicTitle = it }
            if (s.choice == "pick") {
                ChoiceBox("Choose an ${Terms.epic}", s.epicId?.let { epics[it] } ?: "Choose an ${Terms.epic}",
                    epics.map { (eid, name) -> eid.toString() to name }) { s.epicId = it.toLong() }
            }
        }
    } else {
        FormRow(Terms.capEpic, top = 0.dp) { T("The next one is an ${Terms.epic} too.", Palette.muted, 14.sp) }
    }
    FormRow("Copy over") {
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            CONTINUE_COPIES.forEach { (k, label) -> Pill(label, k in s.copy, height = 48, dense = true) { s.copy = if (k in s.copy) s.copy - k else s.copy + k } }
        }
    }
    ErrorText(sending.error)
    MainButton(if (sending.busy) "Making…" else "Create next ${Terms.task}", ok, send)
}

@Composable
private fun NextRoundForm(t: JSONObject, s: RoundState, sending: Sending, scope: CoroutineScope, onMade: (JSONObject) -> Unit) {
    val id = t.getLong("id")
    val boot = App.boot ?: return
    val first = t.id("round_of") == null
    val kind = if (first) s.kind else t.str("round_kind") ?: "round"
    val word = if (kind == "version") "version" else "round"
    var picking by remember { mutableStateOf(false) }
    val today = remember { LocalDate.now() }
    val choices = remember(boot.settings) { snoozeChoices(boot.settings, today) }

    FormRow("Next $word", top = 0.dp) {
        if (first) {
            RoundTitle(JSONObject().put("title", t.optString("title")).put("round_no", 2).put("round_kind", kind), weight = FontWeight.SemiBold, oneLine = false)
            T("Same details. This one becomes ${roundTag(1L, kind)}.", Palette.muted, 13.sp)
        } else {
            T(t.optString("title"), Palette.fg, 15.sp, FontWeight.SemiBold)
            T("Same details, numbered after ${roundTag(t) ?: "this one"}.", Palette.muted, 13.sp)
        }
    }
    if (first) {
        FormRow("Count as") {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Pill("Rounds", s.kind == "round", height = 48, dense = true) { s.kind = "round" }
                Pill("Versions", s.kind == "version", height = 48, dense = true) { s.kind = "version" }
            }
        }
    }
    FormRow("Comes back") {
        val snooze = s.snooze
        val shown = if (snooze == null) "Right away" else choices.firstOrNull { it.date == snooze }?.label ?: dayLabel(snooze.toString())
        ChoiceBox("Comes back", shown, listOf("now" to "Right away") + choices.map { it.days.toString() to it.label } + ("pick" to "Pick a date…")) { k ->
            when (k) {
                "now" -> s.snooze = null
                "pick" -> picking = true
                else -> s.snooze = choices.firstOrNull { it.days.toString() == k }?.date
            }
        }
        if (snooze != null) T("Off the board until ${dayLabel(snooze.toString())}", Palette.muted, 13.sp)
    }
    ErrorText(sending.error)
    MainButton(if (sending.busy) "Starting…" else "Start next $word", !sending.busy) {
        if (sending.busy) return@MainButton // a second tap before the button greys out
        sending.busy = true
        sending.error = null
        scope.launch {
            val (made, err) = tryCreate { Api.post("/tasks/$id/next-round", nextRoundBody(first, s.kind, s.snooze, today())) }
            sending.busy = false
            sending.error = err
            made?.let(onMade)
        }
    }
    if (picking) {
        val max = snoozeMaxDays(boot.settings)
        DateDialog(s.snooze ?: today.plusDays(1), { picking = false }, range = today.plusDays(1)..today.plusDays(max.toLong())) { s.snooze = it }
    }
}

// ---------------------------------------------------------------- Pieces

/** One line of a form: the label in the left column, the controls beside it. [top] lines the label up with a 48dp control. */
@Composable
private fun FormRow(label: String, top: Dp = 14.dp, content: @Composable ColumnScope.() -> Unit) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
        T(label, Palette.muted, 14.sp, modifier = Modifier.width(LABEL_W).padding(top = top, end = 8.dp))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp), content = content)
    }
}

/** A one-line text box without its own label (the row's label says what it is). */
@Composable
private fun FieldBox(value: String, placeholder: String, description: String, onDone: (() -> Unit)? = null, onChange: (String) -> Unit) {
    BasicTextField(
        value, onChange, singleLine = true, cursorBrush = SolidColor(Palette.accent),
        textStyle = TextStyle(color = Palette.fg, fontSize = 15.sp),
        keyboardOptions = KeyboardOptions(imeAction = if (onDone != null) ImeAction.Done else ImeAction.Default),
        keyboardActions = KeyboardActions(onDone = { onDone?.invoke() }),
        modifier = Modifier.fillMaxWidth().semantics { contentDescription = description },
        decorationBox = { inner ->
            Box(
                Modifier.fillMaxWidth().heightIn(min = 48.dp).clip(FIELD_SHAPE).background(Palette.panel).border(1.dp, Palette.border, FIELD_SHAPE)
                    .padding(horizontal = 12.dp),
                contentAlignment = Alignment.CenterStart,
            ) {
                if (value.isEmpty()) T(placeholder, Palette.subtle, 15.sp, oneLine = true)
                inner()
            }
        },
    )
}

/** A drop-down: the chosen [text] in a box like [FieldBox], opening a menu of [options] (key to label). */
@Composable
private fun ChoiceBox(description: String, text: String, options: List<Pair<String, String>>, onPick: (String) -> Unit) {
    var open by remember { mutableStateOf(false) }
    Box {
        Row(
            Modifier.fillMaxWidth().heightIn(min = 48.dp).clip(FIELD_SHAPE).background(Palette.panel).border(1.dp, Palette.border, FIELD_SHAPE)
                .clickable(role = Role.DropdownList) { open = true }.semantics { contentDescription = "$description: $text" }
                .padding(horizontal = 12.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            T(text, Palette.fg, 15.sp, modifier = Modifier.weight(1f), oneLine = true)
            Icon(Icons.down, Palette.muted, 18)
        }
        DropdownMenu(open, { open = false }, Modifier.background(Palette.raised)) {
            options.forEach { (k, label) ->
                DropdownMenuItem(text = { T(label, Palette.fg, 15.sp) }, onClick = { open = false; onPick(k) })
            }
        }
    }
}

/** The form's main button, at the bottom right: filled accent, grey while it can't be sent. */
@Composable
private fun MainButton(label: String, enabled: Boolean, onClick: () -> Unit) {
    Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.CenterEnd) {
        Box(
            Modifier.heightIn(min = 48.dp).clip(RoundedCornerShape(24.dp))
                .background(if (enabled) Palette.accent else Palette.chip).clickable(enabled = enabled, role = Role.Button, onClick = onClick)
                .padding(horizontal = 22.dp),
            contentAlignment = Alignment.Center,
        ) { T(label, if (enabled) Palette.onAccent else Palette.subtle, 15.sp, FontWeight.SemiBold) }
    }
}

/** An error line in the sheet, read out by TalkBack when it appears. */
@Composable
private fun ErrorText(text: String?) {
    if (text != null) T(text, Palette.red, 14.sp, modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite })
}

/**
 * Runs a create and gives back the error text instead of a toast (a toast would sit under the
 * sheet). After a create the screens reload, whether or not the sheet is still open.
 */
private suspend fun tryCreate(f: suspend () -> JSONObject): Pair<JSONObject?, String?> = try {
    f().also { App.changed() } to null
} catch (e: CancellationException) {
    throw e
} catch (e: Exception) {
    null to (e.message ?: "Not made")
}

/** A load whose failure only means "not known" (null); leaving the screen still cancels it. */
private suspend fun <T> orNull(f: suspend () -> T): T? = try {
    f()
} catch (e: CancellationException) {
    throw e
} catch (e: Exception) {
    null
}
