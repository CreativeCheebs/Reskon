package com.aakash.jitterbug

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch

/**
 * Settings › Day planner: the minutes available on each weekday, Sunday to Saturday (the
 * `planner_available` setting, saved and synced like any other). A weekday left blank is "not set"
 * and a day on it never warns. A day's own override is on the planner itself (tap Available).
 */
@Composable
fun PlannerSettingsScreen() {
    val boot = App.boot ?: return
    val scope = rememberCoroutineScope()
    val current = boot.settings.optJSONObject("planner_available")
    var editing by remember { mutableStateOf<Pair<String, String>?>(null) }
    SettingPage("Day planner") {
        T("Time you have for planned work on each weekday. The planner shows what is left, and warns only when a day's plan is more than it. Leave a day blank for no warning.", Palette.muted, 13.sp)
        Card {
            WEEKDAYS.forEachIndexed { i, (key, name) ->
                if (i > 0) Line()
                val v = current?.takeIf { it.has(key) && !it.isNull(key) }?.optLong(key)
                ListRow(name, if (v == null) "Not set" else minText(v)) { editing = key to name }
            }
        }
    }
    editing?.let { (key, name) ->
        MinutesDialog(
            name, "Time available on every $name.", current?.takeIf { it.has(key) && !it.isNull(key) }?.optLong(key), "Clear",
            { v ->
                editing = null
                scope.launch { attempt("Not saved") { saveSetting("planner_available", withWeekday(current, key, v)) } }
            }, { editing = null },
        )
    }
}
