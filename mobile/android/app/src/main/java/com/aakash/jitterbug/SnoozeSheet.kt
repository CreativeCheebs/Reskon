package com.aakash.jitterbug

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
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
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.time.LocalDate

/** An extra row under "Pick a date…" (on a task: Until unblocked, Wake up now). */
class SnoozeExtra(val label: String, val onClick: () -> Unit)

private val HOURS_W = 56.dp
private val POINTS_W = 52.dp

/**
 * "Snooze until": a bottom sheet with the user's snooze list (Settings › Snooze, cut to the longest
 * snooze), each row showing its name, its date and the hours and points of tasks already coming back
 * that day (from the server's forecast; a dash when nothing comes back, nothing while it loads or if
 * it fails). Then "Pick a date…" and any [extras]. Used by New task and by a task's Snooze button;
 * the list rows' swipe actions will use it too. [excludeId] is the task being snoozed (0 for a new one).
 * Picking calls [onPick] with the day the snooze ends and closes the sheet.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SnoozeSheet(excludeId: Long, onDismiss: () -> Unit, extras: List<SnoozeExtra> = emptyList(), onPick: (LocalDate) -> Unit) {
    val boot = App.boot ?: return
    val today = remember { LocalDate.now() }
    val max = snoozeMaxDays(boot.settings)
    val choices = remember(boot.settings) { snoozeChoices(boot.settings, today) }
    var forecast by remember { mutableStateOf<Map<String, SnoozeForecast>?>(null) }
    LaunchedEffect(choices) { forecast = loadSnoozeForecast(choices.map { it.date }, excludeId) }
    var picking by remember { mutableStateOf(false) }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), containerColor = Palette.raised) {
        Column(Modifier.verticalScroll(rememberScrollState()).padding(bottom = 24.dp)) {
            Row(Modifier.fillMaxWidth().padding(horizontal = 20.dp).padding(bottom = 4.dp), verticalAlignment = Alignment.Bottom) {
                T("Snooze until", Palette.fg, 18.sp, FontWeight.SemiBold, Modifier.weight(1f))
                if (choices.isNotEmpty()) {
                    Box(Modifier.width(HOURS_W), contentAlignment = Alignment.CenterEnd) { T("Hours", Palette.subtle, 12.sp, oneLine = true) }
                    Box(Modifier.width(POINTS_W), contentAlignment = Alignment.CenterEnd) { T("Points", Palette.subtle, 12.sp, oneLine = true) }
                }
            }
            choices.forEach { c ->
                val f = forecast?.let { it[c.date.toString()] ?: SnoozeForecast(0.0, 0.0) }
                Row(
                    Modifier.fillMaxWidth().heightIn(min = 52.dp)
                        .clickable(role = Role.Button) { onPick(c.date) }
                        .semantics(mergeDescendants = true) { contentDescription = snoozeRowDescription(c, f) }
                        .padding(horizontal = 20.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(Modifier.weight(1f)) {
                        T(c.label, Palette.fg, 15.sp)
                        T(dayLabel(c.date.toString()), Palette.muted, 12.sp)
                    }
                    NumberCell(f?.let { if (it.none) "–" else hrs(it.hours) }, f?.none == true, HOURS_W)
                    NumberCell(f?.let { if (it.none) "–" else num(it.points) }, f?.none == true, POINTS_W)
                }
            }
            if (choices.isNotEmpty()) Box(Modifier.padding(vertical = 4.dp)) { Line() }
            SheetRow("Pick a date…", Palette.accentFg, Icons.calendar) { picking = true }
            if (extras.isNotEmpty()) Box(Modifier.padding(vertical = 4.dp)) { Line() }
            extras.forEach { e -> SheetRow(e.label, Palette.fg, null) { e.onClick() } }
        }
    }
    if (picking) {
        DateDialog(today.plusDays(1), { picking = false }, range = today.plusDays(1)..today.plusDays(max.toLong())) { onPick(it) }
    }
}

@Composable
private fun NumberCell(text: String?, none: Boolean, width: androidx.compose.ui.unit.Dp) {
    Box(Modifier.width(width), contentAlignment = Alignment.CenterEnd) {
        if (text != null) T(text, if (none) Palette.subtle else Palette.fg, 15.sp, oneLine = true)
    }
}

@Composable
private fun SheetRow(text: String, color: androidx.compose.ui.graphics.Color, icon: String?, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().heightIn(min = 52.dp).clickable(role = Role.Button, onClick = onClick).padding(horizontal = 20.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        icon?.let { Icon(it, color, 20) }
        T(text, color, 15.sp)
    }
}
