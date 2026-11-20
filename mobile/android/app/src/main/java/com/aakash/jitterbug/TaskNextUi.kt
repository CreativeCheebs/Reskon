package com.aakash.jitterbug

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import org.json.JSONObject

// ---------------------------------------------------------------- Round tag

/** The round label on its own: small, monospace, accent colour (SPEC 4.17). Not part of the title. */
@Composable
fun RoundTag(tag: String?, size: TextUnit = 12.sp) {
    if (tag == null) return
    Text(tag, color = Palette.accent, maxLines = 1, style = TextStyle(fontSize = size, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Medium))
}

/**
 * A title with its round label after it. One line ([oneLine]): the title gives way (ellipsis) so
 * the label is never cut off; used by list rows. Otherwise it wraps, the label after the last word.
 * A strike-through marks the title only, never the label.
 */
@Composable
fun RoundTitle(
    t: JSONObject, color: Color = Palette.fg, size: TextUnit = 15.sp, weight: FontWeight = FontWeight.Medium,
    modifier: Modifier = Modifier, strike: Boolean = false, oneLine: Boolean = true,
) {
    val tag = roundTag(t)
    if (!oneLine) {
        val text = buildAnnotatedString {
            withStyle(SpanStyle(textDecoration = if (strike) TextDecoration.LineThrough else null)) { append(t.optString("title")) }
            if (tag != null) {
                append("  ")
                withStyle(SpanStyle(color = Palette.accent, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Medium, fontSize = (size.value * 0.8f).sp)) { append(tag) }
            }
        }
        Text(text, modifier, color = color, style = TextStyle(fontSize = size, fontWeight = weight, fontFeatureSettings = "tnum"))
        return
    }
    Row(modifier, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        T(t.optString("title"), color, size, weight, Modifier.weight(1f, fill = false), oneLine = true, strike = strike)
        RoundTag(tag, (size.value * 0.8f).sp)
    }
}

/** A title that wraps (the task screen header), with the round label after its last word. */
fun titleWithRound(title: String, tag: String?, size: TextUnit): AnnotatedString = buildAnnotatedString {
    append(title)
    if (tag != null) {
        append("  ")
        withStyle(SpanStyle(color = Palette.accent, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Medium, fontSize = (size.value * 0.65f).sp)) { append(tag) }
    }
}

// ---------------------------------------------------------------- Task screen sections

/** Chain: the task this one continues (Comes after) and the ones that continue it (Next). Hidden when there are none. */
@Composable
fun TaskChainSection(t: JSONObject) {
    val after = t.optJSONObject("follows")
    val next = t.objs("followed_by")
    if (after == null && next.isEmpty()) return
    SectionTitle("Chain")
    Card {
        (listOfNotNull(after?.let { "Comes after" to it }) + next.map { "Next" to it }).forEachIndexed { i, (rel, o) ->
            if (i > 0) Line()
            Row(
                Modifier.fillMaxWidth().heightIn(min = 48.dp).clickable(role = Role.Button) { App.go("task", "id" to o.getLong("id")) }
                    .padding(horizontal = 16.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                T(rel, Palette.muted, 14.sp, modifier = Modifier.width(96.dp))
                RoundTitle(o, Palette.fg, 15.sp, modifier = Modifier.weight(1f), oneLine = true,
                    strike = o.optString("behaviour") in setOf("done", "cancelled"))
                Icon(Icons.right, Palette.subtle, 18)
            }
        }
    }
}

/**
 * Rounds (or versions) of this task's series: the rounds/versions switch, then every round with its
 * number, done date or state, hours and points, listed side by side and never added up. Shown only
 * for a task that is a round.
 */
@Composable
fun TaskRoundsSection(t: JSONObject) {
    val tag = roundTag(t) ?: return
    val scope = rememberCoroutineScope()
    val kind = t.str("round_kind") ?: "round"
    val id = t.getLong("id")
    SectionTitle(if (kind == "version") "Versions" else "Rounds")
    Card {
        Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            T("This one", Palette.muted, 14.sp)
            RoundTag(tag, 14.sp)
            Box(Modifier.weight(1f))
            fun set(k: String) {
                if (k != kind) scope.launch { attempt("Not saved") { Api.post("/tasks/$id/round-kind", jsonOf("kind" to k)); App.changed() } }
            }
            Pill("Rounds #", kind != "version", height = 48, dense = true) { set("round") }
            Pill("Versions v", kind == "version", height = 48, dense = true) { set("version") }
        }
        t.objs("rounds").forEach { r ->
            Line()
            val here = r.getLong("id") == id
            Row(
                Modifier.fillMaxWidth().heightIn(min = 48.dp)
                    .then(if (here) Modifier else Modifier.clickable(role = Role.Button) { App.go("task", "id" to r.getLong("id")) })
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Box(Modifier.width(44.dp)) { RoundTag(roundTag(r.id("no"), kind), 14.sp) }
                T(roundState(r) + if (here) " · this one" else "", if (here) Palette.fg else Palette.muted, 14.sp, modifier = Modifier.weight(1f), oneLine = true)
                T(hrs(r.optDouble("logged_h")), Palette.fg, 14.sp)
                T("${num(r.optDouble("points"))} pts", Palette.muted, 14.sp)
            }
        }
    }
}
