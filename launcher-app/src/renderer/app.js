'use strict';
const L = window.launcher;
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

const state = { info: null, running: false, mode: null, account: null, server: null, notices: null, mods: null };

function el(tag, attrs = {}, children = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else n.setAttribute(k, v);
  }
  for (const c of [].concat(children)) if (c) n.append(c);
  return n;
}

function formatDate(d) {
  const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}. ${Number(m[2])}. ${Number(m[3])}.` : d;
}

// ── 창 버튼 ───────────────────────────────────────────
$$('[data-win]').forEach((b) => b.addEventListener('click', () => L.win(b.dataset.win)));
L.onMaximized((v) => document.body.classList.toggle('is-max', v));

// ── 페이지 전환 ───────────────────────────────────────
function showPage(name) {
  $$('.rail__item').forEach((b) => b.classList.toggle('is-active', b.dataset.page === name));
  $$('.page').forEach((p) => p.classList.toggle('is-active', p.dataset.page === name));
  if (name === 'notices') {
    loadNotices();
    markNoticesRead();
  }
  if (name === 'mods') loadMods();
  if (name === 'shots') loadShots();
  if (name === 'settings') loadSettings();
}
$$('.rail__item').forEach((b) => b.addEventListener('click', () => showPage(b.dataset.page)));
$('#noticePeek').addEventListener('click', () => showPage('notices'));

// ── 계정 ──────────────────────────────────────────────
function renderAccount() {
  const acc = state.account;
  const box = $('#account');
  const av = $('#accAvatar');
  box.classList.toggle('is-guest', !acc);
  if (acc) {
    $('#accName').textContent = acc.name;
    $('#accSub').textContent = '정품 계정';
    $('#accBtn').textContent = '계정 관리';
    const initial = acc.name.slice(0, 1).toUpperCase();
    if (av.dataset.for !== acc.id + acc.name) {
      av.dataset.for = acc.id + acc.name;
      av.replaceChildren();
      if (acc.id) {
        const img = el('img', { src: `https://mc-heads.net/avatar/${encodeURIComponent(acc.id)}/72`, alt: '' });
        img.addEventListener('error', () => av.replaceChildren(initial));
        av.append(img);
      } else av.append(initial);
    }
    $('#setAccText').textContent = `${acc.name} 계정으로 로그인돼 있어요. 계정을 바꿀 때 Prism 창이 열려요.`;
  } else {
    $('#accName').textContent = '로그인 필요';
    $('#accSub').textContent = 'Microsoft 계정';
    $('#accBtn').textContent = 'Microsoft 로그인';
    av.dataset.for = '';
    av.replaceChildren('?');
    $('#setAccText').textContent = '로그인하면 게임을 시작할 수 있어요. 로그인은 Prism 창에서 진행돼요.';
  }
}

async function openAccount() {
  const r = await L.account();
  if (r.ok) {
    setMsg(
      state.account
        ? 'Prism 창에서 계정을 관리하세요. 창을 닫으면 여기로 돌아와요.'
        : 'Prism 창에서 Microsoft 로그인을 마치고, 창을 닫으면 바로 게임을 시작할 수 있어요.'
    );
  } else handleFail(r.reason);
}
$('#accBtn').addEventListener('click', openAccount);
$('#setAccBtn').addEventListener('click', openAccount);

// ── 실행 상태 ─────────────────────────────────────────
let msgTimer = null;
function setMsg(text, warn = false, sticky = false) {
  const m = $('#dockMsg');
  m.textContent = text;
  m.classList.toggle('is-warn', warn);
  clearTimeout(msgTimer);
  if (text && !sticky) msgTimer = setTimeout(() => (m.textContent = ''), 9000);
}

function handleFail(reason) {
  if (reason === 'no_account') {
    setMsg('먼저 Microsoft 계정으로 로그인해 주세요. 왼쪽 아래 로그인 버튼을 누르면 돼요.', true);
  } else if (reason === 'busy') {
    setMsg('Prism이 이미 실행 중이에요. 열린 창을 닫은 뒤 다시 눌러 주세요.', true);
  } else if (reason === 'no_prism') {
    setMsg('런처 폴더 안의 prism 폴더를 찾을 수 없어요. 압축을 다시 풀어 주세요.', true, true);
  } else {
    setMsg('실행하지 못했어요. 런처를 껐다 켠 뒤 다시 시도해 주세요.', true);
  }
}

