package com.aakash.jitterbug

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

/** The parts of the app's glue that need no phone: error parsing and server addresses. */
class CoreTest {
    @Test fun apiError_readsStatusAndDetail() {
        val e = ApiError.from("409 {\"error\":\"conflict\",\"detail\":\"changed elsewhere\"}")
        assertEquals(409, e.status)
        assertEquals("changed elsewhere", e.message)
        assertNotNull(e.body)
    }

    @Test fun apiError_fallsBackToErrorWhenNoDetail() {
        val e = ApiError.from("404 {\"error\":\"not found\"}")
        assertEquals(404, e.status)
        assertEquals("not found", e.message)
    }

    @Test fun apiError_keepsPlainTextAsTheMessage() {
        val e = ApiError.from("something broke")
        assertEquals(0, e.status)
        assertEquals("something broke", e.message)
        assertNull(e.body)
    }

    @Test fun normalise_addsHttpToABareHost() {
        assertEquals("http://jitterbug.lan:8080", Sync.normalise("jitterbug.lan:8080"))
    }

    @Test fun normalise_keepsHttpsAndTrimsSpaceAndSlash() {
        assertEquals("https://jb.example.com", Sync.normalise("  https://jb.example.com/ "))
    }

    private fun state(server: String?, cookie: String?) = Sync.State(server, "me", cookie, null, null)

    // A sync that started before the person tapped Disconnect must not bring the
    // server and sign-in back when it finishes.
    @Test fun sameConnection_isFalseOnceDisconnected() {
        assertEquals(false, Sync.sameConnection(state("http://a", "c1"), state(null, null)))
    }

    @Test fun sameConnection_isFalseAfterConnectingElsewhereOrSigningInAgain() {
        assertEquals(false, Sync.sameConnection(state("http://a", "c1"), state("http://b", "c1")))
        assertEquals(false, Sync.sameConnection(state("http://a", "c1"), state("http://a", "c2")))
    }

    @Test fun sameConnection_isTrueWhenNothingChanged() {
        assertEquals(true, Sync.sameConnection(state("http://a", "c1"), state("http://a", "c1")))
    }
}
