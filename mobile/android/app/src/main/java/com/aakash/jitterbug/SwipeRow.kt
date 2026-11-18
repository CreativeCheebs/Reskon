package com.aakash.jitterbug

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.gestures.Orientation
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.draggable
import androidx.compose.foundation.gestures.rememberDraggableState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import org.json.JSONObject
import kotlin.math.roundToInt

/** Width of one swipe button, and how fast a flick must be (px/s) to open or close a row on its own. */
private val BUTTON_W = 64.dp
private const val FLICK = 900f

/**
 * What the task rows of one screen share: which row is swiped open (only one at a time) and which
 * action sheet or dialog is showing for which task. [TaskActionSheets] draws the sheets.
 */
class TaskActionHost {
    var openId by mutableStateOf<Long?>(null)
    var pending by mutableStateOf<Pair<String, JSONObject>?>(null)

    /** Set by an open row when a finger lands on it, so the list does not close it as "elsewhere". */
    internal var touchedOpen = false

    /** Does what [key] says to [t]: Log time and Open task go to their screens; the rest show a sheet or dialog. */
    fun run(key: String, t: JSONObject) {
        openId = null
        when (key) {
            "log" -> App.go("log", "task" to t.getLong("id"))
            "open" -> App.go("task", "id" to t.getLong("id"))
            else -> pending = key to t
        }
    }
}

@Composable
fun rememberTaskActionHost() = remember { TaskActionHost() }

/** Put on a list holding swipe rows: a touch anywhere but the open row closes it. */
fun Modifier.closeSwipeOnTouch(host: TaskActionHost): Modifier = pointerInput(host) {
    awaitEachGesture {
        awaitFirstDown(requireUnconsumed = false)
        if (!host.touchedOpen) host.openId = null
        host.touchedOpen = false
    }
}

/** Colours of a swipe button: background, then text and icon. */
private fun swipeColors(key: String): Pair<Color, Color> = when (key) {
    "snooze" -> Palette.purple to Palette.onAccent
    "log" -> Palette.accent to Palette.onAccent
    "move" -> Palette.green to Palette.onAccent
    "note" -> Palette.yellow to Palette.onAccent
    "open" -> Palette.accentFg to Palette.onAccent
    "delete", "remove" -> Palette.red to Palette.onAccent
    "reschedule" -> Palette.green to Palette.onAccent
    "edit" -> Palette.yellow to Palette.onAccent
    else -> Palette.strong to Palette.fg
}

fun taskActionIcon(key: String): String = when (key) {
    "log" -> Icons.sessions
    "snooze" -> Icons.snooze
    "note" -> Icons.pencil
    "move" -> Icons.moveTo
    "open" -> Icons.openTask
    "delete", "remove" -> Icons.trash
    "reschedule" -> Icons.calendar
    "edit" -> Icons.pencil
    else -> Icons.dotsH
}

/** One button of the swipe strip, full height of the row. [onClick] null makes a picture only (the Settings preview). */
@Composable
fun SwipeButton(key: String, width: Dp = BUTTON_W, label: String? = null, onClick: (() -> Unit)? = null) {
    val (bg, fg) = swipeColors(key)
    val full = label ?: if (key == "more") "More" else CARD_ACTIONS.firstOrNull { it.first == key }?.second ?: key
    Column(
        Modifier.width(width).fillMaxHeight().background(bg)
            .then(if (onClick != null) Modifier.clickable(role = Role.Button, onClick = onClick) else Modifier)
            .semantics { contentDescription = full },
        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp, Alignment.CenterVertically),
    ) {
        Icon(taskActionIcon(key), fg, 18)
        T(label ?: if (key == "more") "More" else swipeLabel(key), fg, 11.sp, FontWeight.Medium, oneLine = true, modifier = Modifier.padding(horizontal = 2.dp))
    }
}

/**
 * Other rows that swipe the same way (the Day Planner's lines): their own buttons, each with a short
 * label, then More; [onAction] gets the key tapped (or "more"). [all] is every action, for a screen reader.
 */
class PlanSwipe(val buttons: List<Pair<String, String>>, val all: List<Pair<String, String>>, val onAction: (String) -> Unit)

/**
 * A task row you can swipe left to show its buttons: the user's chosen ones, then More. Swipe right
 * does nothing. A tap runs [onClick] (or closes an open row); [onLongClick] is the row's long-press.
 * Every action is also a custom accessibility action on the row, so a screen-reader user needs no
 * swipe. With no [host] the row is a plain tappable one.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun SwipeRow(
    t: JSONObject, host: TaskActionHost?, faceColor: Color = Palette.panel,
    longClickLabel: String = "Move to another status", onLongClick: (() -> Unit)? = null,
    plan: PlanSwipe? = null, onClick: () -> Unit, content: @Composable () -> Unit,
) {
    if (host == null) {
        Box(Modifier.fillMaxWidth().combinedClickable(onLongClickLabel = longClickLabel.takeIf { onLongClick != null }, onLongClick = onLongClick, onClick = onClick)) { content() }
        return
    }
    val id = t.getLong("id")
    val keys = plan?.buttons?.map { it.first } ?: swipeActions(App.boot?.settings ?: JSONObject())
    val reveal = with(LocalDensity.current) { (BUTTON_W * (keys.size + 1)).toPx() }
    fun act(k: String) { if (plan != null) { host.openId = null; plan.onAction(k) } else host.run(k, t) }
    val x = remember { Animatable(0f) }
    val scope = rememberCoroutineScope()
    val open = host.openId == id
    // Closed from outside (another row opened, a scroll, a tap elsewhere, an action ran): slide back.
    LaunchedEffect(open) { if (!open && x.value != 0f) x.animateTo(0f, tween(150)) }
    val showButtons by remember { derivedStateOf { x.value != 0f } }
    val drag = rememberDraggableState { d -> scope.launch { x.snapTo((x.value + d).coerceIn(-reveal, 0f)) } }

    Box(
        Modifier.fillMaxWidth().clipToBounds()
            .pointerInput(id, host) { awaitEachGesture { awaitFirstDown(requireUnconsumed = false); if (host.openId == id) host.touchedOpen = true } }
            .draggable(
                drag, Orientation.Horizontal,
                onDragStarted = { if (host.openId != id) host.openId = null },
                onDragStopped = { v ->
                    val opening = if (v < -FLICK) true else if (v > FLICK) false else x.value < -reveal / 2
                    host.openId = if (opening) id else null
                    scope.launch { x.animateTo(if (opening) -reveal else 0f, tween(150)) }
                },
            ),
    ) {
        if (showButtons) Row(Modifier.matchParentSize(), horizontalArrangement = Arrangement.End) {
            keys.forEach { k -> SwipeButton(k, label = plan?.buttons?.firstOrNull { it.first == k }?.second) { act(k) } }
            SwipeButton("more") { act("more") }
        }
        Box(
            Modifier.fillMaxWidth().offset { IntOffset(x.value.roundToInt(), 0) }.background(faceColor)
                .semantics { customActions = (plan?.all ?: CARD_ACTIONS).map { (k, label) -> CustomAccessibilityAction(label) { act(k); true } } }
                .combinedClickable(
                    onLongClickLabel = longClickLabel.takeIf { onLongClick != null }, onLongClick = onLongClick,
                    onClick = { if (host.openId == id) host.openId = null else onClick() },
                ),
        ) { content() }
    }
}
