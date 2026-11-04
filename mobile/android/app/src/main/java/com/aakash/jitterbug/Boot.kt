package com.aakash.jitterbug

import androidx.compose.ui.graphics.Color
import org.json.JSONObject

/** A row of a lookup table: area, status, priority, energy type, subtype. */
data class Ref(val id: Long, val name: String, val color: Color, val raw: JSONObject)

data class StatusRef(val id: Long, val name: String, val color: Color, val behaviour: String, val onBoard: Boolean, val raw: JSONObject)

data class ViewRef(val id: Long, val name: String, val layout: String, val timeline: Boolean, val color: Color, val raw: JSONObject) {
    /** Board, List or Timeline, as the More screen names them. */
    val kind get() = if (timeline) "Timeline" else if (layout == "table") "List" else "Board"
}

/** GET /api/bootstrap: every lookup the screens need, loaded once and after admin edits. */
class Boot(json: JSONObject) {
    val areas = json.objs("areas").map { ref(it) }
    val priorities = json.objs("priorities").map { ref(it) }
    val energyTypes = json.objs("energy_types").map { ref(it) }
    val subtypes = json.objs("subtypes").map { ref(it) }
    private val behaviourOf = json.objs("status_categories").associate { it.getLong("id") to it.getString("behaviour") }
    val statuses = json.objs("statuses").map {
        StatusRef(it.getLong("id"), it.getString("name"), color(it.str("color")), behaviourOf[it.getLong("category_id")] ?: "todo", it.optBoolean("on_board", true), it)
    }
    val views = json.objs("views").map {
        ViewRef(it.getLong("id"), it.getString("name"), it.optString("layout", "board"),
            it.optJSONObject("board_state")?.optBoolean("timeline") == true, color(it.str("color"), Palette.accent), it)
    }
    val settings: JSONObject = json.optJSONObject("settings") ?: JSONObject()

    fun area(id: Long?) = areas.firstOrNull { it.id == id }
    fun type(id: Long?) = energyTypes.firstOrNull { it.id == id }
    fun status(id: Long?) = statuses.firstOrNull { it.id == id }
    fun priority(id: Long?) = priorities.firstOrNull { it.id == id }
    fun subtype(id: Long?) = subtypes.firstOrNull { it.id == id }

    private fun ref(it: JSONObject) = Ref(it.getLong("id"), it.getString("name"), color(it.str("color")), it)
}

fun color(hex: String?, fallback: Color = Color(0xFF8C9BAB)): Color =
    try { if (hex == null) fallback else Color(android.graphics.Color.parseColor(hex)) } catch (e: Exception) { fallback }
