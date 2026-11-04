package com.aakash.jitterbug

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import java.time.Duration
import java.time.Instant
import java.time.ZoneId

/** Inbox: lines dropped to sort out later. Process opens quick capture with the line. */
@Composable
fun InboxScreen() {
    val items by loaded { Api.arr("/inbox").objs() }
    var text by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()
    fun add() {
        if (text.isBlank()) return
        val line = text.trim()
        text = ""
        scope.launch { attempt("Not added") { Api.post("/inbox", jsonOf("text" to line)); App.changed() } }
    }
    val list = items.orEmpty()
    Column(Modifier.fillMaxSize()) {
        TopBar("Inbox", sub = if (list.isEmpty()) null else "${list.size} ${if (list.size == 1) "line" else "lines"}, oldest first")
        Row(Modifier.padding(start = 16.dp, end = 16.dp, top = 6.dp, bottom = 14.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            BasicTextField(
                text, { text = it }, singleLine = true, cursorBrush = SolidColor(Palette.accent),
                textStyle = TextStyle(color = Palette.fg, fontSize = 15.sp),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done), keyboardActions = KeyboardActions(onDone = { add() }),
                modifier = Modifier.weight(1f).height(48.dp).clip(RoundedCornerShape(24.dp)).background(Palette.panel)
                    .border(1.dp, Palette.strong, RoundedCornerShape(24.dp)).padding(horizontal = 16.dp, vertical = 13.dp),
                decorationBox = { inner -> if (text.isEmpty()) T("Drop a line, sort it out later", Palette.subtle, 15.sp); inner() },
            )
            Box(
                Modifier.size(48.dp).clip(RoundedCornerShape(24.dp)).background(Palette.accent).clickable(onClickLabel = "Add to inbox") { add() },
                contentAlignment = Alignment.Center,
            ) { Icon(Icons.plus, Palette.onAccent, 22, 2.2f) }
        }
        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(start = 16.dp, end = 16.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            if (items != null && list.isEmpty()) Empty("Nothing waiting. Lines you drop here wait until you process them.")
            list.forEach { it ->
                val id = it.getLong("id")
                Card(pad = 0.dp) {
                    Column(Modifier.padding(start = 16.dp, end = 16.dp, top = 14.dp, bottom = 12.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            T(it.getString("text"), Palette.fg, 15.sp)
                            T(ago(it.getString("created_at")), Palette.subtle, 12.sp)
                        }
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.End)) {
                            TextLink("Discard", Palette.muted) {
                                scope.launch { attempt("Not discarded") { Api.del("/inbox/$id"); App.changed() } }
                            }
                            Box(
                                Modifier.height(40.dp).clip(RoundedCornerShape(20.dp)).background(Palette.selected)
                                    .clickable { App.go("capture", "text" to it.getString("text"), "inbox" to id) }.padding(horizontal = 18.dp),
                                contentAlignment = Alignment.Center,
                            ) { T("Process", Palette.accentFg, 14.sp, FontWeight.SemiBold) }
                        }
                    }
                }
            }
            if (list.isNotEmpty()) T("Process reads a line through quick capture. It leaves the inbox only once you save what it became.", Palette.subtle, 13.sp,
                modifier = Modifier.padding(horizontal = 4.dp, vertical = 6.dp))
        }
    }
}

/** "2 days ago", "Yesterday, 08:12", "Today, 11:40". */
fun ago(iso: String): String {
    val at = runCatching { Instant.parse(iso).atZone(ZoneId.systemDefault()) }.getOrNull() ?: return iso
    val days = Duration.between(at.toLocalDate().atStartOfDay(), java.time.LocalDate.now().atStartOfDay()).toDays()
    val time = at.toLocalTime().toString().take(5)
    return when (days) {
        0L -> "Today, $time"
        1L -> "Yesterday, $time"
        else -> "$days days ago"
    }
}
