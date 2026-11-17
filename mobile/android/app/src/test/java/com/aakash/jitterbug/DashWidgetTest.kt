package com.aakash.jitterbug

import org.json.JSONObject
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** The phone draws only metric widgets; an app's page or a newer kind is shown in the web app. */
class DashWidgetTest {
    @Test fun metricWidgetsAreDrawnHere() {
        assertTrue(drawnOnPhone(JSONObject().put("source", "metric")))
        assertTrue(drawnOnPhone(JSONObject())) // from a server older than widget sources
        assertTrue(drawnOnPhone(JSONObject().put("source", "")))
    }

    @Test fun theCombinedChartIsShownInTheWebApp() {
        assertFalse(drawnOnPhone(JSONObject().put("source", "metric").put("viz", "combo")))
        // Options a newer web app saved change nothing on the phone.
        assertTrue(drawnOnPhone(JSONObject().put("viz", "bar").put("options", JSONObject().put("show_values", true).put("something_new", 1))))
    }

    @Test fun otherSourcesAreNot() {
        assertFalse(drawnOnPhone(JSONObject().put("source", "app_page")))
        assertFalse(drawnOnPhone(JSONObject().put("source", "view")))
        assertFalse(drawnOnPhone(JSONObject().put("source", "states")))
        assertFalse(drawnOnPhone(JSONObject().put("source", "something_newer")))
    }
}
