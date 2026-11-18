package com.aakash.jitterbug

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant
import java.time.LocalDate

/** The Day Planner's wording and timer arithmetic. */
class PlannerLogicTest {
    private fun obj(s: String) = JSONObject(s)

    @Test fun minutesReadLikeThePreview() {
        assertEquals("45m", minText(45))
        assertEquals("2h", minText(120))
        assertEquals("1h 35m", minText(95))
        assertEquals("–", minText(null))
    }

    @Test fun aTimersClockShowsHoursOnlyWhenNeeded() {
        assertEquals("0:05", clockText(5))
        assertEquals("12:34", clockText(754))
        assertEquals("1:02:03", clockText(3723))
    }

    @Test fun aTaskRowIsAllTimeLoggedAgainstTheWholeEstimate() {
        val t = obj("""{"kind":"task","logged_h":1.0833,"logged_day_h":0.25,"estimate_h":3}""")
        assertEquals("1h 5m / 3h", ratioText(t))
        assertEquals("1h 5m / –", ratioText(obj("""{"kind":"task","logged_h":1.0833}""")))
    }

    @Test fun anEventRowIsLoggedAgainstItsReservedMinutes() {
        assertEquals("0m / 45m", ratioText(obj("""{"kind":"event","logged_h":0,"planned_min":45}""")))
    }

    @Test fun availableIsWhatIsLeftOrHowFarOverOrNotSet() {
        assertEquals("Not set", availableText(obj("""{"planned_min":600,"available_min":null}""")))
        assertEquals("2h", availableText(obj("""{"planned_min":360,"available_min":480}""")))
        assertEquals("1h 30m over", availableText(obj("""{"planned_min":570,"available_min":480}""")))
        assertEquals("0m", availableText(obj("""{"planned_min":480,"available_min":480}""")))
        assertEquals("1h", availableText(obj("""{"planned_min":0,"available_min":60}""")))
    }

    @Test fun theCountNamesTasksAndEvents() {
        val task = obj("""{"kind":"task"}""")
        val event = obj("""{"kind":"event"}""")
        assertEquals("0 tasks", planCountText(emptyList()))
        assertEquals("1 task", planCountText(listOf(task)))
        assertEquals("2 tasks · 1 event", planCountText(listOf(task, event, task)))
        assertEquals("2 events", planCountText(listOf(event, event)))
    }

    @Test fun aRunningTimerCountsFromItsTimestamps() {
        val t = obj("""{"accumulated_s":60,"resumed_at":"2026-11-18T10:00:00Z","running":true}""")
        assertEquals(60 + 125, elapsedSeconds(t, Instant.parse("2026-11-18T10:02:05Z")))
        // After a restart it simply reads the clock again: nothing was counted in memory.
        assertEquals(60 + 3 * 3600, elapsedSeconds(t, Instant.parse("2026-11-18T13:00:00Z")))
    }

    @Test fun aPausedTimerHoldsStillAndAClockBehindNeverGoesNegative() {
        assertEquals(300, elapsedSeconds(obj("""{"accumulated_s":300,"resumed_at":null,"running":false}"""), Instant.parse("2026-11-19T00:00:00Z")))
        assertEquals(10, elapsedSeconds(obj("""{"accumulated_s":10,"resumed_at":"2026-11-18T10:00:00Z"}"""), Instant.parse("2026-11-18T09:00:00Z")))
    }

    @Test fun aTimerBelongsToItsEventLineOrItsTaskOnItsDay() {
        val event = obj("""{"id":7,"kind":"event","task_id":null}""")
        val task = obj("""{"id":8,"kind":"task","task_id":42}""")
        val onEvent = obj("""{"day":"2026-11-18","day_item_id":7,"task_id":null}""")
        val onTask = obj("""{"day":"2026-11-18","day_item_id":null,"task_id":42}""")
        assertTrue(timerIsFor(onEvent, event, "2026-11-18"))
        assertTrue(timerIsFor(onTask, task, "2026-11-18"))
        assertTrue(!timerIsFor(onTask, task, "2026-11-19"))
        assertTrue(!timerIsFor(onEvent, task, "2026-11-18"))
    }

