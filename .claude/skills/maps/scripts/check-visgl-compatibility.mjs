#!/usr/bin/env node
import { readFile } from "node:fs/promises";

const pkg = JSON.parse(await readFile("package.json", "utf8"));
const lock = JSON.parse(await readFile("package-lock.json", "utf8"));
const installedPkg = JSON.parse(await readFile("node_modules/@vis.gl/react-google-maps/package.json", "utf8"));

const declared = pkg.dependencies?.["@vis.gl/react-google-maps"] ?? pkg.devDependencies?.["@vis.gl/react-google-maps"];
const locked = lock.packages?.["node_modules/@vis.gl/react-google-maps"]?.version;
if (!declared || !locked) {
  console.error("VISGL_MISSING: @vis.gl/react-google-maps must be declared and locked");
  process.exit(2);
}
if (installedPkg.version !== locked) {
  console.error(`VISGL_VERSION_MISMATCH installed=${installedPkg.version} locked=${locked}`);
  process.exit(2);
}

const visgl = await import("@vis.gl/react-google-maps");
const requiredExports = ["APIProvider", "Map", "AdvancedMarker", "useMapsLibrary"];
const missing = requiredExports.filter((name) => !(name in visgl));
if (missing.length > 0) {
  console.error(`VISGL_EXPORT_MISSING ${missing.join(",")}`);
  process.exit(2);
}

console.log(
  `VISGL_COMPAT_OK declared=${declared} locked=${locked} exports=${requiredExports.join(",")}`,
);
