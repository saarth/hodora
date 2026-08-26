// @capacitor/assets always writes the adaptive-icon XML with a 16.7% inset
// on *both* the background and foreground layers. That's correct for the
// foreground (keeps mark content inside the safe zone) but wrong for the
// background: an inset flat-color layer doesn't reach the edges of
// non-square OS masks (circle, squircle), leaving a visible transparent gap
// between the icon's rounded-square background and the mask boundary. Run
// this after `npx @capacitor/assets generate --android` to strip the inset
// from just the <background> element.

import { readFileSync, writeFileSync } from "node:fs";

const files = [
  "android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml",
  "android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml",
];

const brokenBackground =
  '<background>\n        <inset android:drawable="@mipmap/ic_launcher_background" android:inset="16.7%" />\n    </background>';
const fixedBackground = '<background android:drawable="@mipmap/ic_launcher_background" />';

for (const file of files) {
  const xml = readFileSync(file, "utf8");
  if (!xml.includes(brokenBackground)) {
    console.log(`${file}: already fixed or format changed, skipping`);
    continue;
  }
  writeFileSync(file, xml.replace(brokenBackground, fixedBackground));
  console.log(`${file}: patched background to full-bleed`);
}
