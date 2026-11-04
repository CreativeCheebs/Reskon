package com.aakash.jitterbug

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch

/** No areas yet: ask for the first one, as the web app does. Creating it also creates its board view. */
@Composable
fun FirstRunScreen() {
    var name by remember { mutableStateOf("Personal") }
    var prefix by remember { mutableStateOf("PR") }
    val scope = rememberCoroutineScope()
    Column(Modifier.fillMaxSize()) {
        Column(
            Modifier.weight(1f).windowInsetsPadding(WindowInsets.statusBars).padding(horizontal = 24.dp, vertical = 48.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            T("JitterBug", Palette.fg, 32.sp, FontWeight.SemiBold)
            T("Everything stays on this phone. You can add a sync server later in Settings.", Palette.muted, 15.sp)
            Gap(8)
            T("Name your first area. Tasks belong to an area; you can add more later.", Palette.fg, 15.sp)
            TextBox("Area", name) { name = it }
            TextBox("Task key prefix", prefix, "e.g. PR") { prefix = it.uppercase().filter(Char::isLetterOrDigit).take(6) }
        }
        BottomAction("Start", enabled = name.isNotBlank() && prefix.isNotBlank()) {
            scope.launch {
                attempt("Not created") {
                    Api.post("/areas", jsonOf("name" to name.trim(), "key_prefix" to prefix))
                    App.reloadBoot()
                    App.go("today")
                }
            }
        }
    }
}
