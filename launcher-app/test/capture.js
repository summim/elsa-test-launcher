// 개발용: 각 화면을 PNG로 저장하고 종료 (배포본에는 포함하지 않음)
const fs = require('fs');
const path = require('path');
module.exports = (win, outDir) => {
  fs.mkdirSync(outDir, { recursive: true });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const snap = async (name) => {
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(outDir, name + '.png'), img.toPNG());
  };
  win.webContents.once('did-finish-load', async () => {
    await wait(4500);
    await snap('1-play');
    for (const p of ['notices', 'mods', 'shots', 'settings']) {
      await win.webContents.executeJavaScript(`document.querySelector('.rail__item[data-page="${p}"]').click()`);
      await wait(2500);
      await snap('2-' + p);
    }
    await win.webContents.executeJavaScript(`document.querySelector('.rail__item[data-page="play"]').click(); document.querySelector('#playBtn').click()`);
    await wait(1500);
    win.restore();
    await wait(800);
    await snap('3-running');
    win.setSize(940, 600);
    await wait(1200);
    await snap('4-narrow');
    require('electron').app.quit();
  });
};
