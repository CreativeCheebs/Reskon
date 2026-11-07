package com.aakash.jitterbug

import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test

/** The choice sheets (Snooze, Move to, Views): every row is at least 48 dp tall and wide, and a tap picks it. */
class PickSheetTest {
    @get:Rule val rule = createComposeRule()

    private val options = listOf(1L to "1 day", 2L to "3 days", 3L to "1 week", -1L to "Until unblocked", 0L to "Wake up now")

    @Test fun everyRowIsAtLeast48dp() {
        rule.setContent { PickSheet("Snooze", options, {}) {} }
        options.forEach { rule.onNodeWithText(it.second).assertTapAreaAtLeast48() }
    }

    @Test fun tappingARowPicksIt() {
        var picked = Long.MIN_VALUE
        rule.setContent { PickSheet("Snooze", options, {}) { picked = it } }
        rule.onNodeWithText("3 days").performClick()
        assertEquals(2L, picked)
    }
}
