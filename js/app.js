import { CONFIG } from "./config.js";

/** @typedef {{
 *  id: string,
 *  school: string,
 *  name: string,
 *  categories: string[],
 *  tags?: string[],
 *  oneLine: string,
 *  description?: string,
 *  activityTime?: string,
 *  location?: string,
 *  recruiting: boolean,
 *  recruitEnd?: string|null,
 *  applyUrl: string,
 *  contactUrl?: string,
 *  logo?: string,
 *  images?: string[],
 *  lastUpdated?: string,
 *  pinned?: boolean
 * }} Club */

const $ = (sel) => /** @type {HTMLElement|null} */(document.querySelector(sel));
const $$ = (sel) => /** @type {HTMLElement[]} */(Array.from(document.querySelectorAll(sel)));

function debounce(fn, wait = 160) {
  let t = null;
  return (...args) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

/** @type {Club[]} */
let CLUBS = [];

const state = {
  q: "",
  school: "",
  category: "",
  tag: "",
  recruitingOnly: false,
  closedOnly: false,
  sort: "deadline",
  groupBy: "none", // none | school | category
  selectedId: "",
};

const uiState = {
  // ephemeral UI state (not persisted)
  collapsed: {
    clubs: false,
    recruiting: false,
    closed: false,
    deadline: false,
  },
  navIndex: -1,
  navIds: /** @type {string[]} */([]),
  autocompleteOpen: false,
  autocompleteIndex: -1,
  autocompleteItems: /** @type {{kind:string, value:string, sub?:string}[]} */([]),
};

const SYNONYMS = {
  "ai": ["ai", "인공지능", "artificial intelligence"],
  "ml": ["ml", "머신러닝", "machine learning"],
  "dl": ["dl", "딥러닝", "deep learning"],
  "dev": ["dev", "개발", "developer", "development"],
  "cs": ["cs", "컴퓨터공학", "컴공", "computer science"],
  "cse": ["cse", "컴퓨터공학", "컴공"],
  "web": ["web", "웹", "프론트", "frontend", "backend", "백엔드"],
  "app": ["app", "앱", "ios", "android"],
  "band": ["band", "밴드", "공연", "music", "음악"],
  "volunteer": ["volunteer", "봉사", "지역사회", "service"],
  "study": ["study", "스터디", "학술", "세미나", "seminar"],
  "robot": ["robot", "로봇", "robotics"],
  "security": ["security", "보안", "해킹", "ctf"],
};

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function safeArray(v) {
  return Array.isArray(v) ? v : [];
}

function normalizeClub(raw) {
  const c = { ...raw };
  c.school = c.school || "대구가톨릭대학교";
  c.categories = safeArray(c.categories);
  c.tags = safeArray(c.tags);
  c.images = safeArray(c.images);
  c.recruitEnd = (c.recruitEnd === undefined) ? null : c.recruitEnd;
  c.description = c.description ?? "";
  c.activityTime = c.activityTime ?? "";
  c.location = c.location ?? "";
  c.contactUrl = c.contactUrl ?? "";
  c.logo = c.logo ?? "";
  c.lastUpdated = c.lastUpdated ?? "";
  c.pinned = Boolean(c.pinned);
  return c;
}

function parseDate(s) {
  if (!s) return null;
  const m = /^\d{4}-\d{2}-\d{2}$/.exec(s);
  if (!m) return null;
  const d = new Date(s + "T00:00:00");
  return isNaN(d.getTime()) ? null : d;
}

function daysUntil(date) {
  const now = new Date();
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const b = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const ms = b.getTime() - a.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

function isClosed(club) {
  if (!club.recruiting) return true;
  const d = parseDate(club.recruitEnd);
  if (!d) return false;
  return daysUntil(d) < 0;
}

function deadlineBadge(club) {
  if (isClosed(club)) return `<span class="badge">모집종료</span>`;
  const d = parseDate(club.recruitEnd);
  if (!d) return `<span class="badge badge-warning">마감미정</span>`;
  const diff = daysUntil(d);
  if (diff <= 3) return `<span class="badge badge-danger">D-${diff}</span>`;
  if (diff <= 10) return `<span class="badge badge-warning">D-${diff}</span>`;
  return `<span class="badge badge-success">모집중</span>`;
}

function formatRecruitEnd(club) {
  if (isClosed(club)) return club.recruitEnd ? `${club.recruitEnd} (종료)` : "모집 종료";
  if (!club.recruitEnd) return "마감 미정";
  return club.recruitEnd;
}

function uniqSorted(list) {
  return Array.from(new Set(list)).filter(Boolean).sort((a, b) => a.localeCompare(b));
}

function escapeHTML(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
function escapeAttr(s) {
  return escapeHTML(s).replaceAll("`", "&#096;");
}

function highlight(text, qTokens) {
  const raw = String(text ?? "");
  if (!qTokens.length) return escapeHTML(raw);

  // Only highlight first 3 tokens (to keep it readable)
  const tokens = qTokens.slice(0, 3).filter(t => t.length >= 2);
  if (!tokens.length) return escapeHTML(raw);

  // Escape first, then highlight by simple replacement (case-insensitive for latin).
  // For Korean, this still works as exact match.
  let out = escapeHTML(raw);
  tokens.forEach((t) => {
    const safe = escapeHTML(t);
    // Avoid regex special chars by escaping
    const re = new RegExp(safe.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    out = out.replace(re, (m) => `<mark>${m}</mark>`);
  });
  return out;
}

function normalizeToken(t) {
  return String(t ?? "").trim().toLowerCase();
}

function tokenize(q) {
  return String(q ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function expandSynonyms(token) {
  const k = normalizeToken(token);
  if (SYNONYMS[k]) return SYNONYMS[k].map(normalizeToken);
  return [k];
}

function editDistance(a, b, max = 2) {
  // Small, bounded Levenshtein. Early exit if distance exceeds max.
  a = a || ""; b = b || "";
  const al = a.length, bl = b.length;
  if (Math.abs(al - bl) > max) return max + 1;
  if (!al) return bl;
  if (!bl) return al;
  /** @type {number[]} */
  let prev = new Array(bl + 1);
  /** @type {number[]} */
  let cur = new Array(bl + 1);
  for (let j = 0; j <= bl; j++) prev[j] = j;

  for (let i = 1; i <= al; i++) {
    cur[0] = i;
    let rowMin = cur[0];
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= bl; j++) {
      const cb = b.charCodeAt(j - 1);
      const cost = (ca === cb) ? 0 : 1;
      const v = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + cost
      );
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    const tmp = prev; prev = cur; cur = tmp;
  }
  return prev[bl];
}

function fuzzyIncludes(hay, token) {
  const t = normalizeToken(token);
  if (!t) return false;
  if (hay.includes(t)) return true;

  // Cheap fuzzy: compare against words of similar length
  const words = hay.split(/[\s,.;:()\/\-\[\]{}<>|]+/g).filter(Boolean);
  const max = (t.length <= 4) ? 1 : 2;
  for (const w of words) {
    if (Math.abs(w.length - t.length) > max) continue;
    if (editDistance(t, w, max) <= max) return true;
  }
  return false;
}

function clubSearchScore(club, query) {
  const tokens = tokenize(query);
  if (!tokens.length) return 0;

  const name = normalizeToken(club.name);
  const school = normalizeToken(club.school);
  const cats = normalizeToken((club.categories || []).join(" "));
  const tags = normalizeToken((club.tags || []).join(" "));
  const one = normalizeToken(club.oneLine);
  const desc = normalizeToken(club.description);

  const hay = `${name} ${school} ${cats} ${tags} ${one} ${desc}`.trim();

  let score = 0;

  // AND matching: each raw token must match somewhere (exact or fuzzy via synonyms expansion)
  for (const rawToken of tokens) {
    const variants = expandSynonyms(rawToken);
    let matched = false;
    let best = 0;

    for (const v of variants) {
      if (!v) continue;
      if (name.includes(v)) { matched = true; best = Math.max(best, 30); continue; }
      if (tags.includes(v)) { matched = true; best = Math.max(best, 18); continue; }
      if (cats.includes(v)) { matched = true; best = Math.max(best, 16); continue; }
      if (one.includes(v)) { matched = true; best = Math.max(best, 10); continue; }
      if (school.includes(v)) { matched = true; best = Math.max(best, 8); continue; }
      if (desc.includes(v)) { matched = true; best = Math.max(best, 6); continue; }

      // fuzzy
      if (fuzzyIncludes(hay, v)) { matched = true; best = Math.max(best, 2); continue; }
    }

    if (!matched) return -1; // fail AND match
    score += best;
  }

  // bonus for pinned
  if (club.pinned) score += 6;

  return score;
}

function buildSchoolOptions(clubs) {
  const schools = uniqSorted(clubs.map(c => c.school));
  const sel = /** @type {HTMLSelectElement|null} */(document.getElementById("school"));
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = `<option value="">전체 학교</option>` + schools.map(s => `<option value="${escapeAttr(s)}">${escapeHTML(s)}</option>`).join("");
  sel.value = current;
}

function computeFacetCounts(clubs, facet) {
  // facet: "category" | "tag"
  const base = clubs
    .filter(c => matchesQuery(c, state.q))
    .filter(c => state.school ? c.school === state.school : true)
    .filter(c => state.recruitingOnly ? !isClosed(c) : true)
    .filter(c => state.closedOnly ? isClosed(c) : true)
    .filter(c => facet === "tag" ? (state.category ? c.categories.includes(state.category) : true) : (state.tag ? safeArray(c.tags).includes(state.tag) : true));

  /** @type {Record<string, number>} */
  const counts = {};
  base.forEach(c => {
    const values = facet === "category" ? c.categories : safeArray(c.tags);
    values.forEach(v => {
      counts[v] = (counts[v] || 0) + 1;
    });
  });
  return counts;
}

function renderChips(containerSel, values, activeValue, counts, onClick) {
  const el = $(containerSel);
  if (!el) return;
  el.innerHTML = "";
  values.forEach(v => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.dataset.active = (v === activeValue) ? "true" : "false";
    const cnt = counts && (counts[v] ?? 0);
    chip.textContent = cnt ? `${v} (${cnt})` : v;
    chip.addEventListener("click", () => onClick(v));
    el.appendChild(chip);
  });
  if (values.length === 0) {
    const span = document.createElement("span");
    span.className = "muted";
    span.style.fontSize = "13px";
    span.textContent = "표시할 항목이 없습니다.";
    el.appendChild(span);
  }
}

function buildFilters(clubs) {
  buildSchoolOptions(clubs);

  const categories = uniqSorted(clubs.flatMap(c => c.categories));
  const tags = uniqSorted(clubs.flatMap(c => safeArray(c.tags)));

  const categoryCounts = computeFacetCounts(clubs, "category");
  const tagCounts = computeFacetCounts(clubs, "tag");

  renderChips("#categoryChips", categories, state.category, categoryCounts, (v) => {
    state.category = (state.category === v) ? "" : v;
    syncDrawerFromState();
    render();
  });

  renderChips("#tagChips", tags, state.tag, tagCounts, (v) => {
    state.tag = (state.tag === v) ? "" : v;
    syncDrawerFromState();
    render();
  });

  // Drawer chips if present
  renderChips("#categoryChipsDrawer", categories, state.category, categoryCounts, (v) => {
    state.category = (state.category === v) ? "" : v;
    syncDrawerFromState();
    render();
  });

  renderChips("#tagChipsDrawer", tags, state.tag, tagCounts, (v) => {
    state.tag = (state.tag === v) ? "" : v;
    syncDrawerFromState();
    render();
  });
}

function matchesQuery(club, q) {
  if (!q) return true;
  return clubSearchScore(club, q) >= 0;
}

function applyFilters(clubs) {
  return clubs
    .filter(c => matchesQuery(c, state.q))
    .filter(c => state.school ? c.school === state.school : true)
    .filter(c => state.category ? c.categories.includes(state.category) : true)
    .filter(c => state.tag ? safeArray(c.tags).includes(state.tag) : true)
    .filter(c => state.recruitingOnly ? !isClosed(c) : true)
    .filter(c => state.closedOnly ? isClosed(c) : true);
}

function sortClubs(clubs) {
  const arr = [...clubs];

  // If query exists and sort isn't explicit name/school, prioritize relevance
  const useRelevance = Boolean(state.q) && (state.sort === "deadline");

  if (state.sort === "name") {
    arr.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    return arr;
  }
  if (state.sort === "school") {
    arr.sort((a, b) => {
      const s = (a.school || "").localeCompare(b.school || "");
      if (s !== 0) return s;
      return (a.name || "").localeCompare(b.name || "");
    });
    return arr;
  }

  // default: deadline/status, with optional relevance first
  arr.sort((a, b) => {
    if (useRelevance) {
      const sa = clubSearchScore(a, state.q);
      const sb = clubSearchScore(b, state.q);
      if (sa !== sb) return sb - sa;
    }

    // pinned first
    const pa = a.pinned ? 1 : 0;
    const pb = b.pinned ? 1 : 0;
    if (pa !== pb) return pb - pa;

    const ca = isClosed(a);
    const cb = isClosed(b);
    if (ca !== cb) return ca ? 1 : -1;

    const da = parseDate(a.recruitEnd);
    const db = parseDate(b.recruitEnd);

    if (da && db) return da.getTime() - db.getTime();
    if (da && !db) return -1;
    if (!da && db) return 1;

    const s = (a.school || "").localeCompare(b.school || "");
    if (s !== 0) return s;
    return (a.name || "").localeCompare(b.name || "");
  });

  return arr;
}

function posterImages(club) {
  const imgs = safeArray(club.images).filter(Boolean);
  if (imgs.length) return imgs;
  if (club.logo) return [club.logo];
  return [];
}

function posterSrc(club) {
  const imgs = posterImages(club);
  return imgs.length ? imgs[0] : "";
}

function cardHTML(club) {
  const cats = club.categories.map(x => `<span class="badge">${escapeHTML(x)}</span>`).join(" ");
  const tags = safeArray(club.tags).slice(0, 3).map(x => `<span class="badge">${escapeHTML(x)}</span>`).join(" ");
  const moreTag = (safeArray(club.tags).length > 3) ? `<span class="badge">+${safeArray(club.tags).length - 3}</span>` : "";

  const poster = posterSrc(club);
  const media = poster ? `
    <div class="card-media" aria-hidden="true">
      <img src="${escapeAttr(poster)}" alt="" loading="lazy" />
    </div>
  ` : "";

  const qTokens = tokenize(state.q).map(normalizeToken).filter(Boolean);

  return `
    <div class="card" data-id="${escapeAttr(club.id)}" role="button" tabindex="0" aria-label="${escapeAttr(club.name)} 상세보기">
      ${media}
      <div class="card-body">
        <div class="card-title">
          <div>
            <h3>${highlight(club.name, qTokens)}</h3>
            <div class="card-sub">${highlight(club.school, qTokens)}</div>
          </div>
          <div>${deadlineBadge(club)}</div>
        </div>

        <p class="card-oneLine">${highlight(club.oneLine, qTokens)}</p>

        <div class="card-meta">
          <div class="left">${cats}</div>
          <div class="left">${tags} ${moreTag}</div>
        </div>

        <div class="card-actions">
          <button class="btn btn-ghost" type="button" data-action="detail" data-id="${escapeAttr(club.id)}">상세보기</button>
          <a class="btn btn-primary" href="${escapeAttr(club.applyUrl)}" target="_blank" rel="noopener noreferrer" data-action="apply">
            지원하기
          </a>
        </div>
      </div>
    </div>
  `;
}

function attachCardEvents(containerEl) {
  if (!containerEl) return;

  containerEl.querySelectorAll(".card").forEach(card => {
    const id = card.getAttribute("data-id");
    const open = () => selectClub(id);

    card.addEventListener("click", (e) => {
      const t = /** @type {HTMLElement} */(e.target);
      if (t && (t.closest('a[data-action="apply"]'))) return;
      open();
    });

    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open();
      }
    });

    const btn = card.querySelector('button[data-action="detail"]');
    if (btn) btn.addEventListener("click", (e) => {
      e.stopPropagation();
      open();
    });
  });
}

function renderFlatCards(containerId, clubs) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.classList.add("cards");
  el.classList.remove("groups-container");
  el.innerHTML = clubs.map(cardHTML).join("");
  attachCardEvents(el);

  if (clubs.length === 0) {
    el.innerHTML = `<div class="muted" style="padding: 14px 2px;">조건에 맞는 동아리가 없습니다.</div>`;
  }
}

