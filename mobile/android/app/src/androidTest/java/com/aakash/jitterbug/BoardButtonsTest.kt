package com.aakash.jitterbug

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertHasClickAction
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.click
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test

/** The Snoozed / Blocked / Incomplete buttons: a real 48 dp tap area each, each says which it is, and none is lost at large text. */
class BoardButtonsTest {
    @get:Rule val rule = createComposeRule()

    private fun split(snoozed: Int, blocked: Int, incomplete: Int) = ListSplit(
        shown = emptyList(),
        snoozed = List(snoozed) { JSONObject().put("id", it) },
        blocked = List(blocked) { JSONObject().put("id", it) },
        incomplete = List(incomplete) { JSONObject().put("id", it) },
    )

    @Test fun everyButtonIsAtLeast48dp() {
        rule.setContent { HiddenGroup(split(3, 2, 4)) {} }
        listOf("Snoozed 3", "Blocked 2", "Incomplete 4").forEach { rule.onNodeWithText(it).assertHasClickAction().assertTapAreaAtLeast48() }
    }

    @Test fun aTapOnTheTopEdgeOfAButtonStillHitsIt() {
        var opened = ""
        rule.setContent { HiddenGroup(split(3, 2, 4)) { opened = it } }
        rule.onNodeWithText("Blocked 2").performTouchInput { click(Offset(width / 2f, 2f)) }
        assertEquals("blocked", opened)
    }

    @Test fun aButtonWithNoTasksIsNotShown() {
        rule.setContent { HiddenGroup(split(0, 2, 0)) {} }
        rule.onNodeWithText("Blocked 2").assertExists()
        rule.onAllNodesWithText("Snoozed", substring = true).assertCountEquals(0)
        rule.onAllNodesWithText("Incomplete", substring = true).assertCountEquals(0)
    }

    @Test fun tappingAButtonSaysWhichOne() {
        var opened = ""
        rule.setContent { HiddenGroup(split(0, 2, 1)) { opened = it } }
        rule.onNodeWithText("Incomplete 1").performClick()
        assertEquals("incomplete", opened)
    }

    @Test fun everyButtonCanBeReachedAtDoubleTextSizeOnANarrowScreen() {
        rule.setContent {
            val d = LocalDensity.current
            CompositionLocalProvider(LocalDensity provides Density(d.density, fontScale = 2f)) {
                Box(Modifier.width(320.dp)) { HiddenGroup(split(12, 3, 27)) {} }
            }
        }
        listOf("Snoozed 12", "Blocked 3", "Incomplete 27").forEach {
            rule.onNodeWithText(it).performScrollTo().assertIsDisplayed().assertHeightIsAtLeast(48.dp)
        }
    }
}
