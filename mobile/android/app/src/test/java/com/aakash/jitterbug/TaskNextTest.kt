package com.aakash.jitterbug

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

/** Continue and rounds (SPEC 4.17): the round label, the epic choices for each kind of task, and the bodies sent. */
class TaskNextTest {
    private val all = CONTINUE_COPIES.map { it.first }.toSet()

    @Test fun roundTagIsHashOrV() {
        assertEquals("#3", roundTag(3, "round"))
        assertEquals("#3", roundTag(3, null))
        assertEquals("v2", roundTag(2, "version"))
        assertNull(roundTag(null, "version"))
        assertEquals("#1", roundTag(JSONObject("""{"round_no":1,"round_kind":"round"}""")))
        assertNull(roundTag(JSONObject("""{"round_no":null,"round_kind":null}""")))
        assertNull(roundTag(JSONObject("{}")))
    }

    @Test fun kindFollowsTheServersOrder() {
        assertEquals(ContinueKind.EPIC, continueKind(JSONObject("""{"type":"epic","epic_id":null}""")))
        assertEquals(ContinueKind.SUBTASK, continueKind(JSONObject("""{"type":"task","parent_id":4,"epic_id":7}""")))
        assertEquals(ContinueKind.IN_EPIC, continueKind(JSONObject("""{"type":"task","parent_id":null,"epic_id":7}""")))
        assertEquals(ContinueKind.PLAIN, continueKind(JSONObject("""{"type":"task","parent_id":null,"epic_id":null}""")))
    }

    @Test fun epicChoicesForEachKind() {
        assertEquals(listOf("new", "pick", "none"), epicOptions(ContinueKind.PLAIN, null, null, true).map { it.key })
        assertEquals(listOf("new", "none"), epicOptions(ContinueKind.PLAIN, null, null, false).map { it.key })
        val inEpic = epicOptions(ContinueKind.IN_EPIC, "House", null, true)
        assertEquals(listOf("same", "none"), inEpic.map { it.key })
        assertEquals("Keep both in House", inEpic[0].label)
        val sub = epicOptions(ContinueKind.SUBTASK, null, "Install cameras", true)
        assertEquals(listOf("next", "separate"), sub.map { it.key })
        assertEquals("Next subtask of Install cameras", sub[0].label)
        assertTrue(epicOptions(ContinueKind.EPIC, null, null, true).isEmpty())
    }

    @Test fun plainTaskBodies() {
        val n = continueBody(ContinueKind.PLAIN, "  Wire garage camera ", all, "new", " NVR ", null, "2026-11-20")
        assertEquals("Wire garage camera", n.getString("title"))
        assertEquals("new", n.getString("epic"))
        assertEquals("NVR", n.getString("epic_title"))
        assertEquals("2026-11-20", n.getString("today"))
        assertEquals(4, n.getJSONArray("copy").length())
        val p = continueBody(ContinueKind.PLAIN, "x", all, "pick", "", 9, "2026-11-20")
        assertEquals("pick", p.getString("epic"))
        assertEquals(9L, p.getLong("epic_id"))
        assertEquals("none", continueBody(ContinueKind.PLAIN, "x", all, "none", "", null, "d").getString("epic"))
    }

    @Test fun otherKindsBodies() {
        assertEquals("same", continueBody(ContinueKind.IN_EPIC, "x", all, "same", "", null, "d").getString("epic"))
        assertEquals("none", continueBody(ContinueKind.IN_EPIC, "x", all, "none", "", null, "d").getString("epic"))
        val sub = continueBody(ContinueKind.SUBTASK, "x", all, "next", "", null, "d")
        assertFalse(sub.has("epic"))
        assertFalse(sub.getBoolean("separate"))
        assertTrue(continueBody(ContinueKind.SUBTASK, "x", all, "separate", "", null, "d").getBoolean("separate"))
        val epic = continueBody(ContinueKind.EPIC, "x", all, null, "", null, "d")
        assertFalse(epic.has("epic"))
        assertFalse(epic.has("separate"))
    }

    @Test fun copyIsAlwaysSentEvenEmpty() {
        // A missing copy means "copy everything" to the server, so none chosen must send [].
        val none = continueBody(ContinueKind.PLAIN, "x", emptySet(), "none", "", null, "d")
        assertTrue(none.has("copy"))
        assertEquals(0, none.getJSONArray("copy").length())
        val some = continueBody(ContinueKind.PLAIN, "x", setOf("tags", "priority"), "none", "", null, "d")
        assertEquals("""["priority","tags"]""", some.getJSONArray("copy").toString())
    }

    @Test fun canContinueNeedsTitleAndPickedEpic() {
        assertFalse(canContinue("  ", "none", null))
        assertFalse(canContinue("x", "pick", null))
        assertTrue(canContinue("x", "pick", 3))
        assertTrue(canContinue("x", "new", null))
        assertTrue(canContinue("x", null, null))
    }

    @Test fun nextRoundBodySendsKindOnlyFirstTime() {
        val first = nextRoundBody(true, "version", LocalDate.of(2026, 11, 27), "2026-11-20")
        assertEquals("version", first.getString("kind"))
        assertEquals("2026-11-27", first.getString("snooze_until"))
        val later = nextRoundBody(false, "version", null, "2026-11-20")
        assertFalse(later.has("kind"))
        assertFalse(later.has("snooze_until"))
        assertEquals("2026-11-20", later.getString("today"))
    }

    @Test fun asksOnlyWhenNewlyDone() {
        assertTrue(asksWhatsNext("todo", "done"))
        assertTrue(asksWhatsNext("in_progress", "done"))
        assertTrue(asksWhatsNext("cancelled", "done"))
        assertFalse(asksWhatsNext("done", "done")) // Done to Verified
        assertFalse(asksWhatsNext("in_progress", "cancelled"))
        assertFalse(asksWhatsNext("done", "todo"))
    }

    @Test fun roundStateShowsDoneDateOrState() {
        assertEquals("Done 18 Nov", roundState(JSONObject("""{"completed_at":"2026-11-18T10:00:00Z","behaviour":"done"}""")))
        assertEquals("In progress", roundState(JSONObject("""{"completed_at":null,"behaviour":"in_progress"}""")))
        assertEquals("To do", roundState(JSONObject("""{"completed_at":null,"behaviour":"todo"}""")))
    }
}