function groupKey(club) {
  if (state.groupBy === "school") return club.school || "기타";
  if (state.groupBy === "category") return (club.categories && club.categories[0]) ? club.categories[0] : "기타";
  return "전체";
}

function renderGroupedCards(containerId, clubs) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.classList.remove("cards");
  el.classList.add("groups-container");

  /** @type {Record<string, Club[]>} */
  const groups = {};
  clubs.forEach(c => {
    const k = groupKey(c);
    groups[k] = groups[k] || [];
    groups[k].push(c);
  });

  const keys = Object.keys(groups).sort((a, b) => a.localeCompare(b));
  if (state.groupBy === "category") {
    // put "기타" last
    keys.sort((a,b)=> (a==="기타") - (b==="기타") || a.localeCompare(b));
  }

  el.innerHTML = keys.map(k => {
    const list = groups[k] || [];
    return `
      <div class="group" data-group="${escapeAttr(k)}" data-collapsed="false">
        <button class="group-head" type="button" aria-expanded="true">
          <span>${escapeHTML(k)}</span>
          <span style="display:flex; align-items:center; gap:10px;">
            <span class="count">${list.length}개</span>
            <span class="chev">▾</span>
          </span>
        </button>
        <div class="group-body">
          <div class="cards">${list.map(cardHTML).join("")}</div>
        </div>
      </div>
    `;
  }).join("");

  // collapse toggles + card events
  el.querySelectorAll(".group").forEach(g => {
    const head = g.querySelector(".group-head");
    const bodyCards = g.querySelector(".cards");
    attachCardEvents(bodyCards);

    head?.addEventListener("click", () => {
      const collapsed = g.getAttribute("data-collapsed") === "true";
      g.setAttribute("data-collapsed", collapsed ? "false" : "true");
      head.setAttribute("aria-expanded", collapsed ? "true" : "false");
    });
  });

  if (clubs.length === 0) {
    el.innerHTML = `<div class="muted" style="padding: 14px 2px;">조건에 맞는 동아리가 없습니다.</div>`;
  }
}

