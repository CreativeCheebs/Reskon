package com.aakash.jitterbug

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test

class TermsTest {
    @Test fun defaultsUntilChanged() {
        assertEquals(TermWords("task", "tasks", "epic", "epics"), termWords(JSONObject()))
        assertEquals(TermWords(), termWords(null))
    }

    @Test fun wordsAreKeptAsTyped() {
        val s = JSONObject().put("terms", JSONObject().put("task", "ToDo").put("tasks", "ToDos").put("epic", "story").put("epics", "stories"))
        val w = termWords(s)
        assertEquals("ToDo", w.task)
        assertEquals("ToDo", capitalise(w.task))
        assertEquals("Stories", capitalise(w.epics))
    }

    @Test fun oddWordsFallBackToTheDefault() {
        val bad = JSONObject().put("task", "  ").put("tasks", 5).put("epic", JSONObject.NULL).put("epics", "x".repeat(25))
        assertEquals(TermWords(), termWords(JSONObject().put("terms", bad)))
        assertEquals(TermWords(), termWords(JSONObject().put("terms", "todo")))
    }

    @Test fun capitaliseLeavesEmptyAlone() {
        assertEquals("", capitalise(""))
    }
}
