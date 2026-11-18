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
    Box(
        Modifier.size(width = 38.dp, height = 44.dp).clip(RoundedCornerShape(6.dp)).clickable(enabled = enabled, onClickLabel = label, onClick = onClick)
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) { Icon(icon, if (enabled) tint else Palette.subtle, 18) }
}

/** The timer buttons of a line (and of the strip): clock, Stop, Pause or Resume; or Start when none runs for it. */
@Composable
fun TimerControls(title: String, timer: JSONObject?, now: Instant, canStart: Boolean, cb: RowCallbacks, startTarget: JSONObject? = null) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        if (timer != null) {
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

/** One compact line of the day's list: kind, title, logged / estimate, timer and Log buttons. Swipe for Log and Remove, hold for every action. */
@Composable
fun PlanLine(item: JSONObject, timer: JSONObject?, now: Instant, anyRunning: Boolean, host: TaskActionHost, cb: RowCallbacks) {
    val event = item.optString("kind") == "event"
    val done = item.optBoolean("done")
    val canLog = !(event && done)
    val title = item.optString("title")
    val swipe = PlanSwipe(
        buttons = (if (canLog) listOf("log" to "Log") else emptyList()) + ("remove" to "Remove"),
        all = planActions(item), onAction = { k -> cb.onAction(k, item) },
    )
    SwipeRow(
        item, host, plan = swipe, longClickLabel = "Show every action",
        onLongClick = { cb.onAction("more", item) }, onClick = { cb.onAction(if (event) "edit" else "open", item) },
    ) {
        Row(
            Modifier.fillMaxWidth().heightIn(min = 48.dp).padding(start = 10.dp, end = 2.dp)
                .semantics(mergeDescendants = false) { },
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp),
        ) {
            Box(
                Modifier.clip(RoundedCornerShape(4.dp)).background(if (event) Palette.selected else Palette.dim).padding(horizontal = 4.dp, vertical = 2.dp),
            ) { T(if (event) "Event" else "Task", if (event) Palette.accentFg else Palette.muted, 10.sp) }
            T(title, if (done) Palette.subtle else Palette.fg, 13.sp, FontWeight.SemiBold, modifier = Modifier.weight(1f).semantics { contentDescription = rowDescription(item) }, oneLine = true, strike = done && !event)
            T(ratioText(item) + if (event && done) " ✓" else "", Palette.muted, 12.sp, oneLine = true)
            if (!done || !event) TimerControls(title, timer, now, !anyRunning, cb, startTarget = item.takeIf { canLog })
            if (canLog) TimerButton(Icons.logTime, "Log session for $title", Palette.accentFg) { cb.onLog(item) }
            else Box(Modifier.width(8.dp))
        }
    }
}

/** Every action of a line, in the order the More sheet and a screen reader list them. */
fun planActions(item: JSONObject): List<Pair<String, String>> {
    val event = item.optString("kind") == "event"
    return buildList {
        if (!(event && item.optBoolean("done"))) add("log" to "Log session")
        if (event) add("edit" to "Edit event") else add("open" to "Open task")
        if (!event) add("move" to "Move task to a status")
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