function renderCards(containerId, clubs) {
  if (state.groupBy === "none") {
    renderFlatCards(containerId, clubs);
  } else {
    renderGroupedCards(containerId, clubs);
  }
}

function detailHTML(club) {
  const cats = club.categories.map(x => `<span class="badge">${escapeHTML(x)}</span>`).join(" ");
  const tags = safeArray(club.tags).map(x => `<span class="badge">${escapeHTML(x)}</span>`).join(" ");
  const imgs = posterImages(club);

  const recruitInfo = isClosed(club)
    ? `<span class="badge">모집종료</span>`
    : `<span class="badge badge-success">모집중</span>`;

  const contact = club.contactUrl
    ? `<a class="btn btn-ghost" href="${escapeAttr(club.contactUrl)}" target="_blank" rel="noopener noreferrer">문의하기</a>`
    : "";

  const thumbRow = (imgs.length > 1) ? `
    <div class="thumb-row" aria-label="포스터 썸네일">
      ${imgs.map((src, idx)=>`
        <button class="thumb" type="button" data-thumb="${idx}" data-active="${idx===0 ? "true":"false"}" aria-label="포스터 ${idx+1}">
          <img src="${escapeAttr(src)}" alt="" loading="lazy" />
        </button>
      `).join("")}
    </div>
  ` : "";

  const posterBlock = imgs.length ? `
    <div class="poster" id="poster" role="button" tabindex="0" aria-label="포스터 크게 보기">
      <img id="posterImg" src="${escapeAttr(imgs[0])}" alt="${escapeAttr(club.name)} 포스터" loading="lazy" />
    </div>
    ${thumbRow}
  ` : "";

  return `
    <div class="detail-head">
      <h2>${escapeHTML(club.name)}</h2>
      <p class="sub">${escapeHTML(club.school)} · ${recruitInfo} · 마감: ${escapeHTML(formatRecruitEnd(club))}</p>
    </div>

    <div class="detail-body">
      ${posterBlock}

      <div class="kv">
        <div class="k">요약</div>
        <div class="v">${escapeHTML(club.oneLine)}</div>
      </div>

      <div class="kv">
        <div class="k">카테고리</div>
        <div class="v">${cats || "-"}</div>
      </div>

      <div class="kv">
        <div class="k">태그</div>
        <div class="v">${tags || "-"}</div>
      </div>

      <div class="kv">
        <div class="k">활동</div>
        <div class="v">${escapeHTML(club.activityTime || "-")}</div>
      </div>

      <div class="kv">
        <div class="k">장소</div>
        <div class="v">${escapeHTML(club.location || "-")}</div>
      </div>

      <div class="kv">
        <div class="k">소개</div>
        <div class="v">${escapeHTML(club.description || "-")}</div>
      </div>

      <div class="detail-actions">
        <a class="btn btn-primary" href="${escapeAttr(club.applyUrl)}" target="_blank" rel="noopener noreferrer">지원하기</a>
        ${contact}
        <button class="btn btn-ghost" type="button" id="shareLink">공유</button>
        <button class="btn btn-link" type="button" id="copyLink">링크 복사</button>
      </div>
    </div>
  `;
}

