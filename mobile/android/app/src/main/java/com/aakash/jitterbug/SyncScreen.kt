package com.aakash.jitterbug

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import java.time.ZoneId

@Composable
fun SyncScreen() {
    val ctx = LocalContext.current
    val st = Sync.live ?: Sync.state(ctx).also { Sync.live = it }
    var addr by remember { mutableStateOf(st.server?.removePrefix("http://") ?: "") }
    var user by remember { mutableStateOf(st.username ?: "") }
    var pw by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    Column(Modifier.fillMaxSize()) {
        TopBar("Sync server", onBack = { App.back() })
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(start = 16.dp, end = 16.dp, bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            if (st.server != null) {
                Card(pad = 16.dp) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Dot(if (st.error == null) Palette.green else Palette.yellow, 10)
                        T(if (st.error == null) "Syncing" else "Sync problem", Palette.fg, 15.sp, FontWeight.SemiBold)
                    }
                    Gap(6)
                    T("${st.username} on ${st.server}", Palette.muted, 14.sp)
                    st.syncedAt?.let { T("Last synced ${ago(it)} · sent ${st.sent}, received ${st.received}", Palette.subtle, 13.sp) }
                    st.error?.let { T(it, Palette.yellow, 13.sp) }
                    Gap(4)
                    Row {
                        TextLink(if (busy) "Syncing…" else "Sync now") { if (!busy) scope.launch { busy = true; try { Sync.syncNow(ctx) } finally { busy = false } } }
                        TextLink("Disconnect", Palette.red) { Sync.disconnect(ctx); App.say("Disconnected. Everything stays on this phone.") }
                    }
                }
                T("Everything is kept on this phone and works offline. Changes go both ways when the server can be reached: on opening the app, a few seconds after a change, and every few minutes.", Palette.subtle, 13.sp)
            } else {
                T("JitterBug works fully on this phone. Add your own JitterBug server to sync with it. Connecting first downloads everything from the server and sends this phone's data up; the app waits until that is done.", Palette.muted, 14.sp)
            }
            SectionTitle(if (st.server == null) "Connect" else "Connect again")
            TextBox("Server address", addr, "jitterbug.home.lan:8080", keyboard = KeyboardType.Uri) { addr = it }
            TextBox("Username", user) { user = it }
            TextBox("Password", pw, password = true) { pw = it }
            error?.let { T(it, Palette.red, 13.sp) }
        }
        BottomAction(if (busy) "Connecting…" else "Connect", enabled = !busy && addr.isNotBlank() && user.isNotBlank() && pw.isNotEmpty()) {
            busy = true; error = null
            scope.launch {
                try {
                    // The first download follows on its own screen (FirstSyncScreen).
                    Sync.connect(ctx, addr, user, pw)
                    pw = ""
                } catch (e: Exception) {
                    error = e.message
                }
                busy = false
            }
        }
    }
}
