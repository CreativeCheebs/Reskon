package com.aakash.jitterbug

import org.json.JSONArray
import org.json.JSONObject

/**
 * The Day Planner's calls to the Go core (the same /api routes as the server, answered on the phone,
 * so all of it works offline and syncs later). The screens decide when; this says what is sent.
 */
object Planner {
    suspend fun addTask(day: String, taskId: Long) = Api.post("/day/$day/items", jsonOf("task_id" to taskId))

    suspend fun addEvent(day: String, title: String, minutes: Long, areaId: Long?) =
        Api.post("/day/$day/items", jsonOf("title" to title.trim(), "planned_min" to minutes, "area_id" to areaId))

    suspend fun editEvent(id: Long, title: String, minutes: Long, areaId: Long?) =
        Api.patch("/day-items/$id", jsonOf("title" to title.trim(), "planned_min" to minutes, "area_id" to areaId))

    suspend fun reschedule(id: Long, day: String) = Api.patch("/day-items/$id", jsonOf("day" to day))

    suspend fun remove(id: Long) = Api.del("/day-items/$id")

    suspend fun order(day: String, ids: List<Long>) = Api.put("/day/$day/order", jsonOf("ids" to JSONArray(ids)))

    suspend fun setNote(day: String, note: String) = Api.patch("/day/$day", jsonOf("note" to note.trim().ifBlank { null }))

    /** This day's own available minutes, or null to use its weekday's again. */
    suspend fun setAvailable(day: String, minutes: Long?) = Api.patch("/day/$day", jsonOf("available_min" to minutes))

    suspend fun moveTask(taskId: Long, statusId: Long) = Api.post("/tasks/$taskId/move", jsonOf("status_id" to statusId, "today" to today()))

    suspend fun candidates(day: String): List<JSONObject> = Api.arr("/day/$day/bring-forward").objs()

    suspend fun bringForward(day: String, taskIds: List<Long>) = Api.post("/day/$day/bring-forward", jsonOf("task_ids" to JSONArray(taskIds)))

    /** What starting a timer did: it started, or another one is already running (with the running ones). */
    sealed class Start {
        data class Started(val timer: JSONObject) : Start()
        data class Busy(val running: List<JSONObject>) : Start()
    }

    suspend fun startTimer(day: String, item: JSONObject): Start {
        val body = if (item.optString("kind") == "event") jsonOf("day" to day, "day_item_id" to item.getLong("id"))
        else jsonOf("day" to day, "task_id" to item.getLong("task_id"))
        return try {
            Start.Started(Api.post("/timers", body))
        } catch (e: ApiError) {
            if (e.status != 409) throw e
            Start.Busy(runningFrom(e))
        }
    }

    /** The running timers a 409 names (`current`); if it names none, ask the core, so there is always something to stop. */
    suspend fun runningFrom(e: ApiError): List<JSONObject> {
        val named = e.body?.optJSONObject("current")?.objs("timers")?.filter { it.optBoolean("running") }.orEmpty()
        return named.ifEmpty { runCatching { Api.obj("/timers").objs("timers").filter { it.optBoolean("running") } }.getOrDefault(emptyList()) }
    }

    suspend fun pause(id: Long) = Api.post("/timers/$id/pause")
    suspend fun resume(id: Long) = Api.post("/timers/$id/resume")

    /**
     * Stops a timer. The core keeps it as a stopped timer with its draft, so the time stays pending
     * (shown as "Stopped, review") even if the app closes; the Log screen reads the draft from it.
     */
    suspend fun stop(id: Long) {
        Api.post("/timers/$id/stop")
        App.changed()
        review(id)
    }

    fun review(id: Long) = App.go("log", "timer" to id)

    suspend fun discard(id: Long) = Api.del("/timers/$id")
}
