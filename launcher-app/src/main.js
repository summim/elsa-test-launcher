const { app, BrowserWindow, ipcMain, shell, protocol, net: enet, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { pathToFileURL } = require('url');
const cfg = { ...require('./config') };
// 테스트용: 다른 서버 주소로 바꿔서 확인할 때만 사용
if (process.env.SUMIM_TEST_HOST) cfg.serverHost = process.env.SUMIM_TEST_HOST;
if (process.env.SUMIM_TEST_PORT) cfg.serverPort = Number(process.env.SUMIM_TEST_PORT);
const { ping } = require('./ping');

// ── 경로 ─────────────────────────────────────────────────────────────
// 배포본: <런처폴더>/SumimLauncher.exe 옆에 prism/ 폴더가 있어요.
// 개발 중: SUMIM_PRISM_DIR 환경변수나 ./dev-prism 을 써요.
const baseDir = app.isPackaged ? path.dirname(process.execPath) : path.join(__dirname, '..');
const prismDir = process.env.SUMIM_PRISM_DIR || path.join(baseDir, app.isPackaged ? 'prism' : 'dev-prism');
const prismExe = path.join(prismDir, process.platform === 'win32' ? 'prismlauncher.exe' : 'prismlauncher');
const instanceDir = path.join(prismDir, 'instances', cfg.instanceId);
const gameDir = path.join(instanceDir, 'minecraft');
const settingsFile = () => path.join(app.getPath('userData'), 'launcher-settings.json');

protocol.registerSchemesAsPrivileged([
  { scheme: 'shot', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

let win = null;
let prismProc = null;
let prismMode = null; // 'game' | 'account'

// ── 런처 설정 (최소화 등) ────────────────────────────────────────────
function readLauncherSettings() {
  try {
    return { minimizeOnLaunch: true, ...JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) };
  } catch {
    return { minimizeOnLaunch: true };
  }
}
function writeLauncherSettings(s) {
  fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
  fs.writeFileSync(settingsFile(), JSON.stringify(s, null, 2));
}

// ── Prism INI(instance.cfg) 읽기·쓰기 ────────────────────────────────
function readIni(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([^=\[\];#]+)=(.*)$/);
    if (m) out[m[1].trim()] = m[2];
  }
  return out;
}
function setIniValues(file, values) {
  let lines = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split(/\r?\n/) : ['[General]'];
  if (!lines.some((l) => l.trim() === '[General]')) lines.unshift('[General]');
  for (const [k, v] of Object.entries(values)) {
    const idx = lines.findIndex((l) => l.startsWith(k + '='));
    if (idx >= 0) lines[idx] = `${k}=${v}`;
    else {
      const g = lines.findIndex((l) => l.trim() === '[General]');
      lines.splice(g + 1, 0, `${k}=${v}`);
    }
  }
  fs.writeFileSync(file, lines.join('\n').replace(/\n*$/, '\n'));
}

// ── 계정 (Prism의 accounts.json) ─────────────────────────────────────
function readAccount() {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(prismDir, 'accounts.json'), 'utf8'));
    const list = Array.isArray(data.accounts) ? data.accounts : [];
    const acc = list.find((a) => a.active) || list[0];
    if (!acc || !acc.profile || !acc.profile.name) return null;
    return { name: acc.profile.name, id: acc.profile.id || '', type: acc.type || 'MSA' };
  } catch {
    return null;
  }
}

// ── 원격 데이터 (GitHub) ─────────────────────────────────────────────
async function fetchText(url) {
  const res = await enet.fetch(url + (url.includes('?') ? '&' : '?') + 't=' + Date.now(), { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

function tomlValue(text, key) {
  const m = text.match(new RegExp(`^${key}\\s*=\\s*"((?:[^"\\\\]|\\\\.)*)"`, 'm'));
  return m ? JSON.parse(`"${m[1]}"`) : null;
}

async function loadMods() {
  const index = await fetchText(`${cfg.repoRaw}/index.toml`);
  const entries = [];
  const re = /\[\[files\]\]([\s\S]*?)(?=\n\[\[files\]\]|$)/g;
  let m;
  while ((m = re.exec(index))) {
    const block = m[1];
    const file = tomlValue(block, 'file');
    if (file && /^mods\/.*\.pw\.toml$/.test(file) && /metafile\s*=\s*true/.test(block)) entries.push(file);
  }
  const localMods = new Set(fs.existsSync(path.join(gameDir, 'mods')) ? fs.readdirSync(path.join(gameDir, 'mods')) : []);
  const mods = await Promise.all(
    entries.map(async (f) => {
      const t = await fetchText(`${cfg.repoRaw}/${encodeURI(f)}`);
      const filename = tomlValue(t, 'filename') || '';
      return {
        name: tomlValue(t, 'name') || f,
        filename,
        side: tomlValue(t, 'side') || 'both',
        installed: localMods.has(filename),
      };
    })
  );
  mods.sort((a, b) => a.name.localeCompare(b.name));
  let pack = {};
  try {
    const p = await fetchText(`${cfg.repoRaw}/pack.toml`);
    pack = { version: tomlValue(p, 'version'), minecraft: tomlValue(p, 'minecraft'), fabric: tomlValue(p, 'fabric') };
  } catch {}
  return { mods, pack };
}

async function loadNotices() {
  const text = await fetchText(`${cfg.repoRaw}/launcher-data/notices.json`);
  const data = JSON.parse(text);
  const list = Array.isArray(data) ? data : data.notices || [];
  return list
    .filter((n) => n && n.title)
    .map((n) => ({ date: String(n.date || ''), title: String(n.title), body: String(n.body || ''), tag: String(n.tag || '') }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

async function checkLauncherUpdate() {
  try {
    const info = JSON.parse(await fetchText(`${cfg.repoRaw}/launcher-data/launcher.json`));
    const cur = app.getVersion().split('.').map(Number);
    const next = String(info.version || '0').split('.').map(Number);
    let newer = false;
    for (let i = 0; i < 3; i++) {
      if ((next[i] || 0) !== (cur[i] || 0)) {
        newer = (next[i] || 0) > (cur[i] || 0);
        break;
      }
    }
    return newer ? { version: info.version, url: info.url || cfg.repoPage, notes: info.notes || '' } : null;
  } catch {
    return null;
  }
}

// ── 스크린샷 ─────────────────────────────────────────────────────────
function listScreenshots() {
  const dir = path.join(gameDir, 'screenshots');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => /\.(png|jpe?g)$/i.test(f))
    .map((f) => ({ name: f, time: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.time - a.time)
    .map((s) => ({ ...s, url: `shot://img/${encodeURIComponent(s.name)}` }));
}

// ── Prism 실행 ───────────────────────────────────────────────────────
function prismAvailable() {
  return fs.existsSync(prismExe);
}

function sendState() {
  if (win && !win.isDestroyed()) {
    win.webContents.send('state', { running: !!prismProc, mode: prismMode, account: readAccount() });
  }
}

function runPrism(args, mode) {
  if (prismProc) return { ok: false, reason: 'busy' };
  if (!prismAvailable()) return { ok: false, reason: 'no_prism' };
  prismMode = mode;
  prismProc = spawn(prismExe, ['--dir', prismDir, ...args], { cwd: prismDir, windowsHide: false });
  prismProc.on('error', () => {
    prismProc = null;
    prismMode = null;
    sendState();
  });
  prismProc.on('exit', () => {
    prismProc = null;
    prismMode = null;
    if (win && !win.isDestroyed()) {
      if (win.isMinimized()) win.restore();
    }
    sendState();
  });
  sendState();
  return { ok: true };
}

// ── 창 ───────────────────────────────────────────────────────────────
function createWindow() {
  win = new BrowserWindow({
    width: 1120,
    height: 700,
    minWidth: 1000,
    minHeight: 620,
    frame: false,
    backgroundColor: '#0d1b2a',
    title: '숨밈 테스트 서버 런처',
    icon: nativeImage.createFromPath(path.join(__dirname, 'renderer', 'assets', 'icon.png')),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.once('ready-to-show', () => win.show());
  if (process.env.SUMIM_CAPTURE) require(process.env.SUMIM_CAPTURE_SCRIPT || '../test/capture')(win, process.env.SUMIM_CAPTURE);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.on('maximize', () => win.webContents.send('maximized', true));
  win.on('unmaximize', () => win.webContents.send('maximized', false));

  // 외부 링크는 기본 브라우저로
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
}

app.whenReady().then(() => {
  // 스크린샷 폴더의 그림만 보여주는 전용 주소
  protocol.handle('shot', (req) => {
    const name = decodeURIComponent(new URL(req.url).pathname.replace(/^\//, ''));
    const dir = path.join(gameDir, 'screenshots');
    const file = path.join(dir, path.basename(name));
    if (!file.startsWith(dir) || !fs.existsSync(file)) return new Response('not found', { status: 404 });
    return enet.fetch(pathToFileURL(file).toString());
  });

  // 계정이 바뀌면(로그인 완료 등) 화면에 알려주기
  fs.watchFile(path.join(prismDir, 'accounts.json'), { interval: 1500 }, () => sendState());

  ipcMain.handle('info', () => ({
    serverName: cfg.serverName,
    serverHost: cfg.serverHost,
    minecraftVersion: cfg.minecraftVersion,
    version: app.getVersion(),
    prismFound: prismAvailable(),
    repoPage: cfg.repoPage,
  }));
  ipcMain.handle('state', () => ({ running: !!prismProc, mode: prismMode, account: readAccount() }));
  ipcMain.handle('ping', () => ping(cfg.serverHost, cfg.serverPort));
  ipcMain.handle('notices', () => loadNotices());
  ipcMain.handle('mods', () => loadMods());
  ipcMain.handle('launcherUpdate', () => checkLauncherUpdate());
  ipcMain.handle('screenshots', () => listScreenshots());

  ipcMain.handle('play', () => {
    if (!readAccount()) return { ok: false, reason: 'no_account' };
    const r = runPrism(['--launch', cfg.instanceId, '--server', `${cfg.serverHost}:${cfg.serverPort}`], 'game');
    if (r.ok && readLauncherSettings().minimizeOnLaunch) setTimeout(() => win && win.minimize(), 1200);
    return r;
  });
  ipcMain.handle('account', () => runPrism([], 'account'));

  ipcMain.handle('getSettings', () => {
    const ini = readIni(path.join(instanceDir, 'instance.cfg'));
    const max = ini.OverrideMemory === 'true' && ini.MaxMemAlloc ? Number(ini.MaxMemAlloc) : 4096;
    return { ...readLauncherSettings(), memoryMB: max };
  });
  ipcMain.handle('setSettings', (_e, s) => {
    const cur = readLauncherSettings();
    if (typeof s.minimizeOnLaunch === 'boolean') cur.minimizeOnLaunch = s.minimizeOnLaunch;
    writeLauncherSettings(cur);
    if (Number.isFinite(s.memoryMB)) {
      const mb = Math.max(2048, Math.min(16384, Math.round(s.memoryMB / 512) * 512));
      setIniValues(path.join(instanceDir, 'instance.cfg'), {
        OverrideMemory: 'true',
        MinMemAlloc: '512',
        MaxMemAlloc: String(mb),
      });
    }
    return true;
  });

  ipcMain.handle('openFolder', (_e, which) => {
    const map = {
      game: gameDir,
      shaders: path.join(gameDir, 'shaderpacks'),
      screenshots: path.join(gameDir, 'screenshots'),
      resourcepacks: path.join(gameDir, 'resourcepacks'),
    };
    const dir = map[which];
    if (!dir) return false;
    fs.mkdirSync(dir, { recursive: true });
    shell.openPath(dir);
    return true;
  });
  ipcMain.handle('openShot', (_e, name) => {
    const file = path.join(gameDir, 'screenshots', path.basename(String(name)));
    if (fs.existsSync(file)) shell.openPath(file);
  });
  ipcMain.handle('openExternal', (_e, url) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
  });

  ipcMain.on('win', (_e, action) => {
    if (!win) return;
    if (action === 'min') win.minimize();
    if (action === 'max') (win.isMaximized() ? win.unmaximize() : win.maximize());
    if (action === 'close') win.close();
  });

  createWindow();
});

app.on('window-all-closed', () => app.quit());
