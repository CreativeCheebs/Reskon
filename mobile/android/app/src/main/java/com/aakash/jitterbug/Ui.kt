package com.aakash.jitterbug

import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.Role
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

/** The web app's palette (web/src/theme/palette.ts). */
object Palette {
    val bg = Color(0xFF1D2125)
    val panel = Color(0xFF22272B)
    val raised = Color(0xFF282E33)
    val chip = Color(0xFF2C333A)
    val dim = Color(0xFF161A1D)
    val column = Color(0xFF1A1E22)
    val border = Color(0xFF38414A)
    val strong = Color(0xFF4B5560)
    val fg = Color(0xFFDCE2E8)
    val muted = Color(0xFF9FADBC)
    val subtle = Color(0xFF8C9BAB)
    val accent = Color(0xFF579DFF)
    val accentFg = Color(0xFF85B8FF)
    val selected = Color(0xFF1C2B41)
    val onAccent = Color(0xFF161A1D)
    val red = Color(0xFFF87168)
    val yellow = Color(0xFFF5CD47)
    val green = Color(0xFF4BCE97)
    val purple = Color(0xFF9F8FEF)

    /** Level 1-5, as on the web: pale to deep blue, never red (a restful level 5 is not a warning). */
    val intensity = listOf(Color(0xFFC7D1DE), Color(0xFFA3BDE6), Color(0xFF7DAEF0), Color(0xFF579DFF), Color(0xFF3B82F6))
}

private val JbColors = darkColorScheme(
    primary = Palette.accent, onPrimary = Palette.onAccent,
    primaryContainer = Palette.selected, onPrimaryContainer = Palette.accentFg,
    secondary = Palette.muted, onSecondary = Palette.onAccent,
    secondaryContainer = Palette.selected, onSecondaryContainer = Palette.accentFg,
    tertiary = Palette.purple,
    background = Palette.bg, onBackground = Palette.fg,
    surface = Palette.bg, onSurface = Palette.fg,
    surfaceVariant = Palette.chip, onSurfaceVariant = Palette.muted,
    surfaceContainerLowest = Palette.dim, surfaceContainerLow = Palette.panel, surfaceContainer = Palette.panel,
    surfaceContainerHigh = Palette.raised, surfaceContainerHighest = Palette.chip,
    surfaceTint = Color.Transparent,
    outline = Palette.strong, outlineVariant = Palette.border,
    error = Palette.red, onError = Palette.onAccent,
    scrim = Color(0x99000000),
)

@Composable
fun JbTheme(content: @Composable () -> Unit) = MaterialTheme(
    colorScheme = JbColors,
    shapes = Shapes(
        extraSmall = RoundedCornerShape(6.dp), small = RoundedCornerShape(10.dp), medium = RoundedCornerShape(14.dp),
        large = RoundedCornerShape(16.dp), extraLarge = RoundedCornerShape(28.dp),
    ),
    content = content,
)

@Composable
fun T(
    text: String, color: Color = Palette.fg, size: TextUnit = 15.sp, weight: FontWeight = FontWeight.Normal,
    modifier: Modifier = Modifier, oneLine: Boolean = false, strike: Boolean = false, upper: Boolean = false,
) = Text(
    if (upper) text.uppercase() else text, modifier, color = color,
    style = TextStyle(
        fontSize = size, fontWeight = weight, fontFeatureSettings = "tnum",
        letterSpacing = if (upper) 0.8.sp else TextUnit.Unspecified,
        textDecoration = if (strike) TextDecoration.LineThrough else null,
    ),
    maxLines = if (oneLine) 1 else Int.MAX_VALUE, overflow = TextOverflow.Ellipsis,
)

/** A 24-unit SVG path, stroked like the mockups' icons. */
@Composable
fun Icon(d: String, tint: Color = Palette.muted, size: Int = 22, stroke: Float = 2f) {
    val path = remember(d) { PathParser().parsePathString(d).toPath() }
    Canvas(Modifier.size(size.dp)) {
        val s = this.size.width / 24f
        drawContext.transform.scale(s, s, Offset.Zero)
        drawPath(path, tint, style = Stroke(width = stroke, cap = StrokeCap.Round, join = StrokeJoin.Round))
    }
}

