package com.aakash.jitterbug

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import org.json.JSONArray

/**
 * Settings › Card actions, top section: which buttons a swiped task row shows on this phone.
 * Tap an action to add it at the end (up to 3); tap a chosen one to remove it. Saved as the
 * `phone_card_actions` setting, so it follows the account to another phone but never changes the web.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SwipeActionsSection() {
    val boot = App.boot ?: return
    val scope = rememberCoroutineScope()
    val chosen = swipeActions(boot.settings)
    fun tap(key: String) {
        val next = toggleSwipe(chosen, key)
        if (next == null) App.say("Up to $SWIPE_MAX buttons; the rest are under More")
        else scope.launch { attempt("Not saved") { saveSetting("phone_card_actions", jsonOf("swipe" to JSONArray(next))) } }
    }
    SectionTitle("Swipe left · up to $SWIPE_MAX, in the order you tap them")
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        CARD_ACTIONS.forEach { (k, label) -> NumberChip(label, chosen.indexOf(k) + 1) { tap(k) } }
    }
    SectionTitle("Preview")
    Row(Modifier.fillMaxWidth().height(56.dp).clip(RoundedCornerShape(12.dp)).background(Palette.panel).border(1.dp, Palette.border, RoundedCornerShape(12.dp))) {
        Box(Modifier.weight(1f).padding(horizontal = 12.dp), contentAlignment = Alignment.CenterStart) { T("Task row", Palette.subtle, 13.sp) }
        chosen.forEach { SwipeButton(it, 56.dp) }
        SwipeButton("more", 56.dp)
    }
    T("More is always there and holds every action.", Palette.subtle, 12.sp)
}

/** A chip like [Pill], with the action's place in the order as a small number when chosen ([place] 0 = not chosen). */
@Composable
private fun NumberChip(text: String, place: Int, onClick: () -> Unit) {
    val on = place > 0
    val shape = RoundedCornerShape(18.dp)
    Row(
        Modifier.heightIn(min = 36.dp).clip(shape).background(if (on) Palette.selected else androidx.compose.ui.graphics.Color.Transparent)
            .border(1.dp, if (on) Palette.accent else Palette.strong, shape)
            .clickable(role = Role.Button, onClick = onClick)
            .semantics(mergeDescendants = true) { selected = on; contentDescription = if (on) "$text, number $place" else text }
            .padding(horizontal = 14.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        if (on) Box(Modifier.size(16.dp).clip(CircleShape).background(Palette.accent), contentAlignment = Alignment.Center) {
            T(place.toString(), Palette.onAccent, 10.sp, FontWeight.Bold)
        }
        T(text, if (on) Palette.accentFg else Palette.fg, 14.sp, oneLine = true)
    }
}
