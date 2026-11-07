package com.aakash.jitterbug

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** The list a view shows: snoozed and blocked tasks wait behind their buttons, as on the web. */
class ListStateTest {
    private fun task(id: Int, snoozed: Boolean = false, blocked: Boolean = false, missing: List<String> = emptyList()) =
        JSONObject().put("id", id).put("snoozed", snoozed).put("blocked", blocked).put("missing", JSONArray(missing))

    private fun ids(l: List<JSONObject>) = l.map { it.getInt("id") }

    @Test fun snoozedTasksAreLeftOutOfTheList() {
        val s = splitTasks(listOf(task(1), task(2, snoozed = true), task(3)), hideBlocked = true, checksDetails = false)
        assertEquals(listOf(1, 3), ids(s.shown))
        assertEquals(listOf(2), ids(s.snoozed))
    }

    @Test fun blockedTasksAreHiddenByDefaultAndListedUnderBlocked() {
        val s = splitTasks(listOf(task(1), task(2, blocked = true)), hideBlocked = true, checksDetails = false)
        assertEquals(listOf(1), ids(s.shown))
        assertEquals(listOf(2), ids(s.blocked))
    }

    @Test fun blockedTasksStayInTheListWhenTheViewShowsThem() {
        val s = splitTasks(listOf(task(1), task(2, blocked = true)), hideBlocked = false, checksDetails = false)
        assertEquals(listOf(1, 2), ids(s.shown))
        assertEquals(listOf(2), ids(s.blocked))
    }

    @Test fun aSnoozedBlockedTaskIsOnlyUnderSnoozed() {
        val s = splitTasks(listOf(task(1, snoozed = true, blocked = true)), hideBlocked = true, checksDetails = false)
        assertEquals(listOf(1), ids(s.snoozed))
        assertTrue(s.blocked.isEmpty())
    }

    @Test fun nothingIsIncompleteUntilSomeFieldIsRequired() {
        val t = listOf(task(1, missing = listOf("due_at")))
        assertTrue(splitTasks(t, hideBlocked = true, checksDetails = false).incomplete.isEmpty())
        assertEquals(listOf(1), ids(splitTasks(t, hideBlocked = true, checksDetails = true).incomplete))
    }

    @Test fun snoozedAndBlockedTasksAreNotCountedIncompleteWhileHidden() {
        val s = splitTasks(listOf(task(1, snoozed = true, missing = listOf("due_at")), task(2, blocked = true, missing = listOf("due_at"))), hideBlocked = true, checksDetails = true)
        assertTrue(s.incomplete.isEmpty())
    }

    @Test fun aBlockedTaskThatTheViewShowsCanBeIncomplete() {
        val s = splitTasks(listOf(task(1, blocked = true, missing = listOf("due_at"))), hideBlocked = false, checksDetails = true)
        assertEquals(listOf(1), ids(s.incomplete))
        assertEquals(listOf(1), ids(s.blocked))
    }

    @Test fun aTaskWithNoFlagsIsJustListed() {
        val bare = JSONObject().put("id", 1).put("missing", JSONObject.NULL)
        val s = splitTasks(listOf(bare), hideBlocked = true, checksDetails = true)
        assertEquals(listOf(1), ids(s.shown))
        assertTrue(s.snoozed.isEmpty() && s.blocked.isEmpty() && s.incomplete.isEmpty())
    }

    @Test fun aViewHidesBlockedTasksUnlessItSaysNo() {
        assertTrue(hidesBlocked(JSONObject()))
        assertTrue(hidesBlocked(JSONObject("""{"board_state":null}""")))
        assertTrue(hidesBlocked(JSONObject("""{"board_state":{"timeline":false}}""")))
        assertTrue(hidesBlocked(JSONObject("""{"board_state":{"hide_blocked":null}}""")))
        assertFalse(hidesBlocked(JSONObject("""{"board_state":{"hide_blocked":false}}""")))
    }