/** Poster modal gallery state */
let modalGallery = /** @type {string[]} */([]);
let modalIndex = 0;
let modalTitle = "";

function openPosterModal(title, images, startIndex = 0) {
  const modal = document.getElementById("modal");
  const img = /** @type {HTMLImageElement|null} */(document.getElementById("modalImg"));
  const t = document.getElementById("modalTitle");
  const openNew = /** @type {HTMLAnchorElement|null} */(document.getElementById("modalOpenNew"));
  const prevBtn = /** @type {HTMLButtonElement|null} */(document.getElementById("modalPrev"));
  const nextBtn = /** @type {HTMLButtonElement|null} */(document.getElementById("modalNext"));
  if (!modal || !img || !t || !openNew || !prevBtn || !nextBtn) return;

  modalGallery = images.filter(Boolean);
  modalIndex = Math.max(0, Math.min(startIndex, modalGallery.length - 1));
  modalTitle = title || "포스터";

  const render = () => {
    const src = modalGallery[modalIndex];
    t.textContent = `${modalTitle} (${modalIndex + 1}/${modalGallery.length})`;
    img.src = src;
    openNew.href = src;

    const multi = modalGallery.length > 1;
    prevBtn.style.display = multi ? "inline-flex" : "none";
    nextBtn.style.display = multi ? "inline-flex" : "none";
  };

  const step = (dir) => {
    if (modalGallery.length <= 1) return;
    modalIndex = (modalIndex + dir + modalGallery.length) % modalGallery.length;
    render();
  };

  render();

  modal.dataset.open = "true";
  modal.setAttribute("aria-hidden", "false");

  const closeBtn = document.getElementById("modalClose");
  const close = () => {
    modal.dataset.open = "false";
    modal.setAttribute("aria-hidden", "true");
    img.src = "";
    modalGallery = [];
    modalIndex = 0;
  };

  // Bind once per open
  closeBtn?.addEventListener("click", close, { once: true });
  prevBtn.onclick = () => step(-1);
  nextBtn.onclick = () => step(+1);

  const onBackdrop = (e) => {
    const target = /** @type {HTMLElement} */(e.target);
    if (target && target.id === "modal") close();
  };
  modal.addEventListener("click", onBackdrop, { once: true });

  const onKey = (e) => {
    if (e.key === "Escape") close();
    if (e.key === "ArrowLeft") step(-1);
    if (e.key === "ArrowRight") step(+1);
  };
  window.addEventListener("keydown", onKey);

  // Simple swipe
  let sx = 0, sy = 0;
  const onTouchStart = (e) => {
    const t0 = e.touches?.[0];
    if (!t0) return;
    sx = t0.clientX; sy = t0.clientY;
  };
  const onTouchEnd = (e) => {
    const t0 = e.changedTouches?.[0];
    if (!t0) return;
    const dx = t0.clientX - sx;
    const dy = t0.clientY - sy;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) {
      step(dx > 0 ? -1 : +1);
    }
  };
  img.ontouchstart = onTouchStart;
  img.ontouchend = onTouchEnd;

  // Cleanup key listener on close
  const observer = new MutationObserver(() => {
    if (modal.getAttribute("data-open") !== "true") {
      window.removeEventListener("keydown", onKey);
      observer.disconnect();
    }
  });
  observer.observe(modal, { attributes: true, attributeFilter: ["data-open"] });
}

function isMobile() {
  return window.matchMedia && window.matchMedia("(max-width: 980px)").matches;
}

function openSheet() {
  const sheet = document.getElementById("sheet");
  const bd = document.getElementById("sheetBackdrop");
  if (!sheet || !bd) return;
  sheet.dataset.open = "true";
  sheet.setAttribute("aria-hidden", "false");
  bd.dataset.open = "true";
  bd.setAttribute("aria-hidden", "false");
}
function closeSheet() {
  const sheet = document.getElementById("sheet");
  const bd = document.getElementById("sheetBackdrop");
  if (!sheet || !bd) return;
  sheet.dataset.open = "false";
  sheet.setAttribute("aria-hidden", "true");
  bd.dataset.open = "false";
  bd.setAttribute("aria-hidden", "true");
}

function openDrawer() {
  const d = document.getElementById("drawer");
  const b = document.getElementById("drawerBackdrop");
  if (!d || !b) return;
  d.dataset.open = "true"; d.setAttribute("aria-hidden", "false");
  b.dataset.open = "true"; b.setAttribute("aria-hidden", "false");
}
function closeDrawer() {
  const d = document.getElementById("drawer");
  const b = document.getElementById("drawerBackdrop");
  if (!d || !b) return;
  d.dataset.open = "false"; d.setAttribute("aria-hidden", "true");
  b.dataset.open = "false"; b.setAttribute("aria-hidden", "true");
}

