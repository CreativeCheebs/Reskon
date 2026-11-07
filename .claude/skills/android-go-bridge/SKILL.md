---
name: android-go-bridge
description: Change Android Compose UI or the Go core exposed through gomobile, while preserving the generated AAR boundary.
---
# Android and Go bridge workflow

1. Read `AGENTS.md`, `SPEC.md` section 13, `docs/decisions.md`, `mobile/build.ps1`, Android Gradle files, and the Go package being exposed.
2. Keep business rules in the shared Go core; Kotlin Compose owns Android presentation, navigation, lifecycle, and network transport as currently designed.
3. Check that exported Go APIs are compatible with gomobile bindings. Avoid unsupported Go types, callbacks, or API surface expansion without an integration test.
4. Rebuild the AAR with `mobile/build.ps1` and verify the 16 KB page-size linker setting remains intact.
5. Run Android lint, unit/UI tests, and assemble the debug APK. Use Compose semantics tests for screen behavior and Maestro for end-to-end flows where configured.
6. Check offline operation and sync failure behavior. Never require server availability for local app startup or local data access.
