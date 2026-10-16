import { chromium } from "@playwright/test";
const C = "/restaurants/ade2d416-1250-4edb-b131-59691910e8e1";
const shots = [
  ["/restaurants", 1440, 900, "directory-1440"],
  ["/restaurants", 390, 844, "directory-390"],
  [C, 1440, 900, "carmen-1440"],
  [C, 390, 844, "carmen-390"],
];
const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });
for (const [path, w, h, name] of shots) {
  const ctx = await b.newContext({ viewport: { width: w, height: h } });
  const p = await ctx.newPage();
  await p.goto("http://127.0.0.1:3001" + path, { waitUntil: "networkidle", timeout: 90000 });
  await p.screenshot({ path: ".shots/" + name + ".png", fullPage: name.includes("390") });
  console.log("shot", name, "| h1:", (await p.locator("h1").first().textContent().catch(() => "-"))?.trim());
  await ctx.close();
}
await b.close();