package com.aakash.jitterbug

import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.runtime.DisposableEffect
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import org.json.JSONObject

/** The web's Snoozed, Blocked and Incomplete buttons; each shows only when it has tasks. Calls back with "snoozed", "blocked" or "incomplete". */
@Composable
fun HiddenGroup(split: ListSplit, modifier: Modifier = Modifier, onOpen: (String) -> Unit) {
    val items = listOf("snoozed" to split.snoozed.size, "blocked" to split.blocked.size, "incomplete" to split.incomplete.size).filter { it.second > 0 }
    items.forEach { (k, n) ->
        Box(modifier) { Pill("${k.replaceFirstChar { it.uppercase() }} $n", height = 28, action = true, rect = true, small = true) { onOpen(k) } }
    }
}

/** One task in a sheet: tap it to open the task. */
@Composable
private fun SheetTask(t: JSONObject, host: TaskActionHost?, onOpen: () -> Unit, trailing: @Composable () -> Unit = {}, detail: @Composable () -> Unit = {}) {
    val boot = App.boot ?: return
    // Swipe left reveals the same buttons as on the list (when the sheet is given a host).
    SwipeRow(t, host, faceColor = Palette.raised, onClick = onOpen) {
        Row(
            Modifier.fillMaxWidth().heightIn(min = 64.dp).padding(horizontal = 20.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                RoundTitle(t, Palette.fg, 15.sp, FontWeight.Medium)
                T(listOfNotNull(boot.status(t.id("status_id"))?.name, boot.area(t.id("area_id"))?.name).joinToString(" · "), Palette.muted, 13.sp, oneLine = true)
                detail()
            }
            trailing()
        }
    }
}

/**
 * A sheet listing tasks. It closes itself when the last one leaves (woken, unblocked, filled in),
 * since the button that opened it is gone then too.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun TaskSheet(title: String, tasks: List<JSONObject>, host: TaskActionHost?, onDismiss: () -> Unit, header: @Composable () -> Unit = {}, row: @Composable (JSONObject) -> Unit) {
    val close by rememberUpdatedState(onDismiss)
    LaunchedEffect(tasks.isEmpty()) { if (tasks.isEmpty()) close() }
    val listState = rememberLazyListState()
    if (host != null) LaunchedEffect(listState.isScrollInProgress) { if (listState.isScrollInProgress) host.openId = null }
    // A row left swiped open must not stay "open" once the sheet is gone.
    if (host != null) DisposableEffect(host) { onDispose { host.openId = null } }
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), containerColor = Palette.raised) {
        Column {
            T(title, Palette.fg, 18.sp, FontWeight.SemiBold, Modifier.padding(horizontal = 20.dp).padding(bottom = 4.dp).semantics { heading() })
            Box(Modifier.padding(horizontal = 20.dp)) { header() }
            LazyColumn(Modifier.weight(1f, fill = false).then(if (host != null) Modifier.closeSwipeOnTouch(host) else Modifier), state = listState) { items(tasks, key = { it.optLong("id") }) { row(it) } }
            Spacer(Modifier.height(24.dp))
        }
    }
}

/**
 * The view's snoozed tasks, each with Wake now. [waking] holds the tasks being woken right now,
 * so a second tap does nothing; the screen runs the write, so closing this sheet cannot cancel it.
 */
@Composable
fun SnoozedSheet(tasks: List<JSONObject>, waking: Set<Long>, onWake: (JSONObject) -> Unit, onDismiss: () -> Unit, host: TaskActionHost? = null) {
    TaskSheet("Snoozed · ${tasks.size}", tasks, host, onDismiss) { t ->
        val title = t.optString("title")
        SheetTask(
            t, host, onOpen = { onDismiss(); App.go("task", "id" to t.getLong("id")) },
            detail = { wakeLabel(t, today()).takeIf { it.isNotEmpty() }?.let { T(it, Palette.yellow, 13.sp) } },
            trailing = {
                Box(
                    Modifier.heightIn(min = 48.dp).clip(RoundedCornerShape(24.dp)).border(1.dp, Palette.strong, RoundedCornerShape(24.dp))
                        .clickable(onClickLabel = "Wake $title", role = Role.Button, enabled = t.optLong("id") !in waking) { onWake(t) }.padding(horizontal = 16.dp),
                    contentAlignment = Alignment.Center,
                ) { T("Wake now", if (t.optLong("id") in waking) Palette.subtle else Palette.accentFg, 14.sp, FontWeight.Medium) }
            },
        )
    }
}

/** Open tasks waiting on another open task. The switch is the view's own "hide blocked" choice, shared with the web. */
@Composable
fun BlockedSheet(tasks: List<JSONObject>, hidden: Boolean, onHidden: (Boolean) -> Unit, onDismiss: () -> Unit, host: TaskActionHost? = null) {
    // Move the switch at once; the saved view follows a moment later.
    var on by remember(hidden) { mutableStateOf(hidden) }
    TaskSheet(
        "Blocked · ${tasks.size}", tasks, host, onDismiss,
        header = {
            Row(
                Modifier.fillMaxWidth().heightIn(min = 56.dp).toggleable(value = on, role = Role.Switch) { on = it; onHidden(it) },
                verticalAlignment = Alignment.CenterVertically,
            ) {
                T("Hide them from this view", Palette.fg, 15.sp, modifier = Modifier.weight(1f))
                Switch(
                    on, null,
                    colors = SwitchDefaults.colors(checkedTrackColor = Palette.accent, checkedThumbColor = Palette.onAccent, uncheckedTrackColor = Palette.strong, uncheckedThumbColor = Palette.fg, uncheckedBorderColor = Palette.strong),
                )
            }
        },
    ) { t ->
        val waiting = waitingOn(t)
        SheetTask(t, host, onOpen = { onDismiss(); App.go("task", "id" to t.getLong("id")) }, detail = { if (waiting.isNotEmpty()) T("Waiting on $waiting", Palette.yellow, 13.sp) })
    }
}

/** Open tasks lacking details Settings › Complete details asks for, with what each lacks. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun IncompleteSheet(tasks: List<JSONObject>, onDismiss: () -> Unit, host: TaskActionHost? = null) {
    TaskSheet("Incomplete details · ${tasks.size}", tasks.sortedByDescending { it.optJSONArray("missing")?.length() ?: 0 }, host, onDismiss) { t ->
        SheetTask(t, host, onOpen = { onDismiss(); App.go("task", "id" to t.getLong("id")) }, detail = {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                t.strs("missing").forEach { Tag(fieldLabel(it)) }
            }
        })
    }
}
