package com.aakash.jitterbug

import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate

/**
 * Continue a task, and rounds of the same task (SPEC 4.17): what the phone sends and offers.
 * Kept apart from the screens so it can be tested without a phone. The server makes the tasks
 * and works out the numbers; nothing here counts rounds or adds up hours.
 */

/** The round label shown after a title: "#3" for rounds, "v3" for versions; null when the task has no round. */
fun roundTag(no: Long?, kind: String?): String? = no?.let { if (kind == "version") "v$it" else "#$it" }

/** The round label of a task or a round as the server sends it (round_no and round_kind). */
fun roundTag(t: JSONObject): String? = roundTag(t.id("round_no"), t.str("round_kind"))

/** What Continue offers depends on the task, checked in the server's order. */
enum class ContinueKind { EPIC, SUBTASK, IN_EPIC, PLAIN }

fun continueKind(t: JSONObject): ContinueKind = when {
    t.optString("type") == "epic" -> ContinueKind.EPIC
    t.id("parent_id") != null -> ContinueKind.SUBTASK
    t.id("epic_id") != null -> ContinueKind.IN_EPIC
    else -> ContinueKind.PLAIN
}

/** One answer to the epic (or subtask) question. [key] is new, pick, none, same, next or separate. */
data class EpicOption(val key: String, val label: String)

/**
 * The choices offered for [kind], the first being the default. [epicName] is the task's own epic,
 * [parentName] a subtask's parent, [hasEpics] whether any epic exists to pick. An epic gets none.
 */
fun epicOptions(kind: ContinueKind, epicName: String?, parentName: String?, hasEpics: Boolean): List<EpicOption> = when (kind) {
    ContinueKind.EPIC -> emptyList()
    ContinueKind.SUBTASK -> listOf(
        EpicOption("next", parentName?.let { "Next subtask of $it" } ?: "Next subtask of the same parent"),
        EpicOption("separate", "A separate ${Terms.task}"),
    )
    ContinueKind.IN_EPIC -> listOf(
        EpicOption("same", "Keep both in ${epicName ?: "the same ${Terms.epic}"}"),
        EpicOption("none", "New ${Terms.task} has no ${Terms.epic}"),
    )
    ContinueKind.PLAIN -> listOfNotNull(
        EpicOption("new", "New ${Terms.epic} for both"),
        EpicOption("pick", "An ${Terms.epic} I have").takeIf { hasEpics },
        EpicOption("none", "No ${Terms.epic}"),
    )
}

/**
 * Whether moving a task from a status of behaviour [from] to one of [to] asks "What's next?": only
 * into done from a status that was not done (Done to Verified does not ask; cancelled never does).
 */
fun asksWhatsNext(from: String?, to: String?): Boolean = to == "done" && from != "done"

/** What Continue can copy besides the area (always copied), in the order shown. */
val CONTINUE_COPIES = listOf("energy_type" to "Energy", "priority" to "Priority", "level" to "Level", "tags" to "Tags")

/** Whether the Continue form can be sent: a title, and an epic chosen when picking one. */
fun canContinue(title: String, choice: String?, epicId: Long?): Boolean =
    title.isNotBlank() && (choice != "pick" || epicId != null)

/**
 * The body of POST /api/tasks/:id/continue. `copy` is always sent, even empty: the server reads a
 * missing one as "copy everything". A subtask sends `separate` and an epic sends no epic choice,
 * since the server refuses one for either.
 */
fun continueBody(
    kind: ContinueKind, title: String, copy: Set<String>, choice: String?, epicTitle: String, epicId: Long?, today: String,
): JSONObject {
    val b = JSONObject()
        .put("title", title.trim())
        .put("copy", JSONArray(CONTINUE_COPIES.map { it.first }.filter { it in copy }))
        .put("today", today)
    when (kind) {
        ContinueKind.EPIC -> {}
        ContinueKind.SUBTASK -> b.put("separate", choice == "separate")
        ContinueKind.IN_EPIC -> b.put("epic", if (choice == "none") "none" else "same")
        ContinueKind.PLAIN -> when (choice) {
            "new" -> b.put("epic", "new").put("epic_title", epicTitle.trim())
            "pick" -> b.put("epic", "pick").put("epic_id", epicId)
            else -> b.put("epic", "none")
        }
    }
    return b
}

/**
 * The body of POST /api/tasks/:id/next-round. [kind] (round or version) is sent only for a task's
 * first next round ([first]); later rounds keep the series' kind. [snooze] starts it snoozed.
 */
fun nextRoundBody(first: Boolean, kind: String, snooze: LocalDate?, today: String): JSONObject = JSONObject().apply {
    if (first) put("kind", kind)
    snooze?.let { put("snooze_until", it.toString()) }
    put("today", today)
}

/** How a round in the earlier-rounds list reads: its done date, else what state it is in. */
fun roundState(r: JSONObject): String = r.str("completed_at")?.let { "Done ${shortDate(it)}" } ?: when (r.optString("behaviour")) {
    "done" -> "Done"
    "cancelled" -> "Cancelled"
    "in_progress" -> "In progress"
    else -> "To do"
}
