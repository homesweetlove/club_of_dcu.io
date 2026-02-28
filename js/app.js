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
 *  images?: string[]
 * }} Club */

const $ = (sel) => /** @type {HTMLElement} */(document.querySelector(sel));
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

/** @type {Club[]} */
let CLUBS = [];

const state = {
  q: "",
  category: "",
  tag: "",
  recruitingOnly: false,
  sort: "deadline",
  selectedId: ""
};

function setText(id, text){
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function safeArray(v){
  return Array.isArray(v) ? v : [];
}

function normalizeClub(raw){
  const c = { ...raw };
  c.categories = safeArray(c.categories);
  c.tags = safeArray(c.tags);
  c.images = safeArray(c.images);
  c.recruitEnd = (c.recruitEnd === undefined) ? null : c.recruitEnd;
  c.description = c.description ?? "";
  c.activityTime = c.activityTime ?? "";
  c.location = c.location ?? "";
  c.contactUrl = c.contactUrl ?? "";
  c.logo = c.logo ?? "";
  return c;
}

function parseDate(s){
  if (!s) return null;
  // Expect YYYY-MM-DD
  const m = /^\d{4}-\d{2}-\d{2}$/.exec(s);
  if (!m) return null;
  const d = new Date(s + "T00:00:00");
  return isNaN(d.getTime()) ? null : d;
}

function daysUntil(date){
  const now = new Date();
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // midnight
  const b = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const ms = b.getTime() - a.getTime();
  return Math.round(ms / (1000*60*60*24));
}

function deadlineBadge(club){
  if (!club.recruiting) return `<span class="badge">모집아님</span>`;
  const d = parseDate(club.recruitEnd);
  if (!d) return `<span class="badge badge-warning">마감미정</span>`;
  const diff = daysUntil(d);
  if (diff < 0) return `<span class="badge">마감종료</span>`;
  if (diff <= 3) return `<span class="badge badge-danger">D-${diff}</span>`;
  if (diff <= 10) return `<span class="badge badge-warning">D-${diff}</span>`;
  return `<span class="badge badge-success">모집중</span>`;
}

function formatRecruitEnd(club){
  if (!club.recruiting) return "모집 아님";
  if (!club.recruitEnd) return "마감 미정";
  return club.recruitEnd;
}

function uniqSorted(list){
  return Array.from(new Set(list)).filter(Boolean).sort((a,b)=>a.localeCompare(b));
}

function buildFilters(clubs){
  const categories = uniqSorted(clubs.flatMap(c=>c.categories));
  const tags = uniqSorted(clubs.flatMap(c=>safeArray(c.tags)));

  renderChips("#categoryChips", categories, state.category, (v)=>{
    state.category = (state.category === v) ? "" : v;
    render();
  });

  renderChips("#tagChips", tags, state.tag, (v)=>{
    state.tag = (state.tag === v) ? "" : v;
    render();
  });
}

function renderChips(containerSel, values, activeValue, onClick){
  const el = $(containerSel);
  el.innerHTML = "";
  values.forEach(v=>{
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.dataset.active = (v === activeValue) ? "true" : "false";
    chip.textContent = v;
    chip.addEventListener("click", ()=>onClick(v));
    el.appendChild(chip);
  });
  if (values.length === 0){
    const span = document.createElement("span");
    span.className = "muted";
    span.style.fontSize = "13px";
    span.textContent = "표시할 카테고리/태그가 없습니다.";
    el.appendChild(span);
  }
}

function matchesQuery(club, q){
  if (!q) return true;
  const hay = [
    club.name, club.school, club.oneLine,
    club.description ?? "",
    ...(club.categories ?? []),
    ...(club.tags ?? [])
  ].join(" ").toLowerCase();
  return hay.includes(q.toLowerCase());
}

function applyFilters(clubs){
  return clubs
    .filter(c=>matchesQuery(c, state.q))
    .filter(c=> state.category ? c.categories.includes(state.category) : true)
    .filter(c=> state.tag ? safeArray(c.tags).includes(state.tag) : true)
    .filter(c=> state.recruitingOnly ? c.recruiting === true : true);
}

function sortClubs(clubs){
  const arr = [...clubs];
  if (state.sort === "name"){
    arr.sort((a,b)=> (a.name||"").localeCompare(b.name||""));
    return arr;
  }
  if (state.sort === "school"){
    arr.sort((a,b)=>{
      const s = (a.school||"").localeCompare(b.school||"");
      if (s !== 0) return s;
      return (a.name||"").localeCompare(b.name||"");
    });
    return arr;
  }

  // deadline (default)
  arr.sort((a,b)=>{
    // recruiting first
    if (a.recruiting !== b.recruiting) return a.recruiting ? -1 : 1;

    const da = parseDate(a.recruitEnd);
    const db = parseDate(b.recruitEnd);

    // date first, null last
    if (da && db) return da.getTime() - db.getTime();
    if (da && !db) return -1;
    if (!da && db) return 1;

    // fallback
    const s = (a.school||"").localeCompare(b.school||"");
    if (s !== 0) return s;
    return (a.name||"").localeCompare(b.name||"");
  });
  return arr;
}

function cardHTML(club){
  const cats = club.categories.map(x=>`<span class="badge">${escapeHTML(x)}</span>`).join(" ");
  const tags = safeArray(club.tags).slice(0,3).map(x=>`<span class="badge">${escapeHTML(x)}</span>`).join(" ");
  const moreTag = (safeArray(club.tags).length > 3) ? `<span class="badge">+${safeArray(club.tags).length-3}</span>` : "";
  return `
    <div class="card" data-id="${escapeAttr(club.id)}" role="button" tabindex="0" aria-label="${escapeAttr(club.name)} 상세보기">
      <div class="card-body">
        <div class="card-title">
          <div>
            <h3>${escapeHTML(club.name)}</h3>
            <div class="card-sub">${escapeHTML(club.school)}</div>
          </div>
          <div>${deadlineBadge(club)}</div>
        </div>

        <p class="card-oneLine">${escapeHTML(club.oneLine)}</p>

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

function escapeHTML(s){
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}
function escapeAttr(s){
  return escapeHTML(s).replaceAll("`","&#096;");
}

function renderCards(containerId, clubs){
  const el = document.getElementById(containerId);
  el.innerHTML = clubs.map(cardHTML).join("");
  // card click handlers
  el.querySelectorAll(".card").forEach(card=>{
    const id = card.getAttribute("data-id");
    const open = ()=>selectClub(id);

    card.addEventListener("click", (e)=>{
      // ignore clicks on apply link
      const t = /** @type {HTMLElement} */(e.target);
      if (t && (t.closest('a[data-action="apply"]'))) return;
      open();
    });

    card.addEventListener("keydown", (e)=>{
      if (e.key === "Enter" || e.key === " "){
        e.preventDefault();
        open();
      }
    });

    const btn = card.querySelector('button[data-action="detail"]');
    if (btn) btn.addEventListener("click", (e)=>{
      e.stopPropagation();
      open();
    });
  });

  if (clubs.length === 0){
    el.innerHTML = `<div class="muted" style="padding: 14px 2px;">조건에 맞는 동아리가 없습니다.</div>`;
  }
}

function detailHTML(club){
  const cats = club.categories.map(x=>`<span class="badge">${escapeHTML(x)}</span>`).join(" ");
  const tags = safeArray(club.tags).map(x=>`<span class="badge">${escapeHTML(x)}</span>`).join(" ");

  const recruitInfo = club.recruiting
    ? `<span class="badge badge-success">모집중</span>`
    : `<span class="badge">모집아님</span>`;

  const contact = club.contactUrl
    ? `<a class="btn btn-ghost" href="${escapeAttr(club.contactUrl)}" target="_blank" rel="noopener noreferrer">문의하기</a>`
    : "";

  return `
    <div class="detail-head">
      <h2>${escapeHTML(club.name)}</h2>
      <p class="sub">${escapeHTML(club.school)} · ${recruitInfo} · 마감: ${escapeHTML(formatRecruitEnd(club))}</p>
    </div>

    <div class="detail-body">
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
        <button class="btn btn-link" type="button" id="copyLink">링크 복사</button>
      </div>
    </div>
  `;
}

function selectClub(id){
  const club = CLUBS.find(c=>c.id === id);
  if (!club) return;

  state.selectedId = id;
  const detail = $("#detail");
  detail.innerHTML = detailHTML(club);

  // update URL for share
  const url = new URL(window.location.href);
  url.searchParams.set("club", id);
  history.pushState({club: id}, "", url.toString());

  const btn = document.getElementById("copyLink");
  if (btn){
    btn.addEventListener("click", async ()=>{
      try{
        await navigator.clipboard.writeText(url.toString());
        btn.textContent = "복사됨!";
        setTimeout(()=>btn.textContent = "링크 복사", 1200);
      }catch{
        // fallback
        window.prompt("아래 링크를 복사하세요:", url.toString());
      }
    });
  }
}

function render(){
  const filtered = applyFilters(CLUBS);
  const sorted = sortClubs(filtered);

  setText("resultCount", String(sorted.length));
  renderCards("cards", sorted);

  const recruiting = sortClubs(filtered.filter(c=>c.recruiting));
  renderCards("cardsRecruiting", recruiting);

  const deadline = sortClubs(filtered.filter(c=>c.recruiting)).slice(0, 6);
  renderCards("cardsDeadline", deadline);

  // keep selection alive
  if (state.selectedId){
    const still = CLUBS.find(c=>c.id === state.selectedId);
    if (still) selectClub(state.selectedId);
  }
}

function setupUI(){
  // Site name
  document.title = CONFIG.SITE_NAME;
  setText("siteName", CONFIG.SITE_NAME);
  setText("siteNameFooter", CONFIG.SITE_NAME);
  setText("year", String(new Date().getFullYear()));

  // submit link
  const submit = document.getElementById("submitLink");
  if (CONFIG.SUBMIT_LINK){
    submit.href = CONFIG.SUBMIT_LINK;
  } else {
    submit.href = "#";
    submit.addEventListener("click", (e)=>{
      e.preventDefault();
      alert("js/config.js에서 SUBMIT_LINK를 설정해 주세요.\n(구글폼 또는 GitHub Issues 링크 등)");
    });
  }
  submit.textContent = CONFIG.SUBMIT_LINK_LABEL || "동아리 등록/수정 요청하기";

  const q = /** @type {HTMLInputElement} */(document.getElementById("q"));
  q.addEventListener("input", ()=>{
    state.q = q.value.trim();
    render();
  });

  const sort = /** @type {HTMLSelectElement} */(document.getElementById("sort"));
  sort.addEventListener("change", ()=>{
    state.sort = sort.value;
    render();
  });

  const toggle = document.getElementById("toggleRecruiting");
  toggle.addEventListener("click", ()=>{
    state.recruitingOnly = !state.recruitingOnly;
    toggle.setAttribute("aria-pressed", String(state.recruitingOnly));
    toggle.textContent = state.recruitingOnly ? "모집중만 보기 (ON)" : "모집중만 보기";
    render();
  });

  const reset = document.getElementById("reset");
  reset.addEventListener("click", ()=>{
    state.q = "";
    state.category = "";
    state.tag = "";
    state.recruitingOnly = false;
    state.sort = "deadline";
    state.selectedId = "";

    q.value = "";
    sort.value = "deadline";
    toggle.setAttribute("aria-pressed", "false");
    toggle.textContent = "모집중만 보기";

    buildFilters(CLUBS);
    const detail = $("#detail");
    detail.innerHTML = `<div class="detail-empty"><b>동아리를 선택하면</b><br/>이 영역에 상세 정보가 표시됩니다.</div>`;

    // clear URL param
    const url = new URL(window.location.href);
    url.searchParams.delete("club");
    history.pushState({}, "", url.toString());

    render();
  });

  window.addEventListener("popstate", ()=>{
    // If user goes back/forward, reflect selection.
    const url = new URL(window.location.href);
    const id = url.searchParams.get("club") || "";
    if (id){
      selectClub(id);
    }
  });
}

async function load(){
  setupUI();

  try{
    const res = await fetch(CONFIG.DATA_PATH, { cache: "no-store" });
    if (!res.ok) throw new Error("데이터 로드 실패");
    const data = await res.json();
    CLUBS = (Array.isArray(data) ? data : []).map(normalizeClub);

    // counts
    setText("countAll", String(CLUBS.length));
    setText("countRecruiting", String(CLUBS.filter(c=>c.recruiting).length));
    setText("summaryHint", CLUBS.length ? "데이터 로드 완료" : "데이터가 비어있습니다");

    buildFilters(CLUBS);

    // open from URL
    const url = new URL(window.location.href);
    const id = url.searchParams.get("club");
    if (id){
      state.selectedId = id;
      selectClub(id);
    }

    render();
  } catch (e){
    console.error(e);
    setText("summaryHint", "데이터 로드 실패");
    $("#cards").innerHTML = `
      <div class="panel">
        <div class="panel-body">
          <b>데이터를 불러오지 못했습니다.</b>
          <div class="muted" style="margin-top: 6px;">
            <code>data/clubs.json</code> 경로가 올바른지 확인해 주세요.
          </div>
        </div>
      </div>
    `;
  }
}

load();
 
