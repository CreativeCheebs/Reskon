package com.aakash.jitterbug

import androidx.compose.ui.graphics.Color
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test

/** The board as a list: which statuses become sections, and where each one starts. */
class StatusListTest {
    private fun status(id: Long, onBoard: Boolean = true) = StatusRef(id, "S$id", Color.Gray, "todo", onBoard, JSONObject())
    private fun task(id: Int, status: Long) = JSONObject().put("id", id).put("status_id", status)

    // Backlog (1) is hidden, like the built-in one; To do (2), In progress (3) and Done (4) are on the board.
    private val statuses = listOf(status(1, onBoard = false), status(2), status(3), status(4))

    @Test fun hiddenStatusesAreNotSectionsUntilOpened() {
        assertEquals(listOf(2L, 3L, 4L), visibleStatuses(statuses, emptySet()).map { it.id })
        assertEquals(listOf(1L, 2L, 3L, 4L), visibleStatuses(statuses, setOf(1L)).map { it.id })
    }

    @Test fun tasksInAHiddenStatusStayOutOfAListUntilItsButtonIsTapped() {
        val tasks = listOf(task(10, 1), task(11, 2), task(12, 4), task(13, 1))
        assertEquals(listOf(11, 12), withoutHiddenStatuses(tasks, statuses, emptySet()).map { it.getInt("id") })
        assertEquals(listOf(10, 11, 12, 13), withoutHiddenStatuses(tasks, statuses, setOf(1L)).map { it.getInt("id") })
    }

    @Test fun withNothingHiddenEveryTaskStays() {
        val tasks = listOf(task(1, 2), task(2, 3))
        assertEquals(2, withoutHiddenStatuses(tasks, listOf(status(2), status(3)), emptySet()).size)
    }

    @Test fun eachSectionStartsAfterTheLastOne() {
        // To do has 2 tasks (header + 2 rows), In progress has none (header + "no tasks" row), Done has 1.
        val starts = sectionStarts(listOf(2L, 3L, 4L), mapOf(2L to 2, 4L to 1))
        assertEquals(mapOf(2L to 0, 3L to 3, 4L to 5), starts)
    }
}
