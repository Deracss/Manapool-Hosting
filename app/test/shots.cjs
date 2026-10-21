// Screenshots for visual review. Usage: xvfb-run -a npx electron --no-sandbox test/shots.cjs <outDir> [steps]
const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const out = process.argv[process.argv.length - 1];
fs.mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1600, height: 960, show: true });
  const errors = [];
  win.webContents.on('console-message', (_e, level, msg) => level >= 2 && errors.push(msg));
  await win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  const js = (c) => win.webContents.executeJavaScript(c);
  const shot = async (name) => { await sleep(300); fs.writeFileSync(path.join(out, `${name}.png`), (await win.capturePage()).toPNG()); console.log('shot', name); };
  const click = (t) => js(`(() => { const b = [...document.querySelectorAll('button')].find(b => b.textContent.trim().startsWith(${JSON.stringify(t)}) && !b.disabled); if (b) { b.click(); return true; } return false; })()`);
  const has = (t) => js(`document.body.innerText.includes(${JSON.stringify(t)})`);
  try {
    const mode = process.env.SHOTS || 'builder';
    if (mode === 'builder') {
      await click('Deck builder');
      await sleep(500);
      await shot('builder');
    } else {
      await click('Play vs bots');
      await sleep(200);
      if (process.env.DECK) await click(process.env.DECK);
      await click('Start game');
      await sleep(400);
      for (let k = 0; k < 40 && !(await click('Keep')); k++) await sleep(150);
      for (let i = 0; i < 300 && !(await has('End Main phase')); i++) await sleep(100);
      await js(`window.__manapool.speed && window.__manapool.speed('fast')`);
      await shot('t0');
      // let a few turns pass: end main phase, pass when asked, never block
      for (let n = 1; n <= Number(process.env.TURNS || 3); n++) {
        await click('End Main phase');
        for (let i = 0; i < 600; i++) {
          if (await has('End Main phase')) break;
          if (await click("Don't block")) continue;
          if (await click('No boost')) continue;
          if (await click('Keep')) continue;
          if (await click('Accept')) continue;
          if (await click('Pass')) continue;
          if (await click('Choose nothing')) continue;
          if (await click('Done')) continue;
          if (await click('Yes')) continue;
          if (n === 2 && i === 20) await shot('mid-bots');
          await sleep(100);
        }
        // play something: charge first card, then try to play each card
        await js(`(() => { const b = document.querySelector('.hand .card-box'); b && b.click(); })()`);
        await sleep(150);
        await click('Charge');
        await sleep(600);
        for (let k = 0; k < 6; k++) {
          await js(`(() => { const b = [...document.querySelectorAll('.hand .card-box.ring-select')][${0}]; b && b.click(); })()`);
          await sleep(150);
          if (!(await click('Play'))) { await js(`document.body.click()`); break; }
          await sleep(1800);
          for (let q = 0; q < 10 && ((await click('Choose')) || (await click('Yes')) || (await click('Done')) || (await click('Pass'))); q++) await sleep(300);
        }
        await shot(`turn${n}`);
      }
    }
  } catch (e) { console.log('ERROR', e); }
  console.log('console errors:', errors.length, errors.slice(0, 3));
  app.quit();
});
