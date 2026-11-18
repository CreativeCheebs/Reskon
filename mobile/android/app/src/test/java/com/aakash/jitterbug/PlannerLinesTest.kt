package com.aakash.jitterbug

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** What a plan line says: today's planned time and the task's all-time figures, readable without a heading. */
class PlannerLinesTest {
    private fun obj(s: String) = JSONObject(s)

    @Test fun aTaskLineSaysTodaysPlanAndTheAllTimeFigures() {
        val t = obj("""{"kind":"task","title":"Outline","planned_min":120,"logged_day_h":0,"logged_h":1.0833,"estimate_h":8}""")
        assertEquals("2h today", todayText(t))
        assertEquals("1h 5m / 8h all time", allTimeText(t))
        assertEquals(listOf("2h today · 1h 5m / 8h all time"), lineDetails(t))
    }

    @Test fun whatIsLoggedTodayShowsAgainstTheDaysPlan() {
        assertEquals("35m of 2h today", todayText(obj("""{"kind":"task","planned_min":120,"logged_day_h":0.5833}""")))
        assertEquals("35m today", todayText(obj("""{"kind":"task","planned_min":null,"logged_day_h":0.5833}""")))
        assertNull(todayText(obj("""{"kind":"task","planned_min":null,"logged_day_h":0}""")))
    }

    @Test fun theTaskEstimateIsNeverTheDaysPlan() {
        val t = obj("""{"kind":"task","planned_min":null,"logged_day_h":0,"logged_h":0,"estimate_h":8}""")
        assertNull(todayText(t))
        assertEquals("0m / 8h all time", allTimeText(t))
    }

    @Test fun noEstimateIsSaidPlainly() {
        assertEquals("No estimate", allTimeText(obj("""{"kind":"task","logged_h":0}""")))
        assertEquals("30m logged, no estimate", allTimeText(obj("""{"kind":"task","logged_h":0.5}""")))
    }

    @Test fun aRenamedLineSaysWhichTaskItIsPartOf() {
        val t = obj("""{"kind":"task","title":"Draft intro","renamed":true,"task_title":"Write report","planned_min":45,"logged_day_h":0,"logged_h":0,"estimate_h":4}""")
        assertEquals("Part of Write report", partOfText(t))
        assertEquals("Part of Write report", lineDetails(t).first())
        assertEquals("Draft intro", lineTitle(t))
        assertNull(partOfText(obj("""{"kind":"task","title":"Write report","renamed":false,"task_title":"Write report"}""")))
    }

    @Test fun anEventSaysWhatItReservesAndWhatWasLogged() {
        val e = obj("""{"kind":"event","title":"Dentist","planned_min":45,"logged_h":0.5,"done":false}""")
        assertEquals("45m reserved", todayText(e))
        assertEquals("30m logged", allTimeText(e))
        assertTrue(rowDescription(e).startsWith("Event, Dentist"))
        assertFalse(rowDescription(e).endsWith("done"))
        assertTrue(rowDescription(obj("""{"kind":"event","title":"Dentist","done":true}""")).endsWith("done"))
    }

    @Test fun aNameLeftAsTheTaskTitleIsNoName() {
        assertNull(lineNameToSend("Write report", "Write report", editing = false))
        assertNull(lineNameToSend("  ", "Write report", editing = false))
        assertEquals("Draft intro", lineNameToSend(" Draft intro ", "Write report", editing = false))
        // Editing: "" clears an old name so the task's title shows again.
        assertEquals("", lineNameToSend("Write report", "Write report", editing = true))
        assertEquals("", lineNameToSend("", "Write report", editing = true))
    }

    @Test fun plannedTimeIsOptionalButMustBeValidWhenTyped() {
        assertEquals(true to null, plannedInput(""))
        assertEquals(true to 90L, plannedInput("1h 30m"))
        assertEquals(true to 45L, plannedInput("45"))
        assertEquals(false, plannedInput("soon").first)
        assertEquals(false, plannedInput("1.5").first)
    }

    @Test fun everyPickerRowShowsLoggedAgainstEstimate() {
        assertEquals("2h / 8h", pickerFigures(obj("""{"logged_h":2,"estimate_h":8}""")))
        assertEquals("0m / –", pickerFigures(obj("""{"logged_h":0,"estimate_h":null}""")))
    }

    @Test fun onlyEventsCanBeMarkedDone() {
        val ev = planActions(obj("""{"kind":"event","done":false}""")).map { it.first }
        assertTrue("done" in ev && "undone" !in ev && "edit" in ev && "plan" !in ev)
        val done = planActions(obj("""{"kind":"event","done":true}""")).map { it.first }
        assertTrue("undone" in done && "done" !in done)
        val task = planActions(obj("""{"kind":"task"}""")).map { it.first }
        assertTrue("plan" in task && "done" !in task && "undone" !in task && "log" in task)
    }
}
