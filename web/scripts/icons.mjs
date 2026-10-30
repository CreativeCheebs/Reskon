// Builds the icon picker's data from the installed packages (all MIT):
//   @iconify-json/fluent  Microsoft Fluent UI System Icons, 24px regular + filled
//   @iconify-json/prime   PrimeIcons
//   unicode-emoji-json    every emoji with its name and group
// Output goes to src/icons/generated/ (not committed). Each file becomes a
// hashed asset that the picker fetches the first time it is opened.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const out = new URL("../src/icons/generated/", import.meta.url);
mkdirSync(out, { recursive: true });

function iconify(pkg, suffix) {
  const set = JSON.parse(readFileSync(require.resolve(`${pkg}/icons.json`), "utf8"));
  const size = set.width ?? set.height ?? 24;
  const icons = [];
  for (const [name, icon] of Object.entries(set.icons)) {
    if (suffix && !name.endsWith(suffix)) continue;
    if ((icon.width ?? size) !== 24 || (icon.height ?? size) !== 24) continue;
    icons.push([suffix ? name.slice(0, -suffix.length) : name, icon.body]);
  }
  return { size: 24, icons };
}

const write = (file, data) => writeFileSync(new URL(file, out), JSON.stringify(data));

write("fluent-regular.json", iconify("@iconify-json/fluent", "-24-regular"));
write("fluent-filled.json", iconify("@iconify-json/fluent", "-24-filled"));
write("prime.json", iconify("@iconify-json/prime"));

const emoji = JSON.parse(readFileSync(require.resolve("unicode-emoji-json/data-by-emoji.json"), "utf8"));
write(
  "emoji.json",
  Object.entries(emoji).map(([char, e]) => [char, e.name, e.group]),
);
