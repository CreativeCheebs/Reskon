package com.aakash.jitterbug

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch

/**
 * No areas yet. On a phone with no server, first ask: connect to a server
 * now (its data is downloaded before anything else), or use the phone on its
 * own and name the first area, as the web app does. Creating the area also
 * creates its board view. A connected server with no areas yet goes
 * straight to naming one.
 */
@Composable
fun FirstRunScreen() {
    val ctx = LocalContext.current
    val connected = (Sync.live ?: Sync.state(ctx)).server != null
    var choice by remember { mutableStateOf(if (connected) "offline" else "") }
    when (choice) {
        "server" -> FirstConnect(onBack = { choice = "" })
        "offline" -> FirstArea(connected, onBack = if (connected) null else ({ choice = "" }))
        else -> Column(Modifier.fillMaxSize()) {
            Column(
                Modifier.weight(1f).windowInsetsPadding(WindowInsets.statusBars).padding(horizontal = 24.dp, vertical = 48.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                T("Reskon", Palette.fg, 32.sp, FontWeight.SemiBold)
                T("Do you have a Reskon server?", Palette.fg, 17.sp, FontWeight.SemiBold)
                T("Connect to it now and everything on it is downloaded to this phone first. Or use Reskon on this phone only: it works fully offline, and you can connect a server later in Settings.", Palette.muted, 15.sp)
            }
            BottomAction("Connect to a server", secondary = "Offline", onSecondary = { choice = "offline" }) { choice = "server" }
        }
    }
}

@Composable
private fun FirstArea(connected: Boolean, onBack: (() -> Unit)?) {
    var name by remember { mutableStateOf("Personal") }
    var prefix by remember { mutableStateOf("PR") }
    val scope = rememberCoroutineScope()
    Column(Modifier.fillMaxSize()) {
        if (onBack != null) TopBar("", onBack = onBack)
        Column(
            Modifier.weight(1f).let { if (onBack == null) it.windowInsetsPadding(WindowInsets.statusBars) else it }
                .padding(horizontal = 24.dp, vertical = if (onBack == null) 48.dp else 8.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            T("Reskon", Palette.fg, 32.sp, FontWeight.SemiBold)
            T(
                if (connected) "Your server has no areas yet." else "Everything stays on this phone. You can add a sync server later in Settings.",
                Palette.muted, 15.sp,
            )
            Gap(8)
            T("Name your first area. ${Terms.capTasks} belong to an area; you can add more later.", Palette.fg, 15.sp)
            TextBox("Area", name) { name = it }
            TextBox("${Terms.capTask} key prefix", prefix, "e.g. PR") { prefix = it.uppercase().filter(Char::isLetterOrDigit).take(6) }
        }
        BottomAction("Start", enabled = name.isNotBlank() && prefix.isNotBlank()) {
            scope.launch {
                attempt("Not created") {
                    Api.post("/areas", jsonOf("name" to name.trim(), "key_prefix" to prefix))
                    App.reloadBoot()
                    App.home()
                }
            }
        }
    }
}

/** Connecting on first start. Once signed in, FirstSyncScreen takes over. */
@Composable
private fun FirstConnect(onBack: () -> Unit) {
    val ctx = LocalContext.current
    var addr by remember { mutableStateOf("") }
    var user by remember { mutableStateOf("") }
    var pw by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    Column(Modifier.fillMaxSize()) {
        TopBar("Connect to a server", onBack = onBack)
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(start = 16.dp, end = 16.dp, bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            T("Everything on the server is downloaded to this phone before you start. After that, the phone works offline and changes go both ways whenever the server can be reached.", Palette.muted, 14.sp)
            TextBox("Server address", addr, "jitterbug.home.lan:8080", keyboard = KeyboardType.Uri) { addr = it }
            TextBox("Username", user) { user = it }
            TextBox("Password", pw, password = true) { pw = it }
            error?.let { T(it, Palette.red, 13.sp) }
        }
        BottomAction(if (busy) "Connecting…" else "Connect", enabled = !busy && addr.isNotBlank() && user.isNotBlank() && pw.isNotEmpty()) {
            busy = true; error = null
            scope.launch {
                try {
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

/**
 * The first sync after connecting: everything on the server is downloaded,
 * and this phone's data sent up, before anything else can be used. It shows
 * how far it got; if it fails, it can be tried again or the server dropped
 * (the phone's data stays). Killing the app midway keeps nothing of the
 * download, since it is saved in one go, and the next start begins again.
 */
@Composable
fun FirstSyncScreen() {
    val ctx = LocalContext.current
    val st = Sync.live ?: Sync.state(ctx)
    var attemptNo by remember { mutableIntStateOf(0) }
    var failed by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(attemptNo) {
        failed = null
        val done = Sync.syncNow(ctx.applicationContext)
        if (done.firstDone) {
            App.reloadBoot()
            App.version++
            App.say("Downloaded from ${done.server}")
        } else {
            failed = done.error ?: "Not finished"
        }
    }
    val p = Sync.progress
    Column(Modifier.fillMaxSize()) {
        Column(
            Modifier.weight(1f).windowInsetsPadding(WindowInsets.statusBars).padding(horizontal = 24.dp, vertical = 48.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            T("Getting your data", Palette.fg, 26.sp, FontWeight.SemiBold)
            T("${st.username} on ${st.server}", Palette.muted, 14.sp)
            Gap(8)
            if (failed == null) {
                T(p?.step ?: "Starting", Palette.fg, 15.sp)
                val pct = p?.percent
                if (pct != null) {
                    LinearProgressIndicator(progress = { pct / 100f }, Modifier.fillMaxWidth(), color = Palette.accent, trackColor = Palette.chip)
                    T("$pct%", Palette.muted, 14.sp)
                } else {
                    LinearProgressIndicator(Modifier.fillMaxWidth(), color = Palette.accent, trackColor = Palette.chip)
                }
                T("This happens once. Please keep the app open.", Palette.subtle, 13.sp)
            } else {
                T("The download didn't finish.", Palette.fg, 15.sp)
                T(failed!!, Palette.yellow, 13.sp)
                T("Nothing was lost. Try again, or disconnect to use this phone on its own.", Palette.subtle, 13.sp)
            }
        }
        if (failed != null) {
            BottomAction("Try again", secondary = "Disconnect", onSecondary = {
                Sync.disconnect(ctx)
                App.say("Disconnected. Everything stays on this phone.")
            }) { attemptNo++ }
        }
    }
}
