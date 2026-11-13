package com.aakash.jitterbug

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import org.json.JSONObject

/**
 * "Create new task" from a task picker (the session form, quick capture): just a title and an area,
 * the rest is filled in later on the task. The task is made in the first to-do status, as any new
 * task is, and handed back as the server returns it so the caller can pick it.
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun NewTaskSheet(initialTitle: String, areaId: Long?, onCreated: (JSONObject) -> Unit, onDismiss: () -> Unit) {
    val boot = App.boot ?: return
    var title by remember { mutableStateOf(initialTitle) }
    var area by remember { mutableStateOf(areaId ?: boot.areas.firstOrNull()?.id) }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val ready = title.isNotBlank() && area != null && !busy

    // An error is shown in the sheet itself: the toast is drawn under a sheet's own window and would not be seen.
    var error by remember { mutableStateOf<String?>(null) }

    fun create() {
        // `busy` is read live (not the `ready` of this composition), so a second tap in the same frame does nothing.
        if (busy || title.isBlank() || area == null) return
        busy = true
        error = null
        scope.launch {
            try {
                val t = Api.post("/tasks", jsonOf("title" to title.trim(), "area_id" to area, "today" to today()))
                App.changed()
                onCreated(t)
            } catch (e: kotlinx.coroutines.CancellationException) {
                throw e
            } catch (e: Exception) {
                error = "Not created: ${e.message}"
            } finally {
                busy = false
            }
        }
    }

    // Closing while the request is going would drop its result (the task would exist but not be picked).
    ModalBottomSheet(onDismissRequest = { if (!busy) onDismiss() }, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), containerColor = Palette.raised) {
        Column(Modifier.padding(bottom = 16.dp)) {
            Column(
                Modifier.weight(1f, fill = false).verticalScroll(rememberScrollState()).padding(start = 20.dp, end = 20.dp, bottom = 8.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                T("New ${Terms.task}", Palette.fg, 18.sp, FontWeight.SemiBold)
                TextBox("Title", title, "What needs doing?", onDone = { create() }) { title = it }
                SectionTitle("Area")
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    boot.areas.forEach { a -> Pill(a.name, area == a.id) { area = a.id } }
                }
                error?.let { T(it, Palette.red, 13.sp) }
            }
            BottomAction(if (busy) "Creating…" else "Create ${Terms.task}", enabled = ready) { create() }
        }
    }
}
