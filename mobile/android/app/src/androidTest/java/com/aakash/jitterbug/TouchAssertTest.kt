package com.aakash.jitterbug

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Text
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.unit.dp
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

/** The 48 dp check has to be able to fail, or the tests that use it prove nothing. */
class TouchAssertTest {
    @get:Rule val rule = createComposeRule()

    @Test fun aTinyClickableFailsTheCheck() {
        rule.setContent { Box(Modifier.size(24.dp).clickable {}) { Text("Tiny") } }
        val failed = runCatching { rule.onNodeWithText("Tiny").assertTapAreaAtLeast48() }.isFailure
        assertTrue("a 24 dp control passed the 48 dp check", failed)
    }

    @Test fun aBigEnoughClickablePassesTheCheck() {
        rule.setContent { Box(Modifier.size(48.dp).clickable {}) { Text("Big") } }
        rule.onNodeWithText("Big").assertTapAreaAtLeast48()
    }
}
