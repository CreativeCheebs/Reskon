package com.aakash.jitterbug

import org.json.JSONArray
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class CaptureSuggestTest {
    @Test fun readsTheServersList() {
        val list = parseSuggestions(JSONArray("""[{"text":"Order NVR drive","kind":"task","task_id":7},{"text":"ordered milk","kind":"history"},{"text":" ","kind":"history"}]"""))
        assertEquals(2, list.size)
        assertEquals(7L, list[0].taskId)
        assertNull(list[1].taskId)
    }

    @Test fun needsTwoLetters() {
        assertFalse(suggestionsWanted(" a "))
        assertTrue(suggestionsWanted("or"))
    }

    @Test fun linksOnlyAnUntouchedSingleSessionFromTheSamePickedLine() {
        val pick = Suggestion("Order NVR drive", "task", 7)
        val draft = Draft(label = "Order NVR drive")
        val linked = linkPickedTask(pick, "Order NVR drive ", 1, draft)
        assertEquals(7L, linked.taskId)
        assertEquals("", linked.label)
        // Edited after picking, several entries, already matched, an event, or a line with no task: left alone.
        assertEquals(draft, linkPickedTask(pick, "Order NVR drive 2h", 1, draft))
        assertEquals(draft, linkPickedTask(pick, "Order NVR drive", 2, draft))
        assertEquals(draft.copy(taskId = 3), linkPickedTask(pick, "Order NVR drive", 1, draft.copy(taskId = 3)))
        assertEquals(draft.copy(kind = "event"), linkPickedTask(pick, "Order NVR drive", 1, draft.copy(kind = "event")))
        assertEquals(draft, linkPickedTask(Suggestion("Order NVR drive", "history", null), "Order NVR drive", 1, draft))
        assertEquals(draft, linkPickedTask(null, "Order NVR drive", 1, draft))
    }
}