function openHelp() {
  const modal = document.getElementById("helpModal");
  if (!modal) return;
  modal.dataset.open = "true";
  modal.setAttribute("aria-hidden", "false");
}
function closeHelp() {
  const modal = document.getElementById("helpModal");
  if (!modal) return;
  modal.dataset.open = "false";
  modal.setAttribute("aria-hidden", "true");
}

function selectClub(id) {
  const club = CLUBS.find(c => c.id === id);
  if (!club) return;

  state.selectedId = id;

  const detail = $("#detail");
  if (detail) detail.innerHTML = detailHTML(club);

  // Mobile sheet
  const sheetDetail = document.getElementById("sheetDetail");
  if (sheetDetail) {
    sheetDetail.innerHTML = detailHTML(club);
    if (isMobile()) openSheet();
  }

  const url = new URL(window.location.href);
  url.searchParams.set("club", id);
  history.pushState({ club: id }, "", url.toString());

  const shareBtn = document.getElementById("shareLink");
  if (shareBtn) {
    shareBtn.addEventListener("click", async () => {
      const shareUrl = url.toString();
      try {
        if (navigator.share) {
          await navigator.share({ title: club.name, text: club.oneLine, url: shareUrl });
          return;
        }
      } catch {}
      try {
        await navigator.clipboard.writeText(shareUrl);
        shareBtn.textContent = "복사됨!";
        setTimeout(() => shareBtn.textContent = "공유", 1200);
      } catch {
        window.prompt("아래 링크를 복사하세요:", shareUrl);
      }
    });
  }

  const copyBtn = document.getElementById("copyLink");
  if (copyBtn) {
    copyBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(url.toString());
        copyBtn.textContent = "복사됨!";
        setTimeout(() => copyBtn.textContent = "링크 복사", 1200);
      } catch {
        window.prompt("아래 링크를 복사하세요:", url.toString());
      }
    });
  }

  // Poster gallery events (detail area & sheet area)
  const bindGallery = (rootEl) => {
    if (!rootEl) return;
    const imgs = posterImages(club);
    if (!imgs.length) return;

    let currentIdx = 0;
    const poster = rootEl.querySelector("#poster");
    const posterImg = /** @type {HTMLImageElement|null} */(rootEl.querySelector("#posterImg"));

    const setIdx = (idx) => {
      currentIdx = Math.max(0, Math.min(idx, imgs.length - 1));
      if (posterImg) posterImg.src = imgs[currentIdx];
      rootEl.querySelectorAll('button.thumb').forEach((b, i) => {
        b.setAttribute("data-active", String(i === currentIdx));
      });
    };

    rootEl.querySelectorAll('button.thumb').forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const idx = Number(btn.getAttribute("data-thumb") || "0");
        setIdx(idx);
        openPosterModal(`${club.name} 포스터`, imgs, idx);
      });
    });

    const open = () => openPosterModal(`${club.name} 포스터`, imgs, currentIdx);
    poster?.addEventListener("click", open);
    poster?.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); }
    });

    // simple swipe on poster (mobile)
    let sx = 0, sy = 0;
    posterImg?.addEventListener("touchstart", (e) => {
      const t0 = e.touches?.[0];
      if (!t0) return;
      sx = t0.clientX; sy = t0.clientY;
    }, { passive: true });
    posterImg?.addEventListener("touchend", (e) => {
      const t0 = e.changedTouches?.[0];
      if (!t0) return;
      const dx = t0.clientX - sx;
      const dy = t0.clientY - sy;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) {
        const next = dx > 0 ? currentIdx - 1 : currentIdx + 1;
        setIdx((next + imgs.length) % imgs.length);
      }
    }, { passive: true });
  };

  bindGallery(detail);
  bindGallery(sheetDetail);

  // Update navigation highlight
  highlightSelectedCard(id);
}

function highlightSelectedCard(id) {
  // remove previous
  $$(".card").forEach(card => card.removeAttribute("data-selected"));
  const el = document.querySelector(`.card[data-id="${CSS.escape(id)}"]`);
  if (el) el.setAttribute("data-selected", "true");
}

function renderDeadlineList(clubs) {
  const el = document.getElementById("deadlineList");
  if (!el) return;

  const list = clubs
    .filter(c => !isClosed(c))
    .filter(c => parseDate(c.recruitEnd))
    .sort((a,b)=> parseDate(a.recruitEnd).getTime() - parseDate(b.recruitEnd).getTime())
    .slice(0, 10);

  el.innerHTML = list.map(c => {
    const d = parseDate(c.recruitEnd);
    const dd = d ? daysUntil(d) : null;
    return `
      <div class="drow" data-id="${escapeAttr(c.id)}" role="button" tabindex="0" aria-label="${escapeAttr(c.name)} 마감 임박">
        <div class="info">
          <div class="name">${escapeHTML(c.name)}</div>
          <div class="meta">${escapeHTML(c.school)} · 마감 ${escapeHTML(c.recruitEnd || "미정")}</div>
        </div>
        <div class="dday">${dd !== null ? `D-${dd}` : ""}</div>
        <div class="actions">
          <a class="btn btn-primary" href="${escapeAttr(c.applyUrl)}" target="_blank" rel="noopener noreferrer">지원</a>
        </div>
      </div>
    `;
  }).join("");

  el.querySelectorAll(".drow").forEach(row => {
    const id = row.getAttribute("data-id");
    const open = () => selectClub(id);
    row.addEventListener("click", (e) => {
      const t = /** @type {HTMLElement} */(e.target);
      if (t && t.closest("a")) return;
      open();
    });
    row.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); }
    });
  });

  if (!list.length) {
    el.innerHTML = `<div class="muted" style="padding: 12px 14px;">마감 임박 동아리가 없습니다.</div>`;
  }
}

function renderActiveFilters() {
  const el = document.getElementById("activeFilters");
  if (!el) return;

  const pills = [];
  if (state.q) pills.push({ key: "q", label: `검색: ${state.q}` });
  if (state.school) pills.push({ key: "school", label: state.school });
  if (state.category) pills.push({ key: "category", label: `카테고리: ${state.category}` });
  if (state.tag) pills.push({ key: "tag", label: `태그: ${state.tag}` });
  if (state.recruitingOnly) pills.push({ key: "recruiting", label: "모집중" });
  if (state.closedOnly) pills.push({ key: "closed", label: "모집종료" });
  if (state.groupBy !== "none") pills.push({ key: "groupBy", label: `그룹: ${state.groupBy === "school" ? "학교별" : "카테고리별"}` });

  el.innerHTML = pills.map(p => `<button class="filter-pill" type="button" data-clear="${p.key}">${escapeHTML(p.label)} <span class="x">×</span></button>`).join("");

  el.querySelectorAll("button[data-clear]").forEach(btn => {
    btn.addEventListener("click", () => {
      const k = btn.getAttribute("data-clear");
      if (k === "q") state.q = "";
      if (k === "school") state.school = "";
      if (k === "category") state.category = "";
      if (k === "tag") state.tag = "";
      if (k === "recruiting") state.recruitingOnly = false;
      if (k === "closed") state.closedOnly = false;
      if (k === "groupBy") state.groupBy = "none";

      syncMainInputsFromState();
      syncDrawerFromState();
      render();
    });
  });
}

