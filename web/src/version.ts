import pkg from "../package.json";

// The version of this web app. It is written once, in the VERSION file at the
// top of the repository, and a Go test keeps package.json equal to it. The app
// is served by the Reskon server it was built with, so this is also the
// server's version.

export const APP_VERSION: string = pkg.version;
export const APP_NAME_VERSION = `Reskon ${pkg.version}`;
