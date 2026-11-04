# gomobile: Go calls these classes through JNI, so R8 must not rename or drop them.
-keep class go.** { *; }
-keep class jbcore.** { *; }
