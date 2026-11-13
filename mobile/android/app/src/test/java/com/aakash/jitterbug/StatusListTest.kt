package com.aakash.jitterbug

import androidx.compose.ui.graphics.Color
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test

/** The List layout leaves out tasks in a hidden status (Backlog...) until its button is tapped. */
class StatusListTest {
    private fun status(id: Long, onBoard: Boolean = true) = StatusRef(id, "S$id", Color.Gray, "todo", onBoard, JSONObject())
    private fun task(id: Int, status: Long) = JSONObject().put("id", id).put("status_id", status)

    // Backlog (1) is hidden, like the built-in one; To do (2), In progress (3) and Done (4) are on the board.
    private val statuses = listOf(status(1, onBoard = false), status(2), status(3), status(4))

    @Test fun tasksInAHiddenStatusStayOutOfAListUntilItsButtonIsTapped() {
        val tasks = listOf(task(10, 1), task(11, 2), task(12, 4), task(13, 1))
        assertEquals(listOf(11, 12), withoutHiddenStatuses(tasks, statuses, emptySet()).map { it.getInt("id") })
        assertEquals(listOf(10, 11, 12, 13), withoutHiddenStatuses(tasks, statuses, setOf(1L)).map { it.getInt("id") })
    }

    @Test fun withNothingHiddenEveryTaskStays() {
        val tasks = listOf(task(1, 2), task(2, 3))
        assertEquals(2, withoutHiddenStatuses(tasks, listOf(status(2), status(3)), emptySet()).size)
    }
}