function syncMainInputsFromState() {
  const q = /** @type {HTMLInputElement|null} */(document.getElementById("q"));
  const school = /** @type {HTMLSelectElement|null} */(document.getElementById("school"));
  const sort = /** @type {HTMLSelectElement|null} */(document.getElementById("sort"));
  const groupBy = /** @type {HTMLSelectElement|null} */(document.getElementById("groupBy"));
  const toggle = document.getElementById("toggleRecruiting");
  const toggleClosed = document.getElementById("toggleClosed");

  if (q) q.value = state.q;
  if (school) school.value = state.school;
  if (sort) sort.value = state.sort;
  if (groupBy) groupBy.value = state.groupBy;

  if (toggle) {
    toggle.setAttribute("aria-pressed", String(state.recruitingOnly));
    toggle.textContent = state.recruitingOnly ? "모집중만 보기 (ON)" : "모집중만 보기";
  }
  if (toggleClosed) {
    toggleClosed.setAttribute("aria-pressed", String(state.closedOnly));
    toggleClosed.textContent = state.closedOnly ? "모집종료만 보기 (ON)" : "모집종료만 보기";
  }
}

function syncDrawerFromState() {
  const qd = /** @type {HTMLInputElement|null} */(document.getElementById("qDrawer"));
  const sd = /** @type {HTMLSelectElement|null} */(document.getElementById("schoolDrawer"));
  const so = /** @type {HTMLSelectElement|null} */(document.getElementById("sortDrawer"));
  const gd = /** @type {HTMLSelectElement|null} */(document.getElementById("groupByDrawer"));
  const rec = document.getElementById("recruitingDrawer");
  const clo = document.getElementById("closedDrawer");

  if (qd) qd.value = state.q;
  if (sd) sd.value = state.school;
  if (so) so.value = state.sort;
  if (gd) gd.value = state.groupBy;

  rec?.setAttribute("aria-pressed", String(state.recruitingOnly));
  if (rec) rec.textContent = state.recruitingOnly ? "모집중 (ON)" : "모집중";
  clo?.setAttribute("aria-pressed", String(state.closedOnly));
  if (clo) clo.textContent = state.closedOnly ? "모집종료 (ON)" : "모집종료";
}

function buildAutocompleteIndex(clubs) {
  const names = clubs.map(c => c.name).filter(Boolean);
  const cats = uniqSorted(clubs.flatMap(c => c.categories));
  const tags = uniqSorted(clubs.flatMap(c => safeArray(c.tags)));
  const schools = uniqSorted(clubs.map(c => c.school));

  return { names, cats, tags, schools };
}

let autocompleteIndex = null;

function renderAutocomplete(items) {
  const box = document.getElementById("autocomplete");
  if (!box) return;

  uiState.autocompleteItems = items;
  uiState.autocompleteIndex = -1;

  if (!items.length) {
    box.style.display = "none";
    uiState.autocompleteOpen = false;
    return;
  }

  box.innerHTML = items.map((it, idx) => `
    <div class="item" role="option" data-idx="${idx}" data-active="false">
      <span class="kind">${escapeHTML(it.kind)}</span>
      <span class="text">${escapeHTML(it.value)}</span>
      <span class="sub">${escapeHTML(it.sub || "")}</span>
    </div>
  `).join("");

  box.style.display = "block";
  uiState.autocompleteOpen = true;

  box.querySelectorAll(".item").forEach(node => {
    node.addEventListener("click", () => {
      const idx = Number(node.getAttribute("data-idx") || "0");
      applyAutocomplete(idx);
    });
  });
}

function applyAutocomplete(idx) {
  const it = uiState.autocompleteItems[idx];
  if (!it) return;

  // Apply depending on kind
  if (it.kind === "태그") {
    state.tag = it.value;
    state.q = "";
  } else if (it.kind === "카테고리") {
    state.category = it.value;
    state.q = "";
  } else if (it.kind === "학교") {
    state.school = it.value;
    state.q = "";
  } else {
    // 동아리
    state.q = it.value;
  }

  syncMainInputsFromState();
  syncDrawerFromState();
  renderAutocomplete([]);
  render();
}

function computeAutocomplete(query) {
  if (!autocompleteIndex) return [];
  const q = normalizeToken(query);
  if (!q || q.length < 1) return [];

  const max = 8;
  /** @type {{kind:string,value:string,sub?:string}[]} */
  const items = [];

  const push = (kind, value, sub = "") => {
    if (items.length >= max) return;
    if (items.some(x => x.kind === kind && x.value === value)) return;
    items.push({ kind, value, sub });
  };

  // Club names
  for (const name of autocompleteIndex.names) {
    const n = normalizeToken(name);
    if (n.includes(q)) push("동아리", name, "이름");
    if (items.length >= max) break;
  }

  for (const t of autocompleteIndex.tags) {
    const n = normalizeToken(t);
    if (n.includes(q)) push("태그", t);
    if (items.length >= max) break;
  }

  for (const c of autocompleteIndex.cats) {
    const n = normalizeToken(c);
    if (n.includes(q)) push("카테고리", c);
    if (items.length >= max) break;
  }

  for (const s of autocompleteIndex.schools) {
    const n = normalizeToken(s);
    if (n.includes(q)) push("학교", s);
    if (items.length >= max) break;
  }

  // synonym hint
  if (SYNONYMS[q]) {
    push("추천", q, "동의어: " + SYNONYMS[q].slice(1,3).join(", "));
  }

  return items;
}

function closeAutocompleteOnOutside() {
  const box = document.getElementById("autocomplete");
  if (!box) return;
  const onClick = (e) => {
    const t = /** @type {HTMLElement} */(e.target);
    if (!t) return;
    if (t.closest("#autocomplete") || t.closest("#q")) return;
    renderAutocomplete([]);
  };
  window.addEventListener("click", onClick);
}

function updateNavList(sorted) {
  uiState.navIds = sorted.map(c => c.id);
  uiState.navIndex = uiState.navIds.indexOf(state.selectedId);
}

