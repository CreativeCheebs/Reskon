package com.aakash.jitterbug

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** The Day screen is offered only while its setting is on; the phone opens on Board otherwise. */
class ScreensTest {
    @Test fun theDayScreenIsOffUntilSomeoneTurnsItOn() {
        assertFalse(showsDay(JSONObject()))
        assertFalse(showsDay(JSONObject().put("show_day_screen", false)))
        assertTrue(showsDay(JSONObject().put("show_day_screen", true)))
    }

    @Test fun onlyARealTrueTurnsItOn() {
        assertFalse(showsDay(JSONObject().put("show_day_screen", "true")))
        assertFalse(showsDay(JSONObject().put("show_day_screen", 1)))
        assertFalse(showsDay(JSONObject().put("show_day_screen", JSONObject.NULL)))
    }

    @Test fun todayHasATabOnlyWhileTheDayScreenIsOn() {
        assertEquals(listOf("board", "sessions", "inbox", "more"), visibleTabs(false).map { it.first })
        assertEquals(listOf("today", "board", "sessions", "inbox", "more"), visibleTabs(true).map { it.first })
    }

    @Test fun theDayTabIsCalledPlanner() {
        assertEquals("Planner", ALL_TABS.first { it.first == "today" }.second)
    }

    @Test fun theAppOpensOnBoardUnlessTheDayScreenIsOn() {
        assertEquals("board", startRoute(false))
        assertEquals("today", startRoute(true))
    }
}
