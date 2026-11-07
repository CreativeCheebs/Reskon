package com.aakash.jitterbug

import androidx.compose.ui.test.SemanticsNodeInteraction
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertWidthIsAtLeast
import androidx.compose.ui.unit.dp

/**
 * A control must be a real 48 x 48 dp (or larger) tap area. This reads the control's own
 * layout size, not the touch bounds Compose widens around small ones, so a 24 dp button
 * cannot pass by being widened (see TouchAssertTest).
 */
fun SemanticsNodeInteraction.assertTapAreaAtLeast48(): SemanticsNodeInteraction =
    assertHeightIsAtLeast(48.dp).assertWidthIsAtLeast(48.dp)
