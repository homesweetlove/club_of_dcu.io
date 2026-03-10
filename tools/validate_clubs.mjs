// tools/validate_clubs.mjs
// Validate data/clubs.json for common mistakes.
// - Unique id
// - Required fields
// - Local image path exists
// - URL formats

import fs from "node:fs";
import path from "node:path";

const DATA = path.join(process.cwd(), "data", "clubs.json");

function isURL(s) {
  return typeof s === "string" && /^https?:\/\/.+/i.test(s);
}

function isYYYYMMDD(s) {
  return s === null || s === undefined || (typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s));
}

function isLocalPath(p) {
  return typeof p === "string" && p.length > 0 && !p.includes("://") && !p.startsWith("data:");
}

function resolveRepoPath(p) {
  // allow "./assets/x.png" or "assets/x.png" or "/assets/x.png"
  let s = p;
  if (s.startsWith("./")) s = s.slice(2);
  if (s.startsWith("/")) s = s.slice(1);
  return path.join(process.cwd(), s);
}

function main() {
  const raw = fs.readFileSync(DATA, "utf-8");
  const clubs = JSON.parse(raw);
  if (!Array.isArray(clubs)) throw new Error("clubs.json must be an array");

  const errors = [];
  const ids = new Set();

  clubs.forEach((c, idx) => {
    const where = `#${idx} (${c?.id || "no-id"})`;

    if (!c || typeof c !== "object") {
      errors.push(`${where}: club must be an object`);
      return;
    }

    const id = c.id;
    if (!id || typeof id !== "string") errors.push(`${where}: missing id`);
    else {
      if (ids.has(id)) errors.push(`${where}: duplicate id "${id}"`);
      ids.add(id);
      if (!/^[a-z0-9][a-z0-9-_]{2,80}$/i.test(id)) {
        errors.push(`${where}: id should match /^[a-z0-9][a-z0-9-_]{2,80}$/`);
      }
    }

    if (!c.name) errors.push(`${where}: missing name`);
    if (!c.school) errors.push(`${where}: missing school`);
    if (!Array.isArray(c.categories) || c.categories.length === 0) errors.push(`${where}: categories must be a non-empty array`);
    if (!c.oneLine) errors.push(`${where}: missing oneLine`);
    if (typeof c.recruiting !== "boolean") errors.push(`${where}: recruiting must be boolean`);
    if (!isYYYYMMDD(c.recruitEnd)) errors.push(`${where}: recruitEnd must be YYYY-MM-DD or null`);

    if (!isURL(c.applyUrl)) errors.push(`${where}: applyUrl must be a full http(s) URL`);

    if (c.contactUrl && !isURL(c.contactUrl)) errors.push(`${where}: contactUrl must be a full http(s) URL`);

    // Images: local path must exist
    const images = Array.isArray(c.images) ? c.images : [];
    images.forEach((p, i) => {
      if (!p) return;
      if (!isLocalPath(p)) return; // external OK
      const rp = resolveRepoPath(p);
      if (!fs.existsSync(rp)) errors.push(`${where}: images[${i}] not found: ${p}`);
    });

    if (c.logo) {
      const p = c.logo;
      if (isLocalPath(p)) {
        const rp = resolveRepoPath(p);
        if (!fs.existsSync(rp)) errors.push(`${where}: logo not found: ${p}`);
      }
    }
  });

  if (errors.length) {
    console.error("Club data validation failed:");
    errors.forEach(e => console.error(" - " + e));
    process.exit(1);
  }

  console.log(`[validate_clubs] OK (${clubs.length} clubs)`);
}

main();
