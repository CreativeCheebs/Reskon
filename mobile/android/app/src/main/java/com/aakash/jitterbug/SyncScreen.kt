package com.aakash.jitterbug

import android.content.Context
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
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.time.Instant
import java.time.ZoneId

/**
 * The sync server (Change 003). For now this connects: it checks the address
 * is a JitterBug server, signs in, and keeps the sign-in. Moving data waits
 * for the sync endpoint (POST /api/sync), which the server doesn't have yet.
 * The screens never talk to this server; they only use the built-in core.
 */
object Sync {
    data class State(val server: String?, val username: String?, val cookie: String?, val checkedAt: String?, val error: String?)

    private fun prefs(ctx: Context) = ctx.getSharedPreferences("sync", Context.MODE_PRIVATE)

    fun state(ctx: Context) = prefs(ctx).let {
        State(it.getString("server", null), it.getString("username", null), it.getString("cookie", null), it.getString("checked_at", null), it.getString("error", null))
    }

    private fun save(ctx: Context, s: State) = prefs(ctx).edit()
        .putString("server", s.server).putString("username", s.username).putString("cookie", s.cookie)
        .putString("checked_at", s.checkedAt).putString("error", s.error).apply()

    fun disconnect(ctx: Context) = prefs(ctx).edit().clear().apply()

    /** "jitterbug.lan:8080" -> "http://jitterbug.lan:8080". */
    fun normalise(addr: String): String {
        val a = addr.trim().trimEnd('/')
        return if (a.startsWith("http://") || a.startsWith("https://")) a else "http://$a"
    }

    private class Reply(val code: Int, val body: String, val cookie: String?)

    private suspend fun http(method: String, url: String, body: String? = null, cookie: String? = null): Reply = withContext(Dispatchers.IO) {
        val c = URL(url).openConnection() as HttpURLConnection
        c.requestMethod = method
        c.connectTimeout = 8000
        c.readTimeout = 15000
        cookie?.let { c.setRequestProperty("Cookie", it) }
        if (body != null) {
            c.doOutput = true
            c.setRequestProperty("Content-Type", "application/json")
            c.outputStream.use { it.write(body.toByteArray()) }
        }
        val code = c.responseCode
        val text = (if (code < 400) c.inputStream else c.errorStream)?.bufferedReader()?.use { it.readText() } ?: ""
        val set = c.headerFields["Set-Cookie"]?.firstOrNull()?.substringBefore(';')
        c.disconnect()
        Reply(code, text, set)
    }

    /** Checks the address is a JitterBug server, then signs in. Returns the new state. */
    suspend fun connect(ctx: Context, addr: String, username: String, password: String): State {
        val base = normalise(addr)
        val now = Instant.now().toString()
        val health = runCatching { http("GET", "$base/api/health") }.getOrElse { throw Exception("Can't reach $base: ${it.message}") }
        if (health.code != 200) throw Exception("$base answered ${health.code}; is it a JitterBug server?")
        val login = http("POST", "$base/api/auth/login", jsonOf("username" to username.trim().lowercase(), "password" to password).toString())
        if (login.code != 200) {
            val msg = runCatching { JSONObject(login.body).let { it.optString("detail").ifBlank { it.optString("error") } } }.getOrDefault(login.body)
            throw Exception("Sign-in failed: $msg")
        }
        return State(base, username.trim().lowercase(), login.cookie, now, null).also { save(ctx, it) }
    }

    /** Checks the kept sign-in still works, and records when and what went wrong. */
    suspend fun check(ctx: Context): State {
        val s = state(ctx)
        val base = s.server ?: return s
        val error = try {
            val r = http("GET", "$base/api/auth/status", cookie = s.cookie)
            val user = if (r.code == 200) JSONObject(r.body).optJSONObject("user") else null
            when {
                r.code != 200 -> "Server answered ${r.code}"
                user == null -> "Signed out on the server; connect again"
                else -> null
            }
        } catch (e: Exception) {
            "Can't reach the server: ${e.message}"
        }
        return s.copy(checkedAt = Instant.now().toString(), error = error).also { save(ctx, it) }
    }
}

@Composable
fun SyncScreen() {
    val ctx = LocalContext.current
    var st by remember { mutableStateOf(Sync.state(ctx)) }
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
                        T(if (st.error == null) "Connected" else "Connection problem", Palette.fg, 15.sp, FontWeight.SemiBold)
                    }
                    Gap(6)
                    T("${st.username} on ${st.server}", Palette.muted, 14.sp)
                    st.checkedAt?.let { T("Last checked ${ago(it)}", Palette.subtle, 13.sp) }
                    st.error?.let { T(it, Palette.yellow, 13.sp) }
                    Gap(4)
                    Row {
                        TextLink("Check now") { scope.launch { busy = true; st = Sync.check(ctx); busy = false } }
                        TextLink("Disconnect", Palette.red) { Sync.disconnect(ctx); st = Sync.state(ctx); App.say("Disconnected. Everything stays on this phone.") }
                    }
                }
                T("Your data stays on this phone and keeps working offline. Sending and receiving changes arrives with sync (Change 003); until then this keeps the connection ready.", Palette.subtle, 13.sp)
            } else {
                T("JitterBug works fully on this phone. Add your own JitterBug server to sync with it later. Nothing on the phone changes when you connect.", Palette.muted, 14.sp)
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
                    st = Sync.connect(ctx, addr, user, pw)
                    pw = ""
                    App.say("Connected to ${st.server}")
                } catch (e: Exception) {
                    error = e.message
                }
                busy = false
            }
        }
    }
}
