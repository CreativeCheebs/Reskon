package com.aakash.jitterbug

import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertIsOn
import androidx.compose.ui.test.isToggleable
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import org.json.JSONArray
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test

/** The three lists behind the Snoozed / Blocked / Incomplete buttons. */
class TaskSheetsTest {
    @get:Rule val rule = createComposeRule()

    @Before fun lookups() { App.boot = Boot(JSONObject()) }
    @After fun clear() { App.boot = null }

    private fun task(id: Long, title: String) = JSONObject().put("id", id).put("title", title)

    @Test fun snoozedTasksShowWhenTheyComeBackAndCanBeWoken() {
        val woken = mutableListOf<Long>()
        val t = task(7, "Fix the shed door").put("snoozed_until", "2099-01-02")
        rule.setContent { SnoozedSheet(listOf(t), emptySet(), { woken += it.getLong("id") }, {}) }
        rule.onNodeWithText("Fix the shed door").assertExists()
        rule.onNodeWithText("Back on ${dayLabel("2099-01-02")}").assertExists()
        rule.onNodeWithText("Wake now").assertIsEnabled().assertTapAreaAtLeast48().performClick()
        assertEquals(listOf(7L), woken)
    }

    @Test fun aTaskBeingWokenCannotBeWokenAgain() {
        val t = task(7, "Fix the shed door").put("snoozed_until", "2099-01-02")
        rule.setContent { SnoozedSheet(listOf(t), setOf(7L), {}, {}) }
        rule.onNodeWithText("Wake now").assertIsNotEnabled()
    }

    @Test fun theHideSwitchIsLabelledAndFlipsAtOnce() {
        var saved: Boolean? = null
        val blocker = JSONObject().put("title", "Find the part").put("behaviour", "todo")
        val t = task(3, "Order brake pads").put("blocked_by", JSONArray().put(blocker))
        rule.setContent { BlockedSheet(listOf(t), hidden = true, onHidden = { saved = it }, onDismiss = {}) }
        rule.onNodeWithText("Waiting on Find the part").assertExists()
        rule.onNode(isToggleable()).assertIsOn()
        rule.onNodeWithText("Hide them from this view").performClick()
        assertEquals(false, saved)
    }

    @Test fun incompleteTasksSayWhatTheyLack() {
        val t = task(4, "Write the report").put("missing", JSONArray(listOf("due_at", "epic_id")))
        rule.setContent { IncompleteSheet(listOf(t), {}) }
        rule.onNodeWithText("Due date").assertExists()
        rule.onNodeWithText("Epic").assertExists()
    }

    @Test fun aSheetClosesItselfWhenItsLastTaskLeaves() {
        var closed = false
        rule.setContent { IncompleteSheet(emptyList()) { closed = true } }
        rule.waitForIdle()
        assertTrue(closed)
    }
}