object Icons {
    const val today = "M8 12a4 4 0 1 0 8 0a4 4 0 1 0-8 0M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
    const val board = "M3 4h5v16H3zM10 4h5v11h-5zM17 4h4v7h-4z"
    const val sessions = "M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0M12 7v5l3 2"
    const val inbox = "M3 13l3-8h12l3 8v6H3zM3 13h5l1 2h6l1-2h5"
    const val more = "M4 7h16M4 12h16M4 17h16"
    const val table = "M3 5h18v14H3zM3 10h18M3 15h18M9 5v14"
    const val timeline = "M4 6h9M8 12h10M6 18h8"
    const val search = "M4 11a7 7 0 1 0 14 0a7 7 0 1 0-14 0M16 16l4 4"
    const val dash = "M3 3h8v10H3zM13 3h8v6h-8zM13 11h8v10h-8zM3 15h8v6H3z"
    const val bolt = "M13 3L6 14h6l-1 7 7-11h-6z"
    const val cycle = "M4 6h6M4 12h12M4 18h9"
    const val gear = "M9 12a3 3 0 1 0 6 0a3 3 0 1 0-6 0M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"
    const val plus = "M12 5v14M5 12h14"
    const val minus = "M5 12h14"
    const val close = "M6 6l12 12M18 6L6 18"
    const val back = "M15 18l-6-6 6-6"
    const val left = "M15 18l-6-6 6-6"
    const val right = "M9 18l6-6-6-6"
    const val down = "M6 9l6 6 6-6"
    const val check = "M5 12l5 5 9-10"
    const val mic = "M9 5a3 3 0 0 1 6 0v6a3 3 0 0 1-6 0zM5 11a7 7 0 0 0 14 0M12 18v3"
    const val select = "M4 4h16v16H4zM8 12l3 3 5-6"
    const val filters = "M4 7h10M18 7h2M4 17h2M10 17h10M14 5v4M6 15v4"
    const val snooze = "M12 7v5l3 2M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0"
    const val dots = "M12 5h.01M12 12h.01M12 19h.01"
    const val sync = "M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3M18 3v4h-4M6 21v-4h4"
    const val download = "M12 4v11M7 10l5 5 5-5M5 20h14"
}

@Composable
fun Dot(c: Color, d: Int = 8) = Box(Modifier.size(d.dp).clip(CircleShape).background(c))

/** A panel: #22272B with a 1px border, as every mockup card. */
@Composable
fun Card(modifier: Modifier = Modifier, radius: Dp = 16.dp, pad: Dp = 0.dp, content: @Composable ColumnScope.() -> Unit) {
    val shape = RoundedCornerShape(radius)
    Column(modifier.fillMaxWidth().clip(shape).background(Palette.panel).border(1.dp, Palette.border, shape).padding(pad), content = content)
}

/** Divider between rows of a card. */
@Composable
fun Line() = Box(Modifier.fillMaxWidth().height(1.dp).background(Palette.border))

@Composable
fun SectionTitle(text: String, modifier: Modifier = Modifier) =
    T(text, Palette.subtle, 12.sp, FontWeight.SemiBold, modifier.padding(top = 6.dp, start = 2.dp), upper = true)

