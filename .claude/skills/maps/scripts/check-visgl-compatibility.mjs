#!/usr/bin/env node
import { readFile } from "node:fs/promises";

const pkg = JSON.parse(await readFile("package.json", "utf8"));
const lock = JSON.parse(await readFile("package-lock.json", "utf8"));
const declared = pkg.dependencies?.["@vis.gl/react-google-maps"] ?? pkg.devDependencies?.["@vis.gl/react-google-maps"];
const locked = lock.packages?.["node_modules/@vis.gl/react-google-maps"]?.version;
if (!declared || !locked) {
  console.error("VISGL_MISSING: @vis.gl/react-google-maps must be declared and locked");
  process.exit(2);
}

const sources = [
  "https://developers.google.com/maps/documentation/javascript/examples/rgm-basic-map",
  "https://raw.githubusercontent.com/visgl/react-google-maps/main/docs/get-started.md",
];
for (const url of sources) {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) {
    console.error(`VISGL_REFERENCE_FAILED ${response.status} ${url}`);
    process.exit(2);
  }
  const text = await response.text();
  if (!text.includes("@vis.gl/react-google-maps")) {
    console.error(`VISGL_REFERENCE_DRIFT ${url}: canonical package name not found`);
    process.exit(2);
  }
}
console.log(`VISGL_COMPAT_OK declared=${declared} locked=${locked}`);