function applyState(s) {
  const wasRunning = state.running;
  state.running = s.running;
  state.mode = s.mode;
  state.account = s.account;
  renderAccount();

  const btn = $('#playBtn');
  const label = btn.querySelector('.play__label');
  btn.classList.toggle('is-running', s.running);
  if (s.running && s.mode === 'game') {
    label.textContent = '게임 실행 중';
    btn.disabled = true;
    setMsg('게임을 준비하고 있어요. 처음에는 파일을 받느라 몇 분 걸릴 수 있어요.', false, true);
  } else if (s.running && s.mode === 'account') {
    label.textContent = 'Prism 창 열림';
    btn.disabled = true;
  } else {
    label.textContent = '게임 시작';
    btn.disabled = false;
    if (wasRunning) {
      setMsg('');
      refreshMods(); // 게임을 끄면 설치된 모드 상태 다시 확인
    }
  }
}
L.onState(applyState);

$('#playBtn').addEventListener('click', async () => {
  if (state.running) return;
  if (!state.account) {
    handleFail('no_account');
    return;
  }
  const r = await L.play();
  if (!r.ok) handleFail(r.reason);
});

// ── 서버 상태 ─────────────────────────────────────────
async function refreshServer() {
  const s = await L.ping();
  state.server = s;
  const box = $('#status');
  box.classList.toggle('is-online', !!s.online);
  box.classList.toggle('is-offline', !s.online);
  if (s.online) {
    $('#statusMain').textContent = `접속자 ${s.players} / ${s.max}명`;
    $('#statusSub').textContent = `온라인, 응답 ${s.latency}ms`;
  } else {
    $('#statusMain').textContent = '서버 꺼짐';
    $('#statusSub').textContent = '서버가 켜지면 자동으로 표시돼요';
  }
}

// ── 공지 ──────────────────────────────────────────────
const READ_KEY = 'lastReadNotice';
function safeGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function safeSet(k, v) { try { localStorage.setItem(k, v); } catch {} }

function markNoticesRead() {
  if (state.notices && state.notices[0]) safeSet(READ_KEY, state.notices[0].date + state.notices[0].title);
  $('#noticeDot').hidden = true;
}

async function fetchNotices() {
  try {
    state.notices = await L.notices();
  } catch {
    state.notices = null;
  }
  const top = state.notices && state.notices[0];
  $('#noticePeek').hidden = !top;
  if (top) {
    $('#peekTitle').textContent = top.title;
    $('#peekDate').textContent = formatDate(top.date);
    $('#noticeDot').hidden = safeGet(READ_KEY) === top.date + top.title;
  }
}

async function loadNotices() {
  const list = $('#notices');
  if (!state.notices) await fetchNotices();
  list.replaceChildren();
  if (!state.notices) {
    list.append(el('li', { class: 'empty' }, [el('strong', { text: '공지를 불러오지 못했어요' }), '인터넷 연결을 확인한 뒤 다시 열어 주세요.']));
    return;
  }
  if (!state.notices.length) {
    list.append(el('li', { class: 'empty' }, [el('strong', { text: '아직 공지가 없어요' })]));
    return;
  }
  for (const n of state.notices) {
    const h = el('h3', {}, [n.title, n.tag ? el('span', { class: 'notice__tag', text: n.tag }) : null]);
    list.append(el('li', { class: 'notice' }, [el('time', { text: formatDate(n.date) }), el('div', {}, [h, n.body ? el('p', { text: n.body }) : null])]));
  }
}

// ── 모드 ──────────────────────────────────────────────
async function refreshMods() {
  try {
    state.mods = await L.mods();
  } catch {
    state.mods = null;
  }
  const chip = $('#chipMods');
  chip.className = 'chip';
  if (!state.mods) {
    chip.textContent = '모드 목록 확인 불가';
    return;
  }
  const { mods } = state.mods;
  const missing = mods.filter((m) => !m.installed).length;
  chip.textContent = `모드 ${mods.length}개`;
  const old = $('#chipSync');
  if (old) old.remove();
  const sync = el('li', { id: 'chipSync', class: missing ? 'chip chip--warn' : 'chip chip--ok', text: missing ? '시작하면 업데이트' : '최신 상태' });
  chip.after(sync);
}