/** Round outlined chip; selected = accent border on the selected fill. */
@Composable
fun Pill(text: String, on: Boolean = false, dot: Color? = null, height: Int = 36, trailing: String? = null, onClick: (() -> Unit)? = null) {
    val shape = RoundedCornerShape(height / 2)
    Row(
        Modifier.heightIn(min = height.dp).clip(shape)
            .background(if (on) Palette.selected else Color.Transparent)
            .border(1.dp, if (on) Palette.accent else Palette.strong, shape)
            .then(if (onClick != null) Modifier.clickable(role = Role.Button, onClick = onClick).semantics { selected = on } else Modifier)
            .padding(horizontal = 14.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        dot?.let { Dot(it) }
        T(text, if (on) Palette.accentFg else Palette.muted, 14.sp, FontWeight.Medium, oneLine = true)
        trailing?.let { Icon(it, if (on) Palette.accentFg else Palette.muted, 16) }
    }
}

/** Small filled tag, e.g. "Engineering 70% · 3". */
@Composable
fun Tag(text: String, dot: Color? = null, bg: Color = Palette.chip, fg: Color = Palette.fg, round: Int = 6) {
    Row(
        Modifier.heightIn(min = 22.dp).clip(RoundedCornerShape(round.dp)).background(bg).padding(horizontal = 8.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp),
    ) {
        dot?.let { Dot(it, 7) }
        T(text, fg, 12.sp, FontWeight.Medium, oneLine = true)
    }
}

@Composable
fun IconButton(d: String, label: String, tint: Color = Palette.muted, size: Int = 48, onClick: () -> Unit) {
    Box(
        Modifier.size(size.dp).clip(CircleShape).clickable(onClickLabel = label, onClick = onClick).semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) { Icon(d, tint) }
}

/** Screen title row. With onBack, a back arrow sits before the title. */
@Composable
fun TopBar(title: String, onBack: (() -> Unit)? = null, sub: String? = null, actions: @Composable RowScope.() -> Unit = {}) {
    Row(
        Modifier.fillMaxWidth().windowInsetsPadding(WindowInsets.statusBars)
            .padding(start = if (onBack != null) 4.dp else 20.dp, end = 8.dp, top = 8.dp, bottom = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        onBack?.let { IconButton(Icons.back, "Back", Palette.fg, onClick = it) }
        Row(Modifier.weight(1f), verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            T(title, Palette.fg, if (onBack != null) 20.sp else 22.sp, FontWeight.SemiBold, oneLine = true)
            sub?.let { T(it, Palette.muted, 14.sp, modifier = Modifier.padding(bottom = 2.dp), oneLine = true) }
        }
        actions()
    }
}

/** Extended floating button, bottom right above the nav bar. */
@Composable
fun Fab(label: String?, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Row(
        modifier.height(56.dp).shadow(8.dp, RoundedCornerShape(18.dp)).clip(RoundedCornerShape(18.dp))
            .background(Palette.accent).clickable(role = Role.Button, onClick = onClick).semantics { contentDescription = label ?: "New" }
            .padding(start = 16.dp, end = if (label != null) 20.dp else 16.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Icon(Icons.plus, Palette.onAccent, 22, 2.2f)
        label?.let { T(it, Palette.onAccent, 15.sp, FontWeight.SemiBold) }
    }
}

/** Full-width primary button pinned to the bottom of a form. */
@Composable
fun BottomAction(label: String, enabled: Boolean = true, secondary: String? = null, onSecondary: () -> Unit = {}, onClick: () -> Unit) {
    Column(Modifier.fillMaxWidth().background(Palette.bg)) {
        Line()
        Row(
            Modifier.fillMaxWidth().windowInsetsPadding(WindowInsets.navigationBars).padding(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 20.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            secondary?.let {
                Box(
                    Modifier.weight(1f).heightIn(min = 52.dp).clip(RoundedCornerShape(26.dp)).border(1.dp, Palette.strong, RoundedCornerShape(26.dp))
                        .clickable(role = Role.Button, onClick = onSecondary),
                    contentAlignment = Alignment.Center,
                ) { T(it, Palette.fg, 16.sp, FontWeight.SemiBold) }
            }
            Box(
                Modifier.weight(if (secondary != null) 2f else 1f).heightIn(min = 52.dp).clip(RoundedCornerShape(26.dp))
                    .background(if (enabled) Palette.accent else Palette.chip).clickable(enabled = enabled, role = Role.Button, onClick = onClick),
                contentAlignment = Alignment.Center,
            ) { T(label, if (enabled) Palette.onAccent else Palette.subtle, 16.sp, FontWeight.SemiBold) }
        }
    }
}

/** Label over a value, in a tappable box (the mockups' field buttons). */
@Composable
fun FieldBox(label: String, value: String, modifier: Modifier = Modifier, dot: Color? = null, bg: Color = Palette.panel, height: Int = 60, onClick: (() -> Unit)? = null) {
    val shape = RoundedCornerShape(14.dp)
    Column(
        modifier.heightIn(min = height.dp).clip(shape).background(bg).border(1.dp, Palette.border, shape)
            .then(if (onClick != null) Modifier.clickable(role = Role.Button, onClick = onClick) else Modifier).padding(horizontal = 14.dp),
        verticalArrangement = Arrangement.Center,
    ) {
        T(label, Palette.muted, 12.sp)
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            dot?.let { Dot(it) }
            T(value, Palette.fg, 15.sp, FontWeight.Medium, oneLine = true)
        }
    }
}

/** A row in a settings-style list: icon, name, hint, chevron. */
@Composable
fun ListRow(name: String, hint: String = "", icon: String? = null, iconColor: Color = Palette.muted, chevron: Boolean = true, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable(role = Role.Button, onClick = onClick).padding(horizontal = 16.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        icon?.let { Icon(it, iconColor) }
        Column(Modifier.weight(1f)) {
            T(name, Palette.fg, 15.sp, FontWeight.Medium)
            if (hint.isNotEmpty() && icon == null) T(hint, Palette.muted, 13.sp)
        }
        if (hint.isNotEmpty() && icon != null) T(hint, Palette.muted, 13.sp)
        if (chevron) Icon(Icons.right, Palette.subtle, 18)
    }
}

@Composable
fun Empty(text: String) = T(text, Palette.subtle, 14.sp, modifier = Modifier.padding(16.dp))

@Composable
fun Gap(h: Int) = Spacer(Modifier.height(h.dp))

@Composable
fun HGap(w: Int) = Spacer(Modifier.width(w.dp))

// Formatting only: every value here comes from the server.

/** 1.5 -> "1.5h", 0.25 -> "15m". */
fun hrs(h: Double?): String {
    if (h == null) return "–"
    if (h > 0 && h < 1 && (h * 60) % 1.0 == 0.0) return "${(h * 60).toInt()}m"
    val r = Math.round(h * 10) / 10.0
    return (if (r % 1.0 == 0.0) r.toInt().toString() else r.toString()) + "h"
}

/** 3.03 -> "3h 2m". */
fun hm(h: Double?): String {
    if (h == null) return "–"
    val m = Math.round(h * 60)
    return when {
        m < 60 -> "${m}m"
        m % 60 == 0L -> "${m / 60}h"
        else -> "${m / 60}h ${m % 60}m"
    }
}

/** An age in hours as the cards show it: "3h", "2d". */
fun age(h: Double?): String = when {
    h == null -> "–"
    h < 1 -> "${Math.round(h * 60)}m"
    h < 24 -> "${Math.round(h)}h"
    else -> "${(h / 24).toInt()}d"
}

fun num(v: Double?): String {
    if (v == null) return "–"
    val r = Math.round(v * 10) / 10.0
    return if (r % 1.0 == 0.0) r.toLong().toString() else r.toString()
}

private val dayFmt = DateTimeFormatter.ofPattern("EEE d MMM", Locale.ENGLISH)
private val shortFmt = DateTimeFormatter.ofPattern("d MMM", Locale.ENGLISH)

/** "2026-11-03" -> "Tue 3 Nov". */
fun dayLabel(iso: String?): String = runCatching { LocalDate.parse(iso!!.take(10)).format(dayFmt) }.getOrDefault(iso ?: "")

/** "2026-11-03" -> "3 Nov". */
fun shortDate(iso: String?): String = runCatching { LocalDate.parse(iso!!.take(10)).format(shortFmt) }.getOrDefault(iso ?: "")

/** Today / Yesterday / Tue 3 Nov. */
fun relDay(iso: String): String {
    val d = runCatching { LocalDate.parse(iso.take(10)) }.getOrNull() ?: return iso
    return when (d) {
        LocalDate.now() -> "Today"
        LocalDate.now().minusDays(1) -> "Yesterday"
        LocalDate.now().plusDays(1) -> "Tomorrow"
        else -> d.format(dayFmt)
    }
}

@Composable
fun Outline(modifier: Modifier = Modifier, radius: Int = 14, content: @Composable () -> Unit) {
    val shape = RoundedCornerShape(radius.dp)
    Box(modifier.clip(shape).border(BorderStroke(1.dp, Palette.border), shape)) { content() }
}