    @Test fun requiredFieldsComeFromTheCompletenessSetting() {
        assertEquals(emptyList<String>(), requiredFields(JSONObject()))
        assertEquals(listOf("due_at", "epic_id"), requiredFields(JSONObject("""{"task_completeness":{"required":["due_at","epic_id"]}}""")))
    }

    // The server replaces the whole board_state on a PATCH, so changing one key must send the rest back.
    @Test fun changingOneBoardStateKeyKeepsTheOthers() {
        val view = JSONObject("""{"board_state":{"group_by":"area","timeline":false,"limits":{"3":{"max":4}}}}""")
        val next = boardStateWith(view, "hide_blocked", false)
        assertEquals("area", next.getString("group_by"))
        assertEquals(4, next.getJSONObject("limits").getJSONObject("3").getInt("max"))
        assertFalse(next.getBoolean("hide_blocked"))
        assertFalse(view.getJSONObject("board_state").has("hide_blocked"))
    }

    @Test fun aViewWithNoBoardStateGetsJustTheNewKey() {
        assertEquals("""{"timeline":true}""", boardStateWith(JSONObject(), "timeline", true).toString())
        assertEquals("""{"timeline":true}""", boardStateWith(JSONObject("""{"board_state":null}"""), "timeline", true).toString())
    }

    @Test fun snoozedTasksWaitingOnABlockerComeFirstThenByDate() {
        val a = JSONObject().put("id", 1).put("snoozed_until", "2026-11-12")
        val b = JSONObject().put("id", 2).put("snoozed_until", JSONObject.NULL).put("snooze_until_unblocked", true)
        val c = JSONObject().put("id", 3).put("snoozed_until", "2026-11-09")
        assertEquals(listOf(2, 3, 1), ids(snoozedOrder(listOf(a, b, c))))
    }

    @Test fun wakeLabelGivesTheDayWhenItIsInTheFuture() {
        val t = JSONObject().put("snoozed_until", "2026-11-09")
        assertEquals("Back on ${dayLabel("2026-11-09")}", wakeLabel(t, "2026-11-07"))
        assertTrue(dayLabel("2026-11-09").isNotBlank())
    }

    @Test fun aDayThatHasPassedIsNotShown() {
        assertEquals("", wakeLabel(JSONObject().put("snoozed_until", "2026-11-07"), "2026-11-07"))
        assertEquals("", wakeLabel(JSONObject(), "2026-11-07"))
    }

    @Test fun aTaskWaitingOnABlockerNamesIt() {
        val open = JSONObject().put("title", "Find the part").put("behaviour", "todo")
        val done = JSONObject().put("title", "Old").put("behaviour", "done")
        val t = JSONObject().put("snooze_until_unblocked", true).put("blocked_by", JSONArray().put(open).put(done))
        assertEquals("Back when “Find the part” is done", wakeLabel(t, "2026-11-07"))
        assertEquals("Find the part", waitingOn(t))
    }

    @Test fun severalBlockersAreCountedAndNoneSaysUnblocked() {
        val a = JSONObject().put("title", "A").put("behaviour", "todo")
        val b = JSONObject().put("title", "B").put("behaviour", "in_progress")
        assertEquals("Back when 2 blockers are done", wakeLabel(JSONObject().put("snooze_until_unblocked", true).put("blocked_by", JSONArray().put(a).put(b)), "2026-11-07"))
        assertEquals("Back when unblocked", wakeLabel(JSONObject().put("snooze_until_unblocked", true), "2026-11-07"))
    }

    @Test fun aDateWinsOverWaitingOnABlocker() {
        val t = JSONObject().put("snoozed_until", "2026-11-09").put("snooze_until_unblocked", true)
        assertEquals("Back on ${dayLabel("2026-11-09")}", wakeLabel(t, "2026-11-07"))
    }

    @Test fun fieldNamesComeFromTheCompletenessList() {
        assertEquals("Due date", fieldLabel("due_at"))
        assertEquals("unknown_key", fieldLabel("unknown_key"))
    }
}