async function loadMods() {
  const box = $('#mods');
  if (!state.mods) await refreshMods();
  box.replaceChildren();
  if (!state.mods) {
    box.append(el('div', { class: 'empty' }, [el('strong', { text: '모드 목록을 불러오지 못했어요' }), '인터넷 연결을 확인한 뒤 다시 열어 주세요.']));
    return;
  }
  const { mods, pack } = state.mods;
  if (pack && pack.minecraft) {
    $('#modsLead').textContent = `마인크래프트 ${pack.minecraft}, Fabric ${pack.fabric || ''} 기준이에요. 게임을 시작하면 이 목록에 맞춰 자동으로 설치·업데이트돼요.`;
  }
  for (const m of mods) {
    box.append(
      el('div', { class: 'row', role: 'row' }, [
        el('strong', { text: m.name }),
        el('code', { text: m.filename, title: m.filename }),
        el('span', { class: m.installed ? 'pill pill--ok' : 'pill pill--wait', text: m.installed ? '설치됨' : '시작하면 설치' }),
      ])
    );
  }
}

// ── 스크린샷 ──────────────────────────────────────────
async function loadShots() {
  const box = $('#shots');
  const shots = await L.screenshots();
  box.replaceChildren();
  if (!shots.length) {
    box.append(el('div', { class: 'empty' }, [el('strong', { text: '아직 찍은 사진이 없어요' }), '게임에서 F2를 누르면 스크린샷이 여기에 모여요.']));
    return;
  }
  for (const s of shots.slice(0, 120)) {
    const d = new Date(s.time);
    const b = el('button', { class: 'shot', title: s.name }, [
      el('img', { src: s.url, alt: s.name, loading: 'lazy' }),
      el('span', { text: d.toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }) }),
    ]);
    b.addEventListener('click', () => L.openShot(s.name));
    box.append(b);
  }
}

// ── 설정 ──────────────────────────────────────────────
function memLabel(mb) {
  return `${(mb / 1024).toFixed(mb % 1024 ? 1 : 0)} GB`;
}
async function loadSettings() {
  const s = await L.getSettings();
  $('#mem').value = s.memoryMB;
  $('#memOut').textContent = memLabel(s.memoryMB);
  $('#minimize').checked = !!s.minimizeOnLaunch;
}
$('#mem').addEventListener('input', (e) => ($('#memOut').textContent = memLabel(Number(e.target.value))));
$('#mem').addEventListener('change', (e) => L.setSettings({ memoryMB: Number(e.target.value) }));
$('#minimize').addEventListener('change', (e) => L.setSettings({ minimizeOnLaunch: e.target.checked }));
$$('[data-folder]').forEach((b) => b.addEventListener('click', () => L.openFolder(b.dataset.folder)));
$('#repoBtn').addEventListener('click', () => state.info && L.openExternal(state.info.repoPage));

// ── 런처 업데이트 알림 ────────────────────────────────
async function checkUpdate() {
  const u = await L.launcherUpdate();
  if (!u) return;
  $('#updateText').textContent = `새 런처 ${u.version} 버전이 나왔어요.`;
  $('#updateBanner').hidden = false;
  $('#updateBtn').onclick = () => L.openExternal(u.url);
}

// ── 시작 ──────────────────────────────────────────────
(async function init() {
  state.info = await L.info();
  $('#statusSub').textContent = state.info.serverHost;
  $('#aboutText').textContent = `버전 ${state.info.version}. 로그인과 게임 실행은 함께 들어 있는 Prism Launcher가 처리해요.`;
  applyState(await L.state());
  if (!state.info.prismFound) handleFail('no_prism');

  refreshServer();
  setInterval(refreshServer, 30000);
  fetchNotices();
  setInterval(fetchNotices, 10 * 60 * 1000);
  refreshMods();
  checkUpdate();
})();
