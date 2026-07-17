const DATA_URL = "data/kakao.txt";
const GOAL_COUNT = 10;

const state = {
  month: "",
  selectedName: "전체",
  events: [],
  months: []
};

const $ = (id) => document.getElementById(id);

const monthLabel = (month) => {
  const [year, m] = month.split("-");
  return `${year}년 ${Number(m)}월`;
};

async function loadEvents() {
  const response = await fetch(`${DATA_URL}?v=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`데이터 파일을 불러오지 못했습니다. (${response.status})`);
  }

  const text = await response.text();
  return uniqueDailyEvents(parseKakaoText(text));
}

function parseKakaoText(text) {
  const events = [];
  let currentDate = "";

  text.split(/\r?\n/).forEach((line) => {
    const dateMatch = line.match(/^-+\s*(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/);
    if (dateMatch) {
      const [, year, month, day] = dateMatch;
      currentDate = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
      return;
    }

    if (!currentDate || !line.includes("사진")) return;

    const messageMatch = line.match(/^\[(.+?)\]\s*\[(\d{1,2}:\d{2})\]\s*(.*)$/);
    if (!messageMatch) return;

    const [, name, time, content] = messageMatch;
    if (!content.includes("사진")) return;

    events.push({
      date: currentDate,
      name: name.trim(),
      time,
      content: content.trim()
    });
  });

  return events;
}

function uniqueDailyEvents(events) {
  const byPersonDate = new Map();

  events.forEach((event) => {
    const key = `${event.date}::${event.name}`;
    if (!byPersonDate.has(key)) {
      byPersonDate.set(key, { ...event, rawCount: 1 });
      return;
    }

    const existing = byPersonDate.get(key);
    existing.rawCount += 1;
    existing.content = `${existing.content} / ${event.content}`;
  });

  return [...byPersonDate.values()].sort((a, b) =>
    a.date.localeCompare(b.date) ||
    a.name.localeCompare(b.name, "ko") ||
    a.time.localeCompare(b.time)
  );
}

function eventsForMonth(month) {
  return state.events.filter((event) => event.date.startsWith(month));
}

function countsByName(monthEvents) {
  const counts = new Map();
  monthEvents.forEach((event) => counts.set(event.name, (counts.get(event.name) || 0) + 1));
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ko"));
}

function renderMonthSelect() {
  $("monthSelect").innerHTML = state.months
    .map((month) => `<option value="${month}">${monthLabel(month)}</option>`)
    .join("");
  $("monthSelect").value = state.month;
  $("monthSelect").addEventListener("change", (event) => {
    state.month = event.target.value;
    render();
  });
}

function renderPeople(monthEvents, counts) {
  const rows = [{ name: "전체", count: monthEvents.length }, ...counts];
  $("personList").innerHTML = rows.map((item) => {
    const active = item.name === state.selectedName ? " active" : "";
    const ok = item.count >= GOAL_COUNT && item.name !== "전체" ? " ok" : "";
    return `<button class="person${active}" data-name="${escapeHtml(item.name)}">
      <span class="person-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span>
      <span class="badge${ok}">${item.count}</span>
    </button>`;
  }).join("");

  document.querySelectorAll(".person").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedName = button.dataset.name;
      render();
    });
  });
}

function renderCalendar(monthEvents) {
  const selectedEvents = state.selectedName === "전체"
    ? monthEvents
    : monthEvents.filter((event) => event.name === state.selectedName);
  const dateMap = new Map();
  selectedEvents.forEach((event) => {
    if (!dateMap.has(event.date)) dateMap.set(event.date, []);
    dateMap.get(event.date).push(event);
  });

  const [year, month] = state.month.split("-").map(Number);
  const firstDay = new Date(year, month - 1, 1).getDay();
  const lastDate = new Date(year, month, 0).getDate();
  const cells = [];

  for (let i = 0; i < firstDay; i++) cells.push('<div class="day empty"></div>');

  for (let day = 1; day <= lastDate; day++) {
    const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const list = dateMap.get(date) || [];
    const className = list.length > 1 ? "day multi" : list.length === 1 ? "day hit" : "day";
    const books = list.slice(0, 8).map(() => '<span class="book-mark" aria-hidden="true">📚</span>').join("");
    const label = list.length ? `<span class="day-count">${list.length}회</span>` : "";
    const title = list.length
      ? ` title="${escapeHtml(list.map((event) => `${event.name} ${event.time}`).join("\n"))}"`
      : "";
    cells.push(`<div class="${className}"${title}>
      <span class="num">${day}</span>
      <div class="names">${books}</div>
      ${label}
    </div>`);
  }

  $("calendar").innerHTML = cells.join("");
}

function renderRanking(counts) {
  $("ranking").innerHTML = counts.length
    ? counts.map((item, index) => rankRow(index + 1, item)).join("")
    : '<div class="empty-state">이 달에는 인증 기록이 없습니다.</div>';

  const achievers = counts.filter((item) => item.count >= GOAL_COUNT);
  $("achievers").innerHTML = achievers.length
    ? achievers.map((item, index) => rankRow(index + 1, item, true)).join("")
    : `<div class="empty-state">아직 ${GOAL_COUNT}회 이상 달성자가 없습니다.</div>`;
}

function rankRow(rank, item, achieved = false) {
  return `<div class="rank-row">
    <span class="rank-no">${rank}</span>
    <span class="rank-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span>
    <span class="${achieved ? "goal" : ""}">${item.count}회</span>
  </div>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderEmpty(message) {
  $("pageTitle").textContent = "인증 현황";
  $("rangeText").textContent = message;
  $("monthSelect").innerHTML = "";
  $("monthTotal").textContent = "0";
  $("goalTotal").textContent = "0";
  $("personList").innerHTML = "";
  $("calendar").innerHTML = '<div class="empty-state">표시할 인증 기록이 없습니다.</div>';
  $("ranking").innerHTML = '<div class="empty-state">표시할 인증 기록이 없습니다.</div>';
  $("achievers").innerHTML = '<div class="empty-state">표시할 인증 기록이 없습니다.</div>';
}

function render() {
  const monthEvents = eventsForMonth(state.month);
  const counts = countsByName(monthEvents);
  if (state.selectedName !== "전체" && !counts.some((item) => item.name === state.selectedName)) {
    state.selectedName = "전체";
  }

  $("pageTitle").textContent = `${monthLabel(state.month)} 인증 현황`;
  $("rangeText").textContent = `총 ${state.events.length}회 · ${state.months[0]}부터 ${state.months[state.months.length - 1]}까지`;
  $("calendarTitle").textContent = state.selectedName === "전체" ? "전체 캘린더" : `${state.selectedName} 캘린더`;
  $("selectedText").textContent = state.selectedName === "전체" ? "전체 인증 보기" : `${state.selectedName} 선택 중`;
  $("monthTotal").textContent = monthEvents.length;
  $("goalTotal").textContent = counts.filter((item) => item.count >= GOAL_COUNT).length;

  renderPeople(monthEvents, counts);
  renderCalendar(monthEvents);
  renderRanking(counts);
}

async function init() {
  try {
    state.events = await loadEvents();
    state.months = [...new Set(state.events.map((event) => event.date.slice(0, 7)))].sort();
    state.month = state.months[state.months.length - 1] || "";

    if (!state.month) {
      renderEmpty("data/kakao.txt에서 사진 인증 기록을 찾지 못했습니다.");
      return;
    }

    renderMonthSelect();
    render();
  } catch (error) {
    renderEmpty(error.message);
  }
}

init();
