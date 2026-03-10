// tools/auto_close_recruiting.mjs
// GitHub Actions scheduled job: mark expired clubs as recruiting=false.
// Compares date strings in Asia/Seoul (KST).

import fs from "node:fs";
import path from "node:path";

const DATA = path.join(process.cwd(), "data", "clubs.json");

function seoulToday() {
  // YYYY-MM-DD in Asia/Seoul
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
}

function isYYYYMMDD(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function main() {
  const raw = fs.readFileSync(DATA, "utf-8");
  const clubs = JSON.parse(raw);
  if (!Array.isArray(clubs)) throw new Error("clubs.json must be an array");

  const today = seoulToday();
  let changed = 0;

  for (const c of clubs) {
    const end = c?.recruitEnd;
    const recruiting = Boolean(c?.recruiting);

    if (recruiting && isYYYYMMDD(end) && end < today) {
      c.recruiting = false;
      c.lastUpdated = today;
      changed++;
    }
  }

  if (changed) {
    fs.writeFileSync(DATA, JSON.stringify(clubs, null, 2) + "\n", "utf-8");
    console.log(`[auto_close_recruiting] Updated ${changed} clubs (today=${today}).`);
  } else {
    console.log(`[auto_close_recruiting] No changes (today=${today}).`);
  }
}

main();
