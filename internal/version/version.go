// Package version holds the version number of Reskon (the server and the web
// app that it serves). The number is written once, in the VERSION file at the
// top of the repository; the constant here must match it (a test checks), and
// the phone app and the web app's own package file are checked the same way.
package version

// Version is the Reskon version, major.minor.patch.
const Version = "0.2.0"
