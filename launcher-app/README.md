# 숨밈 테스트 서버 런처 (소스)

Electron으로 만든 런처 화면이에요. 로그인과 게임 실행은 함께 들어 있는 Prism Launcher가 처리해요.

- `src/config.js` — 서버 주소, GitHub 주소
- `src/main.js` — Prism 실행, 서버 상태, 공지·모드 불러오기
- `src/renderer/` — 화면 (HTML, CSS, JS)
- `build/build-win.js` — 윈도우 배포본 만들기

## 윈도우 배포본 만들기

```
npm install
ELECTRON_WIN_ZIP=electron-v45.0.0-win32-x64.zip \
PRISM_WIN_ZIP=PrismLauncher-Windows-MSVC-Portable-11.1.1.zip \
INSTANCE_DIR=instance \
npm run build:win
```

새 버전을 낼 때는 `package.json`의 version을 올리고, 저장소의 `launcher-data/launcher.json` version도 같이 올리면 기존 런처에 새 버전 알림이 떠요.
