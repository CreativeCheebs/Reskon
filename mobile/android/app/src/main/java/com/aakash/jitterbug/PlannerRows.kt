package com.aakash.jitterbug

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.State
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import org.json.JSONObject
import java.time.Instant

/** What a row's buttons ask the screen to do. */
class RowCallbacks(
    val onLog: (JSONObject) -> Unit,
    val onStart: (JSONObject) -> Unit,
    val onPause: (JSONObject) -> Unit,
    val onResume: (JSONObject) -> Unit,
    val onStop: (JSONObject) -> Unit,
    /** A stopped timer: open its time to review and save, or throw it away (the screen asks first). */
    val onReview: (JSONObject) -> Unit,
    val onDiscard: (JSONObject) -> Unit,
    val onAction: (String, JSONObject) -> Unit,
)

/** The clock, ticking each second while [active]. A timer is wall-clock timestamps, so this only redraws; nothing is counted here. */
@Composable
fun rememberNow(active: Boolean): State<Instant> = produceState(Instant.now(), active) {
    value = Instant.now()
    while (active) { delay(1000); value = Instant.now() }
}

@Composable
private fun TimerButton(icon: String, label: String, tint: androidx.compose.ui.graphics.Color, enabled: Boolean = true, onClick: () -> Unit) {
    // The label is the button's name (read once); a 48 dp square is the touch target.
    Box(
        Modifier.size(48.dp).clip(RoundedCornerShape(6.dp)).clickable(enabled = enabled, role = Role.Button, onClick = onClick)
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) { Icon(icon, if (enabled) tint else Palette.subtle, 18) }
}

/** The timer buttons of a line (and of the strip): clock, Stop, Pause or Resume; or Start when none runs for it. */
@Composable
fun TimerControls(title: String, timer: JSONObject?, now: Instant, canStart: Boolean, cb: RowCallbacks, startTarget: JSONObject? = null) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        if (timer != null && isPending(timer)) {
            Box(
                Modifier.heightIn(min = 48.dp).clip(RoundedCornerShape(6.dp)).clickable(role = Role.Button) { cb.onReview(timer) }.padding(horizontal = 6.dp)
                    .semantics { contentDescription = "Review the stopped time for $title" },
                contentAlignment = Alignment.Center,
            ) { T("Stopped, review", Palette.yellow, 12.sp, FontWeight.SemiBold) }
            TimerButton(Icons.trash, "Discard the stopped time for $title", Palette.red) { cb.onDiscard(timer) }
        } else if (timer != null) {
            val running = timer.optBoolean("running")
            T(clockText(elapsedSeconds(timer, now)), Palette.accentFg, 12.sp, modifier = Modifier.padding(end = 2.dp)
                .semantics { contentDescription = if (running) "Elapsed time" else "Elapsed time, paused" })
            TimerButton(Icons.stop, "Stop timer for $title", Palette.red) { cb.onStop(timer) }
            if (running) TimerButton(Icons.pause, "Pause timer for $title", Palette.accentFg) { cb.onPause(timer) }
            else TimerButton(Icons.play, "Resume timer for $title", Palette.accentFg) { cb.onResume(timer) }
        } else if (startTarget != null) {
            TimerButton(Icons.play, "Start timer for $title", Palette.accentFg, canStart) { cb.onStart(startTarget) }
        }
    }
}

/**
 * One compact line of the day's list. An event starts with a check button (Mark done / Mark not done:
 * the only thing that completes an event); a task has its Task tag. Then the line's name, small lines
 * under it (Part of the task, today's time, the task's all-time figures), the timer and Log buttons.
 * Swipe for Log and Remove, hold for every action.
 */
@Composable
fun PlanLine(item: JSONObject, timer: JSONObject?, now: Instant, anyRunning: Boolean, host: TaskActionHost, cb: RowCallbacks) {
    val event = isEvent(item)
    val done = item.optBoolean("done")
    val title = lineTitle(item)
    val swipe = PlanSwipe(
        buttons = listOf("log" to "Log", "remove" to "Remove"),
        all = planActions(item), onAction = { k -> cb.onAction(k, item) },
    )
    SwipeRow(
        item, host, plan = swipe, longClickLabel = "Show every action",
        onLongClick = { cb.onAction("more", item) }, onClick = { cb.onAction(if (event) "edit" else "open", item) },
    ) {
        Row(
            Modifier.fillMaxWidth().heightIn(min = 48.dp).padding(start = if (event) 0.dp else 10.dp, end = 2.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp),
        ) {
            if (event) TimerButton(if (done) Icons.select else Icons.circle, if (done) "Mark $title not done" else "Mark $title done", if (done) Palette.green else Palette.muted) {
                cb.onAction(if (done) "undone" else "done", item)
            }
            // The kind, title and figures are read once, as one sentence; the buttons after them are their own.
            Row(
                Modifier.weight(1f).clearAndSetSemantics { contentDescription = rowDescription(item) },
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp),
            ) {
                if (!event) Box(Modifier.clip(RoundedCornerShape(4.dp)).background(Palette.dim).padding(horizontal = 4.dp, vertical = 2.dp)) { T("Task", Palette.muted, 10.sp) }
                Column(Modifier.weight(1f).padding(vertical = 4.dp)) {
                    T(title, if (done) Palette.subtle else Palette.fg, 13.sp, FontWeight.SemiBold, oneLine = true, strike = done)
                    lineDetails(item).forEach { T(it, Palette.muted, 11.sp) }
                }
            }
            TimerControls(title, timer, now, !anyRunning, cb, startTarget = item)
            TimerButton(Icons.logTime, "Log session for $title", Palette.accentFg) { cb.onLog(item) }
        }
    }
}

/** Every action of a line, in the order the More sheet and a screen reader list them. */
fun planActions(item: JSONObject): List<Pair<String, String>> {
    val event = isEvent(item)
    return buildList {
        add("log" to "Log session")
        if (event) add(if (item.optBoolean("done")) "undone" to "Mark not done" else "done" to "Mark done")
        if (event) add("edit" to "Edit event") else {
            add("plan" to "Edit plan (time and name)")
            add("open" to "Open task")
            add("move" to "Move task to a status")
        }
        add("reschedule" to "Reschedule to another day")
        add("up" to "Move up")
        add("down" to "Move down")
        add("remove" to "Remove from this day")
    }
}

/** The strip above the list: timers that are not on a row of the open day (all of them when two ran at once). A tap on the title jumps to its day. */
@Composable
fun TimerStrip(timers: List<JSONObject>, conflict: Boolean, now: Instant, anyRunning: Boolean, cb: RowCallbacks, jumpTo: (String) -> Unit) {
    if (timers.isEmpty()) return
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).background(Palette.panel).padding(start = 8.dp),
    ) {
        if (conflict) T("Two timers ran at the same time (one was started on another device, or offline). Stop or pause the one you do not want.", Palette.yellow, 12.sp, modifier = Modifier.padding(top = 8.dp, end = 8.dp))
        timers.forEach { t ->
            Row(verticalAlignment = Alignment.CenterVertically) {
                val day = t.optString("day")
                T(
                    "${t.optString("title")} · ${relDay(day)}", Palette.accentFg, 12.sp,
                    modifier = Modifier.weight(1f).heightIn(min = 44.dp).clickable(onClickLabel = "Open the timer's day") { jumpTo(day) }.padding(vertical = 12.dp), oneLine = true,
                )
                TimerControls(t.optString("title"), t, now, !anyRunning, cb)
            }
        }
    }
}
