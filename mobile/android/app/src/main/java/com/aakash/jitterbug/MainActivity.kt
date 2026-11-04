package com.aakash.jitterbug

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Snackbar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay

/** Where the app is: a screen name plus its arguments, e.g. Route("task", mapOf("id" to "42")). */
data class Route(val name: String, val args: Map<String, String> = emptyMap()) {
    fun long(k: String) = args[k]?.toLongOrNull()
}

val TABS = listOf("today" to "Today", "board" to "Board", "sessions" to "Sessions", "inbox" to "Inbox", "more" to "More")
private val TAB_ICONS = listOf(Icons.today, Icons.board, Icons.sessions, Icons.inbox, Icons.more)

/** App-wide state: the back stack, the lookups, and a counter screens reload on. */
object App {
    val stack = mutableStateListOf(Route("today"))
    var boot by mutableStateOf<Boot?>(null)
    var inboxCount by mutableIntStateOf(0)
    /** Bumped after every write, so open screens load again. */
    var version by mutableIntStateOf(0)
    var toast by mutableStateOf<String?>(null)
    /** The tab a screen belongs to, for the nav bar. */
    var tab by mutableStateOf("today")

    val route get() = stack.last()

    fun go(r: Route) {
        if (TABS.any { it.first == r.name }) {
            tab = r.name
            stack.clear()
        }
        stack.add(r)
    }

    fun go(name: String, vararg args: Pair<String, Any>) = go(Route(name, args.associate { it.first to it.second.toString() }))

    fun back(): Boolean {
        if (stack.size <= 1) return false
        stack.removeAt(stack.lastIndex)
        return true
    }

    suspend fun reloadBoot() {
        boot = Boot(Api.obj("/bootstrap"))
    }

    suspend fun reloadInbox() {
        inboxCount = runCatching { Api.arr("/inbox").length() }.getOrDefault(inboxCount)
    }

    /** After a write: reload what every screen shows. */
    fun changed() {
        version++
        Sync.pokedAt = System.currentTimeMillis()
    }

    fun say(msg: String) {
        toast = msg
    }
}

/** Runs a write and reports a failure as a toast; returns null on failure. */
suspend fun <T> attempt(what: String, f: suspend () -> T): T? = try {
    f()
} catch (e: Exception) {
    Log.w("JB", "$what failed", e)
    App.say("$what: ${e.message}")
    null
}

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        handle(intent)
        setContent { JbTheme { Root(this) } }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handle(intent)
    }

    // jitterbug://task?id=3 opens a screen directly (used by the tests over adb).
    private fun handle(i: Intent?) {
        val uri: Uri = i?.data ?: return
        val name = uri.host ?: return
        val args = uri.queryParameterNames.associateWith { uri.getQueryParameter(it) ?: "" }
        App.go(Route(name, args))
    }
}

@Composable
private fun Root(activity: MainActivity) {
    var ready by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(Unit) {
        try {
            val ms = Core.start(activity.applicationContext)
            App.reloadBoot()
            // The server works out "today" in your time zone; tell it this phone's.
            val zone = java.util.TimeZone.getDefault().id
            if (App.boot?.settings?.optString("time_zone") != zone) runCatching { Api.put("/settings/time_zone", zone); App.reloadBoot() }
            App.reloadInbox()
            Log.i("JBPERF", "core ready in $ms ms")
            ready = true
        } catch (e: Exception) {
            error = e.message
        }
    }
    LaunchedEffect(App.version) { if (ready) App.reloadInbox() }
    // Sync with the server, if there is one: on opening, a few seconds after
    // a change here, and every five minutes. Never blocks a screen.
    LaunchedEffect(ready) {
        if (!ready) return@LaunchedEffect
        var last = 0L
        var lastPoke = 0L
        while (true) {
            val now = System.currentTimeMillis()
            val poked = Sync.pokedAt > lastPoke && now - Sync.pokedAt > 4000
            if (Sync.state(activity).server != null && (last == 0L || poked || now - last > 5 * 60_000)) {
                lastPoke = Sync.pokedAt
                last = now
                Sync.syncNow(activity.applicationContext)
                if (App.version > 0) App.reloadBoot()
            }
            delay(1000)
        }
    }
    BackHandler(enabled = App.stack.size > 1) { App.back() }

    Box(Modifier.fillMaxSize().background(Palette.bg).imePadding()) {
        val boot = App.boot
        when {
            error != null -> Empty("Could not open the data: $error")
            !ready || boot == null -> {}
            boot.areas.isEmpty() -> FirstRunScreen()
            else -> Screen(App.route)
        }
        App.toast?.let { msg ->
            LaunchedEffect(msg) { delay(3500); App.toast = null }
            Snackbar(
                Modifier.align(Alignment.BottomCenter).windowInsetsPadding(WindowInsets.navigationBars).padding(start = 16.dp, end = 16.dp, bottom = 96.dp),
                containerColor = Palette.raised, contentColor = Palette.fg,
            ) { T(msg, Palette.fg, 14.sp) }
        }
    }
}

