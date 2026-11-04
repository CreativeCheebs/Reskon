package com.aakash.jitterbug

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.dp
import org.json.JSONObject

// Words for the severity scale, as web/src/states/severity.tsx. Index = severity x 2.
private val DEBUFF = listOf("None", "Very mild", "Very low", "Low", "Intermediate", "Moderate", "High", "Very high", "Severe", "Very severe", "Unbearable")
private val BUFF = listOf("None", "Very mild", "Very low", "Low", "Intermediate", "Moderate", "High", "Very high", "Strong", "Very strong", "Peak")

fun severityName(sev: Double, kind: String): String {
    val steps = if (kind == "buff") BUFF else DEBUFF
    return steps[Math.round(sev * 2).toInt().coerceIn(0, steps.size - 1)].lowercase()
}

fun kindColor(kind: String): Color = when (kind) {
    "buff" -> Palette.green
    "modifier" -> Palette.accent
    else -> Palette.purple
}

/** "2.5 (from 3)" when decay has moved it, else "3". Display only. */
fun severityText(s: JSONObject): String {
    val eff = num(s.optDouble("effective_severity"))
    val sev = num(s.optDouble("severity"))
    return if (eff == sev) sev else "$eff (from $sev)"
}

/** "debuff · 2.5 (from 3) moderate · day 2" */
fun stateDetail(s: JSONObject): String {
    val kind = s.optString("kind")
    return "$kind · ${severityText(s)} ${severityName(s.optDouble("effective_severity"), kind)} · day ${s.optInt("days_running")}"
}

/** A ring in the kind's colour, filled clockwise by severity out of 5. */
@Composable
fun SeverityRing(kind: String, severity: Double, size: Int = 16) {
    val c = kindColor(kind)
    Canvas(Modifier.size(size.dp)) {
        val w = this.size.width
        drawCircle(c, radius = w * 7 / 16, style = Stroke(w * 1.5f / 16))
        val f = (severity / 5).coerceIn(0.0, 1.0).toFloat()
        if (f > 0) {
            val r = w * 4.6f / 16
            drawArc(c, -90f, f * 360f, true, topLeft = Offset(w / 2 - r, w / 2 - r), size = Size(r * 2, r * 2))
        }
    }
}
