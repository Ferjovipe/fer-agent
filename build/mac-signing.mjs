// 9.4 · Apple signature. GitHub runs this only when the Apple secrets exist (CSC_LINK…): it changes the Mac part of package.json,
// on that machine and for that build only, so the app is signed with the Developer ID certificate, with the hardened runtime, and
// notarized by Apple (with APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD and APPLE_TEAM_ID). Without the secrets nothing changes:
// the app comes out as until now (ad-hoc signature: on the Mac, «Open Anyway» the first time).
import fs from "node:fs";
const file = new URL("../package.json", import.meta.url);
const p = JSON.parse(fs.readFileSync(file, "utf8"));
const mac = p.build.mac;
delete mac.identity;                    // not «-» (ad-hoc): the certificate from CSC_LINK
mac.hardenedRuntime = true;
mac.entitlements = "build/entitlements.signed.plist";
mac.entitlementsInherit = "build/entitlements.signed.plist";
mac.notarize = true;
fs.writeFileSync(file, JSON.stringify(p, null, 2) + "\n");
console.log("Mac: signed with Developer ID, hardened runtime and notarized.");