    @Test fun theStripShowsTimersOffTheDaysRowsUnlessTwoRanAtOnce() {
        val items = listOf(obj("""{"id":8,"kind":"task","task_id":42}"""))
        val here = obj("""{"id":1,"day":"2026-11-18","day_item_id":null,"task_id":42}""")
        val away = obj("""{"id":2,"day":"2026-11-17","day_item_id":null,"task_id":42}""")
        assertEquals(listOf(2L), stripTimers(listOf(here, away), false, items, "2026-11-18").map { it.getLong("id") })
        assertEquals(listOf(1L, 2L), stripTimers(listOf(here, away), true, items, "2026-11-18").map { it.getLong("id") })
    }

    @Test fun typedTimeBecomesWholeMinutes() {
        assertEquals(90L, parseMinutes("90"))
        assertEquals(90L, parseMinutes("1:30"))
        assertEquals(90L, parseMinutes("1h 30m"))
        assertEquals(0L, parseMinutes("0"))
        assertEquals(1440L, parseMinutes("24h"))
        assertNull(parseMinutes("25h"))
        assertNull(parseMinutes(""))
        assertNull(parseMinutes("soon"))
    }

    @Test fun changingOneWeekdayKeepsTheOthers() {
        val cur = obj("""{"mon":480,"tue":300}""")
        val next = withWeekday(cur, "tue", 240)
        assertEquals(480, next.getInt("mon"))
        assertEquals(240, next.getInt("tue"))
        assertEquals(300, cur.getInt("tue"))
        assertTrue(!withWeekday(next, "mon", null).has("mon"))
        assertEquals(60, withWeekday(null, "sun", 60).getInt("sun"))
    }

    @Test fun movingALineKeepsTheRest() {
        assertEquals(listOf(2L, 3L, 1L), reordered(listOf(1, 2, 3), 0, 2))
        assertEquals(listOf(3L, 1L, 2L), reordered(listOf(1, 2, 3), 2, 0))
        assertEquals(listOf(1L, 2L), reordered(listOf(1, 2), 5, 0))
    }

    @Test fun anEarlierDayIsNamedByHowFarBack() {
        val today = LocalDate.of(2026, 11, 18)
        assertEquals("yesterday", daysAgoText("2026-11-17", today))
        assertEquals("3 days ago", daysAgoText("2026-11-15", today))
    }

    private val zone = java.time.ZoneId.of("Asia/Kolkata")
    private val day = LocalDate.of(2026, 11, 18)

    @Test fun aTimersExactStartAndEndAreKeptWhileTheStartTimeIsUntouched() {
        val s = Instant.parse("2026-11-18T04:30:20Z") // 10:00:20 in Kolkata
        val e = Instant.parse("2026-11-18T05:15:00Z")
        val (a, b) = sessionStamps(day, java.time.LocalTime.of(10, 0), s, e, zone)
        assertEquals(s.toString(), a)
        assertEquals(e.toString(), b)
    }

    @Test fun changingTheStartTimeDropsTheEnd() {
        val s = Instant.parse("2026-11-18T04:30:20Z")
        val e = Instant.parse("2026-11-18T05:15:00Z")
        val (a, b) = sessionStamps(day, java.time.LocalTime.of(9, 0), s, e, zone)
        assertEquals("2026-11-18T03:30:00Z", a)
        assertNull(b)
    }

    @Test fun noStartTimeMeansNoStamps() {
        assertEquals(null to null, sessionStamps(day, null, null, null, zone))
    }

    @Test fun theSevenWeekdaysStartOnSunday() {
        assertEquals(listOf("sun", "mon", "tue", "wed", "thu", "fri", "sat"), WEEKDAYS.map { it.first })
    }
}
