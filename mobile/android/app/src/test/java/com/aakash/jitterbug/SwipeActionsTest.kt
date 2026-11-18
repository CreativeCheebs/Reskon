package com.aakash.jitterbug

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** The swipe buttons: the default, the saved order and the limit of three. */
class SwipeActionsTest {
    private fun settings(json: String) = JSONObject("""{"phone_card_actions":$json}""")

    @Test fun nothingSavedGivesSnoozeLogMove() {
        assertEquals(listOf("snooze", "log", "move"), swipeActions(JSONObject()))
        assertEquals(listOf("snooze", "log", "move"), swipeActions(JSONObject("""{"phone_card_actions":{}}""")))
    }

    @Test fun savedOrderIsKept() {
        assertEquals(listOf("delete", "open", "log"), swipeActions(settings("""{"swipe":["delete","open","log"]}""")))
    }

    @Test fun savedEmptyStaysEmpty() {
        assertEquals(emptyList<String>(), swipeActions(settings("""{"swipe":[]}""")))
    }

    @Test fun unknownRepeatedAndExtraAreDropped() {
        assertEquals(listOf("log", "move", "open"), swipeActions(settings("""{"swipe":["log","fly","log","move","open","delete"]}""")))
    }

    @Test fun tappingAddsAtTheEndAndRemoves() {
        assertEquals(listOf("snooze", "log", "note"), toggleSwipe(listOf("snooze", "log"), "note"))
        assertEquals(listOf("snooze", "move"), toggleSwipe(listOf("snooze", "log", "move"), "log"))
        assertEquals(listOf("log"), toggleSwipe(emptyList(), "log"))
    }

    @Test fun aFourthIsRefusedButRemovingStillWorks() {
        assertNull(toggleSwipe(listOf("snooze", "log", "move"), "open"))
        assertEquals(listOf("snooze", "log"), toggleSwipe(listOf("snooze", "log", "move"), "move"))
    }

    @Test fun anUnknownKeyChangesNothing() {
        assertEquals(listOf("log"), toggleSwipe(listOf("log"), "fly"))
    }

    @Test fun theActionListMatchesTheWebMenuOrder() {
        assertEquals(TASK_ACTION_KEYS, CARD_ACTIONS.map { it.first })
        assertEquals("delete", TASK_ACTION_KEYS.last())
    }

    @Test fun everyActionHasAButtonWord() {
        TASK_ACTION_KEYS.forEach { assertEquals(false, swipeLabel(it) == it) }
    }
}
