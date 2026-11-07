package com.aakash.jitterbug

import android.content.Context
import android.util.Log
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.time.Instant

/**
 * The sync server (Change 003). Connecting checks the address is a JitterBug
 * server, signs in and keeps the sign-in. The first sync after connecting is
 * a full download the app waits for (FirstSyncScreen); after that, syncs run
 * in the background and the screens never wait for them. The screens never
 * talk to this server; they only use the built-in core.
 */
object Sync {
    data class State(
        val server: String?, val username: String?, val cookie: String?, val checkedAt: String?, val error: String?,
        val syncedAt: String? = null, val sent: Int = 0, val received: Int = 0,
        /** The first full download after connecting has finished. */
        val firstDone: Boolean = false,
    )

    /** What a running sync is doing, for the first download's progress bar. percent is null when not known. */
    data class Progress(val step: String, val percent: Int?)

    private fun prefs(ctx: Context) = ctx.getSharedPreferences("sync", Context.MODE_PRIVATE)

    /** The latest state, for screens to show; set after every sync. */
    var live by mutableStateOf<State?>(null)
    var progress by mutableStateOf<Progress?>(null)
    /** When a write last happened here, so a sync follows a few seconds later. */
    @Volatile var pokedAt = 0L
    private val lock = Mutex()

    fun state(ctx: Context) = prefs(ctx).let {
        State(
            it.getString("server", null), it.getString("username", null), it.getString("cookie", null),
            it.getString("checked_at", null), it.getString("error", null),
            it.getString("synced_at", null), it.getInt("sent", 0), it.getInt("received", 0),
            it.getBoolean("first_done", false),
        )
    }

    private fun save(ctx: Context, s: State) {
        prefs(ctx).edit()
            .putString("server", s.server).putString("username", s.username).putString("cookie", s.cookie)
            .putString("checked_at", s.checkedAt).putString("error", s.error)
            .putString("synced_at", s.syncedAt).putInt("sent", s.sent).putInt("received", s.received)
            .putBoolean("first_done", s.firstDone).apply()
        live = s
    }

    fun disconnect(ctx: Context) {
        prefs(ctx).edit().clear().apply()
        live = state(ctx)
    }

    /**
     * One sync: the built-in core gives this phone's changes, they go to the
     * server, and the core applies what comes back (Change 003 item 4). A
     * failure just waits for the next one. The first sync after connecting is
     * a full copy both ways, so it gets longer timeouts and shows progress.
     */
    suspend fun syncNow(ctx: Context): State = lock.withLock {
        val s = state(ctx)
        val base = s.server ?: return s
        val first = !s.firstDone
        val now = Instant.now().toString()
        var sent = s.sent
        var received = s.received
        var done = s.firstDone
        // Errors name where they happened: this phone's data, the network, or the server.
        var where = "This phone's data"
        val error = try {
            if (first) progress = Progress("Getting this phone's data ready", null)
            val out = Api.post("/sync/outgoing")
            val req = out.getJSONObject("request")
            where = "Can't reach the server"
            val r = http("POST", "$base/api/sync", req.toString(), s.cookie, slow = first,
                onProgress = if (first) { p -> progress = p } else null)
            when (r.code) {
                200 -> {
                    where = "This phone's data"
                    if (first) progress = Progress("Saving on this phone", null)
                    val res = Api.post("/sync/incoming", jsonOf("response" to JSONObject(r.body), "upto" to out.getLong("upto")))
                    sent = req.getJSONArray("changes").length()
                    received = res.optInt("received")
                    done = true
                    if (received > 0) App.version++
                    null
                }
                401 -> "Signed out on the server; connect again"
                else -> "Server answered ${r.code}: ${r.body.take(160)}"
            }
        } catch (e: Exception) {
            Log.w("JB", "sync failed: $where", e)
            "$where: ${e.message}"
        } finally {
            progress = null
        }
        val current = state(ctx)
        if (!sameConnection(s, current)) return@withLock current // disconnected or reconnected while this ran
        s.copy(checkedAt = now, error = error, syncedAt = if (error == null) now else s.syncedAt, sent = sent, received = received, firstDone = done)
            .also { save(ctx, it) }
    }

