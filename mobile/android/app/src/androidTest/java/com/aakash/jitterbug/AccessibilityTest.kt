package com.aakash.jitterbug

import androidx.compose.foundation.layout.Box
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.role
import androidx.compose.ui.test.assertHasClickAction
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import org.junit.Rule
import org.junit.Test

/**
 * A pattern for checking screens with Compose semantics (no pixels): a control
 * must be reachable by its text and respond to a click. Extend this per screen
 * as the hand-built controls in Ui.kt get roles.
 */
class AccessibilityTest {
    @get:Rule val rule = createComposeRule()

    @Test fun aClickableControlWithARoleIsFoundByItsText() {
        rule.setContent {
            Box(Modifier.semantics { role = Role.Button }) { androidx.compose.material3.Text("Save") }
        }
        rule.onNodeWithText("Save").assertExists()
    }

    @Test fun clickActionIsExposed() {
        rule.setContent {
            androidx.compose.material3.Button(onClick = {}) { androidx.compose.material3.Text("Go") }
        }
        rule.onNodeWithText("Go").assertHasClickAction()
    }
}
