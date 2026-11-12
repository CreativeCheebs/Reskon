package com.aakash.jitterbug

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import org.json.JSONArray
import org.json.JSONObject

/**
 * Tags: short free words on tasks and sessions (SPEC 4.15). A task has `tag_ids`; a session has
 * `tags` (its task's tags as they are now, then its own). The server owns the rules; this only
 * tidies what is typed so it is not refused for something small.
 */
const val MAX_TAG_LENGTH = 32

/** A typed tag, tidied: no leading "#", single spaces, trimmed. */
fun cleanTag(s: String): String = s.trim().trimStart('#').trim().replace(Regex("\\s+"), " ")

/** Why a tidied tag would be refused, or null when it is fine. */
fun tagProblem(s: String): String? = when {
    s.isEmpty() -> "A tag needs a name."
    s.length > MAX_TAG_LENGTH -> "A tag can have at most $MAX_TAG_LENGTH characters."
    ',' in s -> "A tag cannot have a comma."
    else -> null
}

/** The tag ids in an array of numbers (a task's `tag_ids`). */
fun JSONObject.tagIds(key: String = "tag_ids"): List<Long> =
    optJSONArray(key)?.let { a -> (0 until a.length()).map { a.getLong(it) } } ?: emptyList()

/** Names of the tags with these ids, in the order given. */
fun Boot.tagNames(ids: List<Long>): List<String> = ids.mapNotNull { id -> tags.firstOrNull { it.optLong("id") == id }?.optString("name") }

/** The tags of a session that are its own (not from its task), then the ones from its task, by name. */
fun Boot.sessionTagNames(s: JSONObject, fromTask: Boolean): List<String> {
    val a = s.optJSONArray("tags") ?: return emptyList()
    return (0 until a.length()).map { a.getJSONObject(it) }.filter { it.optBoolean("from_task") == fromTask }
        .mapNotNull { o -> tags.firstOrNull { it.optLong("id") == o.optLong("tag_id") }?.optString("name") }
}

fun List<String>.asJson(): JSONArray = JSONArray(this)

/**
 * Pick tags: the ones that exist (tap to put on or take off) and a box for a new one. [fixed] are
 * shown but cannot be changed here (a session's tags that come from its task). [onDone] gets the
 * chosen names; new names are made by the server when what holds them is saved.
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun TagsSheet(title: String, chosen: List<String>, fixed: List<String> = emptyList(), onDone: (List<String>) -> Unit, onDismiss: () -> Unit) {
    val boot = App.boot ?: return
    var names by remember { mutableStateOf(chosen) }
    var typed by remember { mutableStateOf("") }
    var problem by remember { mutableStateOf<String?>(null) }
    val fixedKeys = fixed.map { it.lowercase() }.toSet()
    val all = (boot.tags.map { it.optString("name") } + names).distinctBy { it.lowercase() }.filter { it.lowercase() !in fixedKeys }

    fun add() {
        val n = cleanTag(typed)
        val p = tagProblem(n)
        problem = p
        if (p == null && names.none { it.equals(n, true) }) names = names + n
        if (p == null) typed = ""
    }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), containerColor = Palette.raised) {
        Column(Modifier.padding(start = 20.dp, end = 20.dp, bottom = 32.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            T(title, Palette.fg, 18.sp, FontWeight.SemiBold)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                fixed.forEach { Pill(it, on = true, action = true, description = "$it, from the ${Terms.task}") }
                all.forEach { n ->
                    val on = names.any { it.equals(n, true) }
                    Pill(n, on = on, description = n) { names = if (on) names.filterNot { it.equals(n, true) } else names + n }
                }
            }
            TextBox("New tag", typed, "e.g. backend", onDone = { add() }) { typed = it.take(MAX_TAG_LENGTH + 8) }
            problem?.let { T(it, Palette.red, 13.sp) }
            TextLink("Add tag") { add() }
            TextLink("Done") { onDone(names); onDismiss() }
        }
    }
}
