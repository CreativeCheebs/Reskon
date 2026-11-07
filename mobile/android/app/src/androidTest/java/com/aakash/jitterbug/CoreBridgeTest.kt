package com.aakash.jitterbug

import androidx.test.platform.app.InstrumentationRegistry
import jbcore.Jbcore
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import java.io.File

/**
 * Goes through the generated gomobile binding to the real Go core, on a
 * device. Uses a throwaway folder, so it never touches the app's own data.
 * It works with no network: nothing here talks to a server.
 */
class CoreBridgeTest {
    private val dir: File = File(InstrumentationRegistry.getInstrumentation().targetContext.cacheDir, "bridge-test-${System.nanoTime()}")

    @After fun tearDown() {
        Jbcore.stop()
        dir.deleteRecursively()
    }

    @Test fun startsOnAnEmptyFolderAndAnswersWithoutANetwork() {
        dir.mkdirs()
        Jbcore.start(dir.path, "Asia/Kolkata", "me", "a-long-password", "")
        assertTrue(Jbcore.cookie().isNotEmpty())
        val boot = JSONObject(Jbcore.call("GET", "/api/bootstrap", ""))
        assertTrue(boot.getJSONArray("statuses").length() > 0)
    }

    @Test fun anUnknownRouteIsAnErrorWithAStatus() {
        dir.mkdirs()
        Jbcore.start(dir.path, "UTC", "me", "a-long-password", "")
        try {
            Jbcore.call("GET", "/api/nope", "")
            fail("expected an error")
        } catch (e: Exception) {
            assertEquals(404, ApiError.from(e.message ?: "").status)
        }
    }

    @Test fun dataSurvivesARestartWithTheKeptSignIn() {
        dir.mkdirs()
        Jbcore.start(dir.path, "UTC", "me", "a-long-password", "")
        Jbcore.call("POST", "/api/areas", "{\"name\":\"Personal\",\"key_prefix\":\"PR\"}")
        val kept = Jbcore.cookie()
        Jbcore.stop()
        Jbcore.start(dir.path, "UTC", "me", "a-long-password", kept)
        assertEquals(kept, Jbcore.cookie())
        assertTrue(Jbcore.call("GET", "/api/bootstrap", "").contains("Personal"))
    }
}