function moveNav(delta) {
  if (!uiState.navIds.length) return;
  let idx = uiState.navIndex;
  if (idx < 0) idx = 0;
  idx = Math.max(0, Math.min(idx + delta, uiState.navIds.length - 1));
  uiState.navIndex = idx;
  const id = uiState.navIds[idx];
  highlightSelectedCard(id);
  const card = document.querySelector(`.card[data-id="${CSS.escape(id)}"]`);
  card?.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function openNavSelected() {
  const id = uiState.navIds[uiState.navIndex];
  if (id) selectClub(id);
}

function setSectionCollapsed(key, collapsed) {
  uiState.collapsed[key] = collapsed;

  const btn = document.querySelector(`button[data-collapse="${key}"]`);
  if (btn) {
    btn.setAttribute("aria-pressed", String(collapsed));
    btn.textContent = collapsed ? "펼치기" : "접기";
  }

  const map = {
    clubs: ["activeFilters", "cards"],
    recruiting: ["cardsRecruiting"],
    closed: ["cardsClosed"],
    deadline: ["cardsDeadline", "deadlineList"],
  };

  (map[key] || []).forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      if (collapsed) el.classList.add("section-collapsed");
      else el.classList.remove("section-collapsed");
    }
  });
}

function render() {
  const filtered = applyFilters(CLUBS);
  const sorted = sortClubs(filtered);

  setText("resultCount", String(sorted.length));

  renderActiveFilters();
  buildFilters(CLUBS); // rebuild counts to reflect current query/filters

  renderCards("cards", sorted);

  const recruiting = sortClubs(filtered.filter(c => !isClosed(c)));
  renderFlatCards("cardsRecruiting", recruiting);

  const closed = sortClubs(filtered.filter(c => isClosed(c)));
  renderFlatCards("cardsClosed", closed);

  const deadline = sortClubs(filtered.filter(c => !isClosed(c))).slice(0, 8);
  renderFlatCards("cardsDeadline", deadline);
  renderDeadlineList(filtered);

  // Keep section collapse state after rerender
  setSectionCollapsed("clubs", uiState.collapsed.clubs);
  setSectionCollapsed("recruiting", uiState.collapsed.recruiting);
  setSectionCollapsed("closed", uiState.collapsed.closed);
  setSectionCollapsed("deadline", uiState.collapsed.deadline);

  updateNavList(sorted);
}

