package com.aakash.jitterbug

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

/** The words and numbers on the snooze sheet and the New task Snooze until box. */
class SnoozeStateTest {
    private val today = LocalDate.of(2026, 11, 18)

    @Test fun withNothingSavedTheListIsTheDefaultOne() {
        val c = snoozeChoices(JSONObject(), today)
        assertEquals(listOf("Tomorrow", "2 days", "3 days", "1 week", "2 weeks", "1 month"), c.map { it.label })
        assertEquals(LocalDate.of(2026, 11, 19), c.first().date)
        assertEquals(LocalDate.of(2026, 12, 18), c.last().date)
    }

    @Test fun theListFollowsTheSettingAndIsCutToTheLongestSnooze() {
        val s = JSONObject().put("snooze", JSONObject().put("max_days", 10).put("intervals", JSONArray(listOf(3, 1, 7, 14, 60))))
        assertEquals(listOf(3, 1, 7), snoozeChoices(s, today).map { it.days })
        assertEquals(10, snoozeMaxDays(s))
        assertEquals(60, snoozeMaxDays(JSONObject()))
    }

    @Test fun intervalsAreNamedLikeTheWeb() {
        assertEquals(listOf("Tomorrow", "10 days", "1 week", "2 weeks", "1 month", "3 months"), listOf(1, 10, 7, 14, 30, 90).map(::snoozeIntervalLabel))
    }

    @Test fun theChosenDayNamesTheChoiceOnlyWhenItIsOneOfTheList() {
        val c = snoozeChoices(JSONObject(), today)
        assertEquals("Wed 25 Nov · 1 week", snoozeWhenLabel(LocalDate.of(2026, 11, 25), c))
        assertEquals("Thu 26 Nov", snoozeWhenLabel(LocalDate.of(2026, 11, 26), c))
    }

    @Test fun aPickedDateBecomesWholeDays() {
        assertEquals(7, snoozeDaysUntil(today, LocalDate.of(2026, 11, 25)))
        assertEquals(30, snoozeDaysUntil(today, LocalDate.of(2026, 12, 18)))
    }

    @Test fun theHintLeavesOutAlsoBackWhenNothingComesBack() {
        assertEquals("5h · 11 points", alsoBackText(SnoozeForecast(5.0, 11.0)))
        assertEquals("1.5h · 4.3 points", alsoBackText(SnoozeForecast(1.5, 4.25)))
        assertNull(alsoBackText(SnoozeForecast(0.0, 0.0)))
        assertNull(alsoBackText(null))
    }

    @Test fun theForecastRowsAreReadByDate() {
        val rows = JSONArray("""[{"date":"2026-11-19","hours":3,"points":7},{"date":"2026-11-20","hours":0,"points":0}]""")
        val f = parseSnoozeForecast(rows)
        assertEquals(SnoozeForecast(3.0, 7.0), f["2026-11-19"])
        assertTrue(f["2026-11-20"]!!.none)
    }

    @Test fun aDueDateBeforeTheSnoozeDateGetsTheWarning() {
        val snooze = LocalDate.of(2026, 11, 25)
        assertTrue(dueBeforeSnooze(LocalDate.of(2026, 11, 24), snooze))
        assertFalse(dueBeforeSnooze(LocalDate.of(2026, 11, 25), snooze))
        assertFalse(dueBeforeSnooze(null, snooze))
        assertFalse(dueBeforeSnooze(LocalDate.of(2026, 11, 24), null))
    }

    @Test fun aScreenReaderHearsTheNumbersOrTheirAbsence() {
        val c = SnoozeChoice(1, "Tomorrow", LocalDate.of(2026, 11, 19))
        assertEquals("Tomorrow, Thu 19 Nov", snoozeRowDescription(c, null))
        assertEquals("Tomorrow, Thu 19 Nov, nothing coming back", snoozeRowDescription(c, SnoozeForecast(0.0, 0.0)))
        assertEquals("Tomorrow, Thu 19 Nov, 3h and 7 points coming back", snoozeRowDescription(c, SnoozeForecast(3.0, 7.0)))
    }
}
