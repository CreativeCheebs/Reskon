package com.aakash.jitterbug

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.foundation.background
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import org.json.JSONObject

/**
 * The Board layout as one list down the screen (Settings > Board as a list): a section for each
 * status, one under another, instead of columns side by side. A wrapping row of buttons, one per
 * status with its count, jumps to that section; it never scrolls sideways. A hidden status
 * (Backlog...) has a button too, and opens as a section when tapped. Cards and counts are the
 * server's, as everywhere on the board.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun StatusListLayout(viewId: Long, tasks: List<JSONObject>, onLongPress: (JSONObject) -> Unit) {
    val boot = App.boot ?: return
    var opened by remember(viewId) { mutableStateOf(OpenedStatuses.of(viewId)) }
    // The status to scroll to once the list has been rebuilt with it (a hidden one is added first).
    var pending by remember { mutableStateOf<Long?>(null) }
    val byStatus = tasks.groupBy { it.getLong("status_id") }
    val sections = visibleStatuses(boot.statuses, opened)
    val starts = sectionStarts(sections.map { it.id }, byStatus.mapValues { it.value.size })
    val listState = rememberLazyListState()
    LaunchedEffect(pending, sections.size) {
        val id = pending ?: return@LaunchedEffect
        starts[id]?.let { listState.animateScrollToItem(it) }
        pending = null
    }

    // At a large text size the buttons could fill the screen, so the row has its own height limit and scrolls inside it.
    FlowRow(
        Modifier.fillMaxWidth().heightIn(max = 150.dp).verticalScroll(rememberScrollState()).padding(start = 16.dp, end = 16.dp, top = 4.dp, bottom = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        boot.statuses.forEach { s ->
            val n = byStatus[s.id]?.size ?: 0
            val open = !s.onBoard && s.id in opened
            Pill(
                "${s.name} $n", on = open, dot = s.color, action = true,
                description = (if (!s.onBoard) (if (open) "Close ${s.name}" else "Show ${s.name}") else "Go to ${s.name}") + ", ${Terms.countTasks(n)}",
            ) {
                // A shown hidden status closes again; any other button jumps to its section.
                val now = when {
                    open -> opened - s.id
                    !s.onBoard -> opened + s.id
                    else -> opened
                }
                opened = now
                OpenedStatuses.set(viewId, now)
                if (!open) pending = s.id
            }
        }
    }
    LazyColumn(state = listState, contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 96.dp)) {
        sections.forEach { s ->
            val rows = byStatus[s.id].orEmpty()
            item(key = "head-${s.id}") {
                Row(
                    Modifier.fillMaxWidth().padding(top = 14.dp, bottom = 6.dp)
                        .semantics(mergeDescendants = true) { heading(); contentDescription = "${s.name}, ${Terms.countTasks(rows.size)}" },
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Dot(s.color)
                    T("${s.name} · ${rows.size}", Palette.fg, 14.sp, FontWeight.SemiBold)
                }
            }
            if (rows.isEmpty()) item(key = "none-${s.id}") { T("No ${Terms.tasks}", Palette.subtle, 13.sp, modifier = Modifier.padding(start = 4.dp, bottom = 4.dp)) }
            rows.forEachIndexed { i, t ->
                item(key = "task-${t.getLong("id")}") {
                    Column(Modifier.fillMaxWidth().clip(listShape(i, rows.size)).background(Palette.panel)) {
                        if (i > 0) Line()
                        ListRowTask(t, onLongPress)
                    }
                }
            }
        }
    }
}

/** Rounds only the first and last row of a section, so the rows read as one card. */
private fun listShape(i: Int, n: Int): RoundedCornerShape {
    val top = if (i == 0) 12.dp else 0.dp
    val bottom = if (i == n - 1) 12.dp else 0.dp
    return RoundedCornerShape(topStart = top, topEnd = top, bottomStart = bottom, bottomEnd = bottom)
}