@Composable
private fun Screen(r: Route) {
    val withNav = r.name in setOf("today", "board", "sessions", "inbox", "more", "states", "dashboards", "cycle")
    Column(Modifier.fillMaxSize()) {
        Box(Modifier.weight(1f)) {
            when (r.name) {
                "today" -> TodayScreen(r)
                "board" -> BoardScreen(r)
                "sessions" -> SessionsScreen()
                "inbox" -> InboxScreen()
                "more" -> MoreScreen()
                "log" -> LogScreen(r)
                "capture" -> CaptureScreen(r)
                "task" -> TaskScreen(r)
                "newtask" -> NewTaskScreen(r)
                "search" -> SearchScreen()
                "states" -> StatesScreen()
                "state" -> StateFormScreen(r)
                "dashboards" -> DashboardsScreen()
                "cycle" -> CycleTimeScreen(r)
                "settings" -> SettingsScreen()
                "lookup" -> LookupScreen(r)
                "llm" -> CaptureSettingsScreen()
                "sync" -> SyncScreen()
                "data" -> DataScreen()
                "taskdates" -> TaskDatesScreen()
                "snoozeset" -> SnoozeSettingsScreen()
                "complete" -> CompletenessScreen()
                "cardactions" -> CardActionsScreen()
                "fields" -> CustomFieldsScreen()
                "reflection" -> ReflectionScreen()
                "duplicates" -> DuplicateSearchScreen()
                else -> { App.back(); Empty("No screen called ${r.name}") }
            }
        }
        if (withNav) NavBar()
    }
}

@Composable
fun NavBar() {
    Column(Modifier.fillMaxWidth().background(Palette.panel)) {
        Line()
        Row(
            Modifier.fillMaxWidth().windowInsetsPadding(WindowInsets.navigationBars).height(80.dp).padding(top = 8.dp, bottom = 12.dp),
        ) {
            TABS.forEachIndexed { i, (key, name) ->
                val on = App.tab == key
                Column(
                    Modifier.weight(1f).clickable { App.go(Route(key)) },
                    horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Box(
                        Modifier.width(56.dp).height(32.dp).clip(RoundedCornerShape(16.dp)).background(if (on) Palette.selected else Palette.panel),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(TAB_ICONS[i], if (on) Palette.accent else Palette.muted)
                        if (key == "inbox" && App.inboxCount > 0) {
                            Box(
                                Modifier.align(Alignment.TopEnd).padding(end = 8.dp).size(18.dp).clip(RoundedCornerShape(9.dp)).background(Palette.accent),
                                contentAlignment = Alignment.Center,
                            ) { T(App.inboxCount.toString(), Palette.onAccent, 11.sp, FontWeight.Bold) }
                        }
                    }
                    T(name, if (on) Palette.fg else Palette.muted, 12.sp, if (on) FontWeight.SemiBold else FontWeight.Medium)
                }
            }
        }
    }
}
