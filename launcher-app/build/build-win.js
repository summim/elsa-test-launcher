// 윈도우용 배포본 만들기
// 사용: ELECTRON_WIN_ZIP=<electron-win32-x64.zip> PRISM_WIN_ZIP=<Prism 포터블 zip> INSTANCE_DIR=<인스턴스 폴더> node build/build-win.js
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const asar = require('@electron/asar');
const ResEdit = require('resedit');

const root = path.join(__dirname, '..');
const pkg = require(path.join(root, 'package.json'));
const out = path.join(root, 'dist');
const appDir = path.join(out, 'SumimLauncher');
const stage = path.join(out, 'app-stage');

const need = (k) => {
  if (!process.env[k] || !fs.existsSync(process.env[k])) throw new Error(`${k} 경로가 필요해요`);
  return process.env[k];
};
const electronZip = need('ELECTRON_WIN_ZIP');
const prismZip = need('PRISM_WIN_ZIP');
const instanceSrc = need('INSTANCE_DIR');

function copyDir(src, dst, filter = () => true) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);
    if (!filter(s)) continue;
    if (e.isDirectory()) copyDir(s, d, filter);
    else fs.copyFileSync(s, d);
  }
}

(async () => {
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(appDir, { recursive: true });

  // 1) Electron 윈도우 실행 파일
  execFileSync('unzip', ['-q', electronZip, '-d', appDir]);
  fs.renameSync(path.join(appDir, 'electron.exe'), path.join(appDir, 'SumimLauncher.exe'));
  fs.rmSync(path.join(appDir, 'resources', 'default_app.asar'), { force: true });

  // 2) 앱 코드 → app.asar
  copyDir(path.join(root, 'src'), path.join(stage, 'src'));
  const appPkg = { name: pkg.name, productName: pkg.productName, version: pkg.version, main: pkg.main, author: pkg.author, description: pkg.description };
  fs.writeFileSync(path.join(stage, 'package.json'), JSON.stringify(appPkg, null, 2));
  await asar.createPackage(stage, path.join(appDir, 'resources', 'app.asar'));
  fs.rmSync(stage, { recursive: true, force: true });

  // 3) 아이콘과 파일 정보
  const exePath = path.join(appDir, 'SumimLauncher.exe');
  const exe = ResEdit.NtExecutable.from(fs.readFileSync(exePath), { ignoreCert: true });
  const res = ResEdit.NtExecutableResource.from(exe);
  const ico = ResEdit.Data.IconFile.from(fs.readFileSync(path.join(__dirname, 'icon.ico')));
  const groups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);
  const groupId = groups.length ? groups[0].id : 1;
  const lang = groups.length ? groups[0].lang : 1033;
  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, groupId, lang, ico.icons.map((i) => i.data));
  const vi = ResEdit.Resource.VersionInfo.fromEntries(res.entries)[0];
  const [ma, mi, pa] = pkg.version.split('.').map(Number);
  vi.setFileVersion(ma, mi, pa, 0, lang);
  vi.setProductVersion(ma, mi, pa, 0, lang);
  vi.setStringValues({ lang, codepage: 1200 }, {
    ProductName: pkg.productName,
    FileDescription: pkg.productName,
    CompanyName: pkg.author,
    OriginalFilename: 'SumimLauncher.exe',
    InternalName: 'SumimLauncher',
    LegalCopyright: `${pkg.author}`,
    FileVersion: pkg.version,
    ProductVersion: pkg.version,
  });
  vi.outputToResourceEntries(res.entries);
  res.outputResource(exe);
  fs.writeFileSync(exePath, Buffer.from(exe.generate()));

  // 4) Prism 포터블 + 숨밈 테스트 서버 인스턴스
  const prismDir = path.join(appDir, 'prism');
  fs.mkdirSync(prismDir, { recursive: true });
  execFileSync('unzip', ['-q', prismZip, '-d', prismDir]);
  const inst = path.join(prismDir, 'instances', 'elsa');
  copyDir(instanceSrc, inst, (p) => path.basename(p) !== 'icon.png');
  let cfg = fs.readFileSync(path.join(inst, 'instance.cfg'), 'utf8');
  cfg = cfg.replace(/^name=.*$/m, 'name=숨밈 테스트 서버').replace(/^notes=.*$/m, 'notes=숨밈 테스트 서버 런처가 관리하는 인스턴스예요. 지우지 마세요.');
  fs.writeFileSync(path.join(inst, 'instance.cfg'), cfg);
  fs.mkdirSync(path.join(prismDir, 'icons'), { recursive: true });
  fs.copyFileSync(path.join(instanceSrc, 'icon.png'), path.join(prismDir, 'icons', 'elsa.png'));
  fs.writeFileSync(
    path.join(prismDir, 'prismlauncher.cfg'),
    ['[General]', 'Language=ko', 'AutomaticJavaDownload=true', 'AutomaticJavaSwitch=true', 'UserAskedAboutAutomaticJavaDownload=true', 'SelectedInstance=elsa', ''].join('\n')
  );
  // Prism이 혼자 업데이트 창을 띄우지 않게
  fs.writeFileSync(path.join(prismDir, 'prismlauncher_update.cfg'), '[General]\nauto_check=false\n');

  // 5) 라이선스 안내
  const lic = path.join(appDir, 'licenses');
  fs.mkdirSync(lic, { recursive: true });
  for (const f of ['LICENSE', 'LICENSES.chromium.html']) {
    if (fs.existsSync(path.join(appDir, f))) fs.renameSync(path.join(appDir, f), path.join(lic, f === 'LICENSE' ? 'Electron-LICENSE.txt' : f));
  }
  const ofl = path.join(root, 'node_modules', 'pretendard', 'dist', 'LICENSE.txt');
  if (fs.existsSync(ofl)) fs.copyFileSync(ofl, path.join(lic, 'Pretendard-OFL.txt'));
  fs.writeFileSync(
    path.join(lic, 'Prism-Launcher.txt'),
    'prism 폴더에는 Prism Launcher(GPL-3.0)가 수정 없이 들어 있어요.\n원본 프로그램과 소스 코드: https://github.com/PrismLauncher/PrismLauncher\n라이선스 전문: https://www.gnu.org/licenses/gpl-3.0.html\n'
  );

  fs.copyFileSync(path.join(__dirname, 'README-배포.txt'), path.join(appDir, '사용방법.txt'));

  // 6) 압축
  const zipName = `SumimLauncher-${pkg.version}-win64.zip`;
  // 윈도우 탐색기 "압축 풀기"가 접근 거부를 내지 않도록:
  // - 한글 이름용 UTF-8 표시 (파이썬 zipfile이 자동으로 붙임)
  // - 윈도우 형식 속성(폴더 0x10, 파일 0x20)과 폴더 항목을 직접 기록
  execFileSync('python3', ['-c', `
import os, time, zipfile
now = time.localtime()[:6]
with zipfile.ZipFile(${JSON.stringify(zipName)}, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for r, ds, fs in os.walk('SumimLauncher'):
        ds.sort(); fs.sort()
        zi = zipfile.ZipInfo(r.replace(os.sep, '/') + '/', date_time=now)
        zi.create_system = 0; zi.external_attr = 0x10
        z.writestr(zi, b'')
        for f in fs:
            p = os.path.join(r, f)
            zi = zipfile.ZipInfo(p.replace(os.sep, '/'), date_time=now)
            zi.create_system = 0; zi.external_attr = 0x20; zi.compress_type = zipfile.ZIP_DEFLATED
            with open(p, 'rb') as fh:
                z.writestr(zi, fh.read(), compresslevel=9)
`], { cwd: out });
  console.log(path.join(out, zipName), (fs.statSync(path.join(out, zipName)).size / 1048576).toFixed(1) + ' MB');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
