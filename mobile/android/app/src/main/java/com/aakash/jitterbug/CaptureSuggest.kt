package com.aakash.jitterbug

import org.json.JSONArray

/** One line offered under the Quick capture box (GET /api/capture/suggest). [kind] is "task", "session" or "history". */
data class Suggestion(val text: String, val kind: String, val taskId: Long?)

fun parseSuggestions(a: JSONArray): List<Suggestion> =
    (0 until a.length()).mapNotNull { i ->
        val o = a.optJSONObject(i) ?: return@mapNotNull null
        val text = o.optString("text")
        if (text.isBlank()) null else Suggestion(text, o.optString("kind"), if (o.has("task_id") && !o.isNull("task_id")) o.optLong("task_id") else null)
    }

/** Suggestions are asked for once at least two letters are typed. */
fun suggestionsWanted(text: String) = text.trim().length >= 2

/**
 * A session read from exactly the line that was picked (one entry, an ordinary session with no task of its own yet) is linked to the
 * task the suggestion named, so picking "Order NVR drive" does not log time against a duplicate.
 */
fun linkPickedTask(picked: Suggestion?, text: String, entryCount: Int, d: Draft): Draft =
    if (picked?.taskId != null && picked.text == text.trim() && entryCount == 1 && d.taskId == null && d.kind == "task")
        d.copy(taskId = picked.taskId, taskTitle = picked.text, label = "")
    else d