function setupUI() {
  document.title = CONFIG.SITE_NAME;
  setText("siteName", CONFIG.SITE_NAME);
  setText("siteNameFooter", CONFIG.SITE_NAME);
  setText("year", String(new Date().getFullYear()));

  // Submit link
  const submit = /** @type {HTMLAnchorElement|null} */(document.getElementById("submitLink"));
  if (submit) {
    if (CONFIG.SUBMIT_LINK) {
      submit.href = CONFIG.SUBMIT_LINK;
    } else {
      submit.href = "#";
      submit.addEventListener("click", (e) => {
        e.preventDefault();
        alert("js/config.js에서 SUBMIT_LINK를 설정해 주세요.\n(구글폼 또는 GitHub Issues 링크 등)");
      });
    }
    submit.textContent = CONFIG.SUBMIT_LINK_LABEL || "동아리 등록/수정 요청하기";
  }

  // Copy site link
  const copySite = document.getElementById("copySite");
  copySite?.addEventListener("click", async () => {
    const url = window.location.origin + window.location.pathname;
    try {
      await navigator.clipboard.writeText(url);
      copySite.textContent = "복사됨!";
      setTimeout(() => copySite.textContent = "사이트 링크 복사", 1200);
    } catch {
      window.prompt("아래 링크를 복사하세요:", url);
    }
  });

  // Inputs
  const q = /** @type {HTMLInputElement|null} */(document.getElementById("q"));
  const school = /** @type {HTMLSelectElement|null} */(document.getElementById("school"));
  const sort = /** @type {HTMLSelectElement|null} */(document.getElementById("sort"));
  const groupBy = /** @type {HTMLSelectElement|null} */(document.getElementById("groupBy"));

  const debounced = debounce(() => render(), 160);

  q?.addEventListener("input", () => {
    state.q = q.value.trim();
    const items = computeAutocomplete(state.q);
    renderAutocomplete(items);
    debounced();
  });

  q?.addEventListener("keydown", (e) => {
    if (!uiState.autocompleteOpen) return;
    const max = uiState.autocompleteItems.length;
    if (!max) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      uiState.autocompleteIndex = Math.min(max - 1, uiState.autocompleteIndex + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      uiState.autocompleteIndex = Math.max(0, uiState.autocompleteIndex - 1);
    } else if (e.key === "Enter") {
      if (uiState.autocompleteIndex >= 0) {
        e.preventDefault();
        applyAutocomplete(uiState.autocompleteIndex);
      }
      return;
    } else if (e.key === "Escape") {
      renderAutocomplete([]);
      return;
    } else {
      return;
    }

    const box = document.getElementById("autocomplete");
    if (!box) return;
    box.querySelectorAll(".item").forEach((node, idx) => {
      node.setAttribute("data-active", String(idx === uiState.autocompleteIndex));
    });
  });

  school?.addEventListener("change", () => {
    state.school = school.value;
    syncDrawerFromState();
    render();
  });

  sort?.addEventListener("change", () => {
    state.sort = sort.value;
    syncDrawerFromState();
    render();
  });

  groupBy?.addEventListener("change", () => {
    state.groupBy = groupBy.value;
    syncDrawerFromState();
    render();
  });

  const toggleRecruiting = document.getElementById("toggleRecruiting");
  const toggleClosed = document.getElementById("toggleClosed");

  toggleRecruiting?.addEventListener("click", () => {
    state.recruitingOnly = !state.recruitingOnly;
    if (state.recruitingOnly) state.closedOnly = false;
    syncMainInputsFromState();
    syncDrawerFromState();
    render();
  });

  toggleClosed?.addEventListener("click", () => {
    state.closedOnly = !state.closedOnly;
    if (state.closedOnly) state.recruitingOnly = false;
    syncMainInputsFromState();
    syncDrawerFromState();
    render();
  });

  // Reset
  const reset = document.getElementById("reset");
  reset?.addEventListener("click", () => {
    state.q = "";
    state.school = "";
    state.category = "";
    state.tag = "";
    state.recruitingOnly = false;
    state.closedOnly = false;
    state.sort = "deadline";
    state.groupBy = "none";
    state.selectedId = "";

    uiState.navIndex = -1;

    syncMainInputsFromState();
    syncDrawerFromState();
    renderAutocomplete([]);

    // Clear detail
    const detail = $("#detail");
    if (detail) detail.innerHTML = `<div class="detail-empty"><b>동아리를 선택하면</b><br/>포스터/상세 정보가 표시됩니다.</div>`;
    const sheetDetail = document.getElementById("sheetDetail");
    if (sheetDetail) sheetDetail.innerHTML = "";

    closeSheet();
    closeDrawer();

    const url = new URL(window.location.href);
    url.searchParams.delete("club");
    history.pushState({}, "", url.toString());

    render();
  });

  // Section collapse buttons
  document.querySelectorAll("button[data-collapse]").forEach(btn => {
    btn.addEventListener("click", () => {
      const key = btn.getAttribute("data-collapse");
      if (!key) return;
      const next = !uiState.collapsed[key];
      setSectionCollapsed(key, next);
    });
  });

  // Mobile toolbar / drawer / help
  const mobileToolbar = document.getElementById("mobileToolbar");
  const updateToolbar = () => {
    if (!mobileToolbar) return;
    const show = isMobile();
    mobileToolbar.setAttribute("aria-hidden", show ? "false" : "true");
    mobileToolbar.style.display = show ? "block" : "none";
  };
  updateToolbar();
  window.addEventListener("resize", updateToolbar);

  document.getElementById("openFilters")?.addEventListener("click", () => {
    syncDrawerFromState();
    openDrawer();
  });
  document.getElementById("scrollTop")?.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
  document.getElementById("openHelp")?.addEventListener("click", () => openHelp());
  document.getElementById("helpClose")?.addEventListener("click", () => closeHelp());

  // Help modal backdrop close
  document.getElementById("helpModal")?.addEventListener("click", (e) => {
    const t = /** @type {HTMLElement} */(e.target);
    if (t && t.id === "helpModal") closeHelp();
  });

  // Drawer controls
  document.getElementById("drawerClose")?.addEventListener("click", closeDrawer);
  document.getElementById("drawerBackdrop")?.addEventListener("click", closeDrawer);
  document.getElementById("drawerReset")?.addEventListener("click", () => {
    closeDrawer();
    reset?.dispatchEvent(new Event("click"));
  });
  document.getElementById("drawerApply")?.addEventListener("click", () => {
    const qd = /** @type {HTMLInputElement|null} */(document.getElementById("qDrawer"));
    const sd = /** @type {HTMLSelectElement|null} */(document.getElementById("schoolDrawer"));
    const so = /** @type {HTMLSelectElement|null} */(document.getElementById("sortDrawer"));
    const gd = /** @type {HTMLSelectElement|null} */(document.getElementById("groupByDrawer"));

    if (qd) state.q = qd.value.trim();
    if (sd) state.school = sd.value;
    if (so) state.sort = so.value;
    if (gd) state.groupBy = gd.value;

    syncMainInputsFromState();
    closeDrawer();
    render();
  });

  document.getElementById("recruitingDrawer")?.addEventListener("click", () => {
    state.recruitingOnly = !state.recruitingOnly;
    if (state.recruitingOnly) state.closedOnly = false;
    syncDrawerFromState();
    syncMainInputsFromState();
    render();
  });
  document.getElementById("closedDrawer")?.addEventListener("click", () => {
    state.closedOnly = !state.closedOnly;
    if (state.closedOnly) state.recruitingOnly = false;
    syncDrawerFromState();
    syncMainInputsFromState();
    render();
  });

  // Sheet controls
  document.getElementById("sheetClose")?.addEventListener("click", closeSheet);
  document.getElementById("sheetBackdrop")?.addEventListener("click", closeSheet);

  // Global key shortcuts
  window.addEventListener("keydown", (e) => {
    const activeEl = document.activeElement;
    const isTyping = activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA" || activeEl.getAttribute("contenteditable") === "true");
    if (isTyping && e.key !== "Escape") return;

    if (e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const active = document.activeElement;
      const typing = active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA");
      if (!typing) {
        e.preventDefault();
        q?.focus();
      }
      return;
    }
    if (e.key === "f" && isMobile()) {
      // open filters
      openDrawer();
      return;
    }
    if (e.key === "Escape") {
      // close topmost
      const posterModal = document.getElementById("modal");
      const helpModal = document.getElementById("helpModal");
      if (helpModal?.getAttribute("data-open") === "true") { closeHelp(); return; }
      if (posterModal?.getAttribute("data-open") === "true") {
        document.getElementById("modalClose")?.dispatchEvent(new Event("click"));
        return;
      }
      closeDrawer();
      closeSheet();
      renderAutocomplete([]);
      return;
    }
    if (e.key === "j") { moveNav(+1); return; }
    if (e.key === "k") { moveNav(-1); return; }
    if (e.key === "Enter" && uiState.navIndex >= 0) {
      openNavSelected();
      return;
    }
  });

  // Popstate: open club if present
  window.addEventListener("popstate", () => {
    const url = new URL(window.location.href);
    const id = url.searchParams.get("club") || "";
    if (id) selectClub(id);
  });

  // PWA install
  let deferredInstallPrompt = null;
  window.addEventListener("beforeinstallprompt", (ev) => {
    ev.preventDefault();
    deferredInstallPrompt = ev;
    const btn = document.getElementById("installApp");
    if (btn) btn.style.display = "inline-flex";
  });

  const installBtn = document.getElementById("installApp");
  installBtn?.addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    try {
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
    } catch {}
    deferredInstallPrompt = null;
    if (installBtn) installBtn.style.display = "none";
  });

  closeAutocompleteOnOutside();
}

async function load() {
  setupUI();

  try {
    const res = await fetch(CONFIG.DATA_PATH, { cache: "no-store" });
    if (!res.ok) throw new Error("데이터 로드 실패");
    const data = await res.json();
    CLUBS = (Array.isArray(data) ? data : []).map(normalizeClub);

    autocompleteIndex = buildAutocompleteIndex(CLUBS);

    const recruitingCount = CLUBS.filter(c => !isClosed(c)).length;
    const closedCount = CLUBS.filter(c => isClosed(c)).length;

    setText("countAll", String(CLUBS.length));
    setText("countRecruiting", String(recruitingCount));
    setText("countClosed", String(closedCount));
    setText("summaryHint", CLUBS.length ? "준비 완료" : "데이터가 비어있습니다");

    buildFilters(CLUBS);
    syncMainInputsFromState();
    syncDrawerFromState();

    const url = new URL(window.location.href);
    const id = url.searchParams.get("club");
    if (id) {
      state.selectedId = id;
      selectClub(id);
    }

    render();
  } catch (e) {
    console.error(e);
    setText("summaryHint", "데이터 로드 실패");
    const cards = document.getElementById("cards");
    if (cards) {
      cards.innerHTML = `
        <div class="panel">
          <div class="panel-body">
            <b>데이터를 불러오지 못했습니다.</b>
            <div class="muted" style="margin-top: 6px;">
              data/clubs.json 경로가 올바른지 확인해 주세요.
            </div>
          </div>
        </div>
      `;
    }
  }
}

load();

// Register Service Worker (PWA)
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}
