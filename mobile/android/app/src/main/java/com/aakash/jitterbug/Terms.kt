package com.aakash.jitterbug

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import org.json.JSONObject

/**
 * What the screens call tasks and epics (Settings > Names, the `terms` setting). Only what is shown
 * changes. The words are kept as typed, in the case wanted mid-sentence ("todo"); the capitalised
 * form raises only the first letter. Write strings so no "a" or "an" sits in front of a name.
 */
data class TermWords(val task: String = "task", val tasks: String = "tasks", val epic: String = "epic", val epics: String = "epics")

const val MAX_TERM_LENGTH = 24

fun capitalise(s: String): String = if (s.isEmpty()) s else s.substring(0, 1).uppercase() + s.substring(1)

private fun usable(o: JSONObject, key: String): String? {
    val v = o.opt(key) as? String ?: return null
    val s = v.trim()
    return if (s.isNotEmpty() && s.length <= MAX_TERM_LENGTH) s else null
}

/** The words in the settings, the default for anything missing or odd. */
fun termWords(settings: JSONObject?): TermWords {
    val given = settings?.opt("terms") as? JSONObject ?: return TermWords()
    val d = TermWords()
    return TermWords(usable(given, "task") ?: d.task, usable(given, "tasks") ?: d.tasks, usable(given, "epic") ?: d.epic, usable(given, "epics") ?: d.epics)
}

/** Read inside a composable, so a change in Settings redraws the screen. */
object Terms {
    private val w get() = termWords(App.boot?.settings)
    val task get() = w.task
    val tasks get() = w.tasks
    val epic get() = w.epic
    val epics get() = w.epics
    val capTask get() = capitalise(w.task)
    val capTasks get() = capitalise(w.tasks)
    val capEpic get() = capitalise(w.epic)
    val capEpics get() = capitalise(w.epics)

    /** "1 task", "3 tasks". */
    fun countTasks(n: Int) = "$n ${if (n == 1) w.task else w.tasks}"

    /** "1 epic", "3 epics". */
    fun countEpics(n: Int) = "$n ${if (n == 1) w.epic else w.epics}"
}

/** Settings > Names: your own words for tasks and epics. Only words that differ from the default are stored. */
@Composable
fun NamesScreen() {
    val scope = rememberCoroutineScope()
    val saved = termWords(App.boot?.settings)
    // Each box follows its saved word, so a word changed on another device shows up here instead of
    // being overwritten by an old draft on Save.
    var task by remember(saved.task) { mutableStateOf(saved.task) }
    var tasks by remember(saved.tasks) { mutableStateOf(saved.tasks) }
    var epic by remember(saved.epic) { mutableStateOf(saved.epic) }
    var epics by remember(saved.epics) { mutableStateOf(saved.epics) }
    SettingPage("Names") {
        T("Call tasks and epics what you like, such as todos or stories. The web app follows the same choice.", Palette.muted, 14.sp)
        TextBox("One task", task, "task") { task = it.take(MAX_TERM_LENGTH) }
        TextBox("Several tasks", tasks, "tasks") { tasks = it.take(MAX_TERM_LENGTH) }
        TextBox("One epic", epic, "epic") { epic = it.take(MAX_TERM_LENGTH) }
        TextBox("Several epics", epics, "epics") { epics = it.take(MAX_TERM_LENGTH) }
        T("Write each word in lower case, like todo and todos. It is capitalised where a label starts. Nothing is renamed in your data.", Palette.subtle, 13.sp)
        fun save(w: TermWords) {
            val d = TermWords()
            val changed = JSONObject()
            if (w.task != d.task) changed.put("task", w.task)
            if (w.tasks != d.tasks) changed.put("tasks", w.tasks)
            if (w.epic != d.epic) changed.put("epic", w.epic)
            if (w.epics != d.epics) changed.put("epics", w.epics)
            scope.launch {
                attempt("Not saved") {
                    saveSetting("terms", changed)
                    // Show what was kept: trimmed, or the default for an empty box.
                    task = w.task; tasks = w.tasks; epic = w.epic; epics = w.epics
                    App.say("Saved")
                }
            }
        }
        TextLink("Save") {
            val d = TermWords()
            save(TermWords(task.trim().ifEmpty { d.task }, tasks.trim().ifEmpty { d.tasks }, epic.trim().ifEmpty { d.epic }, epics.trim().ifEmpty { d.epics }))
        }
        TextLink("Use task and epic again") { save(TermWords()) }
    }
}
