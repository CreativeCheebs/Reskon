package com.aakash.jitterbug

import android.content.Context
import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.time.LocalDate
import java.util.TimeZone
import java.util.UUID

/**
 * Reskon's Go core, inside the app (jbcore.aar from mobile/jbcore). Every
 * screen reads and writes through it, so the app works with no network, and
 * every number is worked out by the same Go code as the server.
 */
object Core {
    private lateinit var prefs: android.content.SharedPreferences
    lateinit var dataDir: File
        private set

    /** Opens the data and signs in to the phone's own account. Returns ms taken. */
    suspend fun start(ctx: Context): Long = withContext(Dispatchers.IO) {
        val t0 = System.currentTimeMillis()
        prefs = ctx.getSharedPreferences("core", Context.MODE_PRIVATE)
        dataDir = File(ctx.filesDir, "jitterbug").apply { mkdirs() }
        // The phone's account: one person, a password nobody types.
        val password = prefs.getString("password", null) ?: UUID.randomUUID().toString().also {
            prefs.edit().putString("password", it).apply()
        }
        jbcore.Jbcore.start(dataDir.path, TimeZone.getDefault().id, "me", password, prefs.getString("cookie", "") ?: "")
        val cookie = jbcore.Jbcore.cookie()
        if (cookie != prefs.getString("cookie", "")) prefs.edit().putString("cookie", cookie).apply()
        System.currentTimeMillis() - t0
    }

    suspend fun call(method: String, path: String, body: String? = null): String = withContext(Dispatchers.IO) {
        val t0 = System.nanoTime()
        try {
            jbcore.Jbcore.call(method, "/api$path", body ?: "")
        } catch (e: Exception) {
            throw ApiError.from(e.message ?: "")
        } finally {
            Log.i("JBCALL", "$method ${path.substringBefore('?')} ${(System.nanoTime() - t0) / 100_000 / 10.0} ms")
        }
    }

    /** A clean copy of the database (VACUUM INTO), in a fresh folder under the cache. */
    suspend fun export(ctx: Context): File = withContext(Dispatchers.IO) {
        val dir = File(ctx.cacheDir, "export-${System.currentTimeMillis()}")
        File(jbcore.Jbcore.export(dir.path))
    }
}

/** An error from the API: the status and the server's message. */
class ApiError(val status: Int, msg: String, val body: JSONObject?) : Exception(msg) {
    companion object {
        fun from(raw: String): ApiError {
            val code = raw.substringBefore(' ').toIntOrNull() ?: 0
            val json = runCatching { JSONObject(raw.substringAfter(' ')) }.getOrNull()
            val msg = json?.let { it.optString("detail").ifBlank { it.optString("error") } } ?: raw
            return ApiError(code, msg, json)
        }
    }
}

object Api {
    suspend fun get(path: String) = Core.call("GET", path)
    suspend fun obj(path: String) = JSONObject(get(path))
    suspend fun arr(path: String) = JSONArray(get(path))
    suspend fun post(path: String, body: JSONObject = JSONObject()) = JSONObject(Core.call("POST", path, body.toString()))
    suspend fun patch(path: String, body: JSONObject) = JSONObject(Core.call("PATCH", path, body.toString()))
    suspend fun put(path: String, body: Any) = Core.call("PUT", path, JSONObject.wrap(body).let { if (it is String) JSONObject.quote(it) else it.toString() })
    suspend fun del(path: String) = Core.call("DELETE", path)
}

fun today(): String = LocalDate.now().toString()

/** Snoozes a task for [days] days, or wakes it with 0; with [untilUnblocked], while an open task blocks it. */
suspend fun snoozeTask(id: Long, days: Int, untilUnblocked: Boolean = false): JSONObject =
    Api.post("/tasks/$id/snooze", jsonOf("days" to days, "until_unblocked" to untilUnblocked, "today" to today()))

// Small JSON helpers; the API's shapes are documented in web/src/types.ts.
fun JSONObject.str(k: String): String? = if (isNull(k)) null else optString(k)
fun JSONObject.num(k: String): Double? = if (isNull(k) || !has(k)) null else optDouble(k)
fun JSONObject.id(k: String): Long? = if (isNull(k) || !has(k)) null else optLong(k)
fun JSONArray.objs(): List<JSONObject> = (0 until length()).map { getJSONObject(it) }
fun JSONObject.objs(k: String): List<JSONObject> = optJSONArray(k)?.objs() ?: emptyList()
fun JSONObject.strs(k: String): List<String> = optJSONArray(k)?.let { a -> (0 until a.length()).map { a.getString(it) } } ?: emptyList()
fun jsonOf(vararg pairs: Pair<String, Any?>) = JSONObject().apply { pairs.forEach { (k, v) -> put(k, v ?: JSONObject.NULL) } }
