package com.aakash.jitterbug

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.time.LocalDate

/**
 * Bring forward: on request only, never by itself. Lists tasks planned on any earlier day that are not
 * done or cancelled and not already on this day; choosing some copies them onto the day, and the
 * earlier days keep their lines. The list is read when the area is opened and again after any change to
 * the plan ([items] changing), so a task just brought forward leaves it.
 */
@Composable
fun BringForward(day: String, items: List<JSONObject>, onDone: () -> Unit) {
    var open by remember(day) { mutableStateOf(false) }
    var candidates by remember(day) { mutableStateOf<List<JSONObject>?>(null) }
    var chosen by remember(day) { mutableStateOf(setOf<Long>()) }
    val scope = rememberCoroutineScope()
    val key = items.map { it.getLong("id") }
    LaunchedEffect(day, open, key, App.version) {
        if (open) candidates = runCatching { Planner.candidates(day) }.getOrNull()
    }
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(Modifier.fillMaxWidth().heightIn(min = 44.dp), verticalAlignment = Alignment.CenterVertically) {
            T("Bring forward", Palette.fg, 15.sp, FontWeight.SemiBold, Modifier.weight(1f))
            TextLink(if (open) "Close" else "From earlier days") { open = !open }
        }
        if (open) Card {
            val list = candidates
            when {
                list == null -> Empty("Looking…")
                list.isEmpty() -> Empty("Nothing unfinished on earlier days.")
                else -> {
                    list.forEachIndexed { i, c ->
                        if (i > 0) Line()
                        val id = c.getLong("task_id")
                        val on = id in chosen
                        Row(
                            Modifier.fillMaxWidth().heightIn(min = 52.dp)
                                .clickable(role = Role.Checkbox) { chosen = if (on) chosen - id else chosen + id }
                                .semantics { stateDescription = if (on) "Selected" else "Not selected"; contentDescription = "${c.optString("title")}, from ${daysAgoText(c.optString("from_day"), LocalDate.now())}" }
                                .padding(horizontal = 12.dp),
                            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            Icon(if (on) Icons.select else Icons.plus, if (on) Palette.accent else Palette.muted, 20)
                            Column(Modifier.weight(1f)) {
                                T(c.optString("title"), Palette.fg, 14.sp, FontWeight.Medium, oneLine = true)
                                T("${shortDate(c.optString("from_day"))} (${daysAgoText(c.optString("from_day"), LocalDate.now())}) · est ${minText(hoursToMin(c.num("estimate_h")))} · logged ${minText(hoursToMin(c.optDouble("logged_h")))}", Palette.muted, 12.sp)
                            }
                        }
                    }
                    Line()
                    Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp), horizontalArrangement = Arrangement.End) {
                        TextLink(if (chosen.isEmpty()) "Choose tasks to copy here" else "Copy ${chosen.size} here", if (chosen.isEmpty()) Palette.subtle else Palette.accent) {
                            if (chosen.isNotEmpty()) scope.launch {
                                attempt("Not brought forward") {
                                    Planner.bringForward(day, chosen.toList())
                                    chosen = emptySet()
                                    onDone()
                                    App.say("Brought forward")
                                }
                            }
                        }
                    }
                }
            }
        }
        if (open) T("Copies the task onto this day. The earlier day keeps its line.", Palette.subtle, 11.sp, modifier = Modifier.padding(horizontal = 10.dp))
    }
}