    /**
     * Whether two states are the same connection (same server, same sign-in). A sync that
     * started on one connection must not save its result onto another: if the person
     * disconnected, or connected somewhere else, while it ran, the result is dropped.
     */
    fun sameConnection(a: State, b: State) = a.server == b.server && a.cookie == b.cookie

    /** "jitterbug.lan:8080" -> "http://jitterbug.lan:8080". */
    fun normalise(addr: String): String {
        val a = addr.trim().trimEnd('/')
        return if (a.startsWith("http://") || a.startsWith("https://")) a else "http://$a"
    }

    private class Reply(val code: Int, val body: String, val cookie: String?)

    /**
     * One request. slow allows minutes instead of seconds (a first sync over a
     * slow link). onProgress hears how much is sent, then how much is
     * received: the server gives the answer's size in X-Sync-Size, because
     * the answer arrives compressed and is unpacked as it is read.
     */
    private suspend fun http(
        method: String, url: String, body: String? = null, cookie: String? = null,
        slow: Boolean = false, onProgress: ((Progress) -> Unit)? = null,
    ): Reply = withContext(Dispatchers.IO) {
        val c = URL(url).openConnection() as HttpURLConnection
        c.requestMethod = method
        c.connectTimeout = 8000
        c.readTimeout = if (slow) 300_000 else 15000
        cookie?.let { c.setRequestProperty("Cookie", it) }
        if (body != null) {
            val bytes = body.toByteArray()
            c.doOutput = true
            c.setRequestProperty("Content-Type", "application/json")
            c.setFixedLengthStreamingMode(bytes.size)
            c.outputStream.use { o ->
                var at = 0
                while (at < bytes.size) {
                    val n = minOf(64 * 1024, bytes.size - at)
                    o.write(bytes, at, n)
                    at += n
                    onProgress?.invoke(Progress("Sending this phone's data", (at.toLong() * 100 / bytes.size).toInt()))
                }
            }
            onProgress?.invoke(Progress("Waiting for the server", null))
        }
        val code = c.responseCode
        val total = c.getHeaderField("X-Sync-Size")?.toLongOrNull()
        val text = (if (code < 400) c.inputStream else c.errorStream)?.use { input ->
            val buf = ByteArrayOutputStream()
            val chunk = ByteArray(64 * 1024)
            var got = 0L
            while (true) {
                val n = input.read(chunk)
                if (n < 0) break
                buf.write(chunk, 0, n)
                got += n
                onProgress?.invoke(Progress("Downloading", total?.let { (got * 100 / maxOf(it, 1)).toInt().coerceAtMost(100) }))
            }
            buf.toString("UTF-8")
        } ?: ""
        val set = c.headerFields["Set-Cookie"]?.firstOrNull()?.substringBefore(';')
        c.disconnect()
        Reply(code, text, set)
    }

    /**
     * Checks the address is a JitterBug server, then signs in. The returned
     * state still has the first download to do; FirstSyncScreen does it.
     */
    suspend fun connect(ctx: Context, addr: String, username: String, password: String): State = lock.withLock {
        val base = normalise(addr)
        val now = Instant.now().toString()
        val health = runCatching { http("GET", "$base/api/health") }.getOrElse { throw Exception("Can't reach $base: ${it.message}") }
        if (health.code != 200) throw Exception("$base answered ${health.code}; is it a JitterBug server?")
        val login = http("POST", "$base/api/auth/login", jsonOf("username" to username.trim().lowercase(), "password" to password).toString())
        if (login.code != 200) {
            val msg = runCatching { JSONObject(login.body).let { it.optString("detail").ifBlank { it.optString("error") } } }.getOrDefault(login.body)
            throw Exception("Sign-in failed: $msg")
        }
        // A new connection starts from nothing: both sides send everything once.
        Api.post("/sync/incoming", jsonOf("response" to jsonOf("token" to 0, "changes" to org.json.JSONArray()), "upto" to 0))
        State(base, username.trim().lowercase(), login.cookie, now, null, firstDone = false).also { save(ctx, it) }
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
        val current = state(ctx)
        if (!sameConnection(s, current)) return current // disconnected or reconnected while this ran
        return s.copy(checkedAt = Instant.now().toString(), error = error).also { save(ctx, it) }
    }
}
