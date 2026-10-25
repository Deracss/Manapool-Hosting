// Drives the real app in Electron (under a virtual display), clicking through screens and saving screenshots.
// Usage: xvfb-run -a npx electron test/e2e.cjs <outDir>
const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const out = process.argv[process.argv.length - 1];
fs.mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1440, height: 900, show: true, webPreferences: { contextIsolation: true } });
  win.webContents.on('console-message', (_e, level, msg) => {
    if (level >= 2) errors.push(msg);
  });
  await win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  const js = (code) => win.webContents.executeJavaScript(code);
  const shot = async (name) => {
    await sleep(300);
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(out, `${name}.png`), img.toPNG());
    console.log('shot', name);
  };
  const click = (text) =>
    js(`(() => { const b = [...document.querySelectorAll('button')].find(b => b.textContent.trim().startsWith(${JSON.stringify(text)}) && !b.disabled); if (b) { b.click(); return true; } return false; })()`);
  const has = (text) => js(`document.body.innerText.includes(${JSON.stringify(text)})`);
  const waitFor = async (text, ms = 30000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      if (await has(text)) return true;
      await sleep(150);
    }
    return false;
  };

  try {
    await js(`localStorage.clear()`);
    await shot('01-menu');
    await click('Deck builder');
    await sleep(400);
    await shot('02-builder');
    await click('Goblin'); // tribe filter chip (first button starting with Goblin)
    await sleep(300);
    await shot('03-builder-goblins');
    await js(`document.querySelector('[aria-label="Back to main menu"]').click()`);
    await sleep(200);
    await click('Play vs bots');
    await sleep(300);
    await shot('04-setup');
    await click('Start game');
    await waitFor('Your opening hand');
    await shot('05-mulligan');
    for (let k = 0; k < 120; k++) { await js(`(() => { const g = window.__manapool.state(); if (g.roll && !g.roll.done && g.roll.contenders.includes(0) && g.roll.results[0] === null) window.__manapool.act({ type: 'roll', player: 0 }); })()`); if ((await click('To the opening hands')) || (await click('Keep'))) break; await sleep(150); } for (let k = 0; k < 40 && !(await click('Keep')); k++) await sleep(150);
    console.log('my main?', await waitFor('End Main phase'));
    await shot('06-my-main');
    // Click the first glowing hand card and look at its options.
    await js(`(() => { const b = document.querySelector('.hand .card-box.ring-select'); if (b) b.click(); })()`);
    await sleep(300);
    await shot('07-hand-popover');
    const played = await click('Play');
    if (!played) await click('Charge');
    await sleep(800);
    await shot('08-after-play');
    // Charge another card if possible, then end the turn.
    await js(`(() => { const b = document.querySelector('.hand .card-box'); if (b) b.click(); })()`);
    await sleep(200);
    await click('Charge');
    await sleep(500);
    await click('End Main phase');
    // Play several rounds: block nothing, boost nothing, keep ending turns.
    let shotsTaken = { block: false, boost: false, priority: false };
    const t0 = Date.now();
    while (Date.now() - t0 < 120000) {
      if (await has('Your opening hand')) for (let k = 0; k < 120; k++) { await js(`(() => { const g = window.__manapool.state(); if (g.roll && !g.roll.done && g.roll.contenders.includes(0) && g.roll.results[0] === null) window.__manapool.act({ type: 'roll', player: 0 }); })()`); if ((await click('To the opening hands')) || (await click('Keep'))) break; await sleep(150); } for (let k = 0; k < 40 && !(await click('Keep')); k++) await sleep(150);
      if (await has('attacks you') && !shotsTaken.block) {
        await shot('09-being-attacked');
        shotsTaken.block = true;
      }
      if (await has('attacks you') && await js(`!!document.querySelector('.mine .card-box.ring-select')`)) {
        await js(`(() => { const b = document.querySelector('.mine .card-box.ring-select'); if (b) b.click(); })()`);
        await sleep(200);
        await shot('09b-blocker-chosen');
        if (await click('Block with')) continue;
      }
      if (await click("Don't block")) continue;
      if (await click('Yes')) continue;
      if (await has('Boost your') && !shotsTaken.boost) {
        await js(`(() => { const b = document.querySelector('.mine .card-box.ring-select'); if (b) b.click(); })()`);
        await shot('10-boost-prompt');
        shotsTaken.boost = true;
      }
      if (await click('No boost')) continue;
      if (await has('Choose nothing')) await click('Choose nothing');
      else if (await has('Choose a Goblin') || await js(`!!document.querySelector('.modal .choices .card-box')`)) {
        await js(`(() => { const b = document.querySelector('.modal .choices .card-box'); if (b) b.click(); })()`);
        await sleep(100);
        await click('Choose');
      }
      if (await has('You win') || await has(' wins')) break;
      if (await has('End Main phase')) {
        // On my turn: play the first playable card, attack with the first ready creature, then end.
        await js(`(() => { const b = document.querySelector('.hand .card-box.ring-select'); if (b) b.click(); })()`);
        await sleep(150);
        if (!(await click('Play'))) await click('Charge');
        await sleep(400);
        if (await js(`!!document.querySelector('.prompt h2') && document.querySelector('.prompt h2').textContent.includes('Choose a target')`)) {
          await js(`(() => { const b = document.querySelector('.card-box.ring-select'); if (b) b.click(); })()`);
          await sleep(300);
        }
        const attackNow = process.env.E2E_ATTACK === '1';
        if (attackNow) await js(`(() => { const b = document.querySelector('.mine .card-box.ring-select'); if (b) b.click(); })()`);
        await sleep(150);
        if (attackNow && await click('Attack')) {
          await sleep(400);
          if (!shotsTaken.priority) {
            await shot('11-my-attack');
            shotsTaken.priority = true;
          }
          continue;
        }
        await click('End Main phase');
      }
      if (await click('Pass')) continue;
      await sleep(200);
    }
    await shot('12-later');
    console.log('turn text:', await js(`document.querySelector('.topbar').innerText`));
    console.log('game over:', await has('Play again'));
  } catch (e) {
    console.log('E2E ERROR', e);
  }
  console.log('console errors:', JSON.stringify(errors.slice(0, 20)));
  app.quit();
});
