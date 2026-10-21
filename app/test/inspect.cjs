// Checks the Tab inspect popup: hover a card with the real mouse, hold Tab, screenshot, release.
// Usage: xvfb-run -a npx electron test/inspect.cjs <outDir>
const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const out = process.argv[process.argv.length - 1];
fs.mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1440, height: 900, show: true });
  const errors = [];
  win.webContents.on('console-message', (_e, level, msg) => level >= 2 && errors.push(msg));
  await win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  const js = (c) => win.webContents.executeJavaScript(c);
  const shot = async (name) => {
    await sleep(250);
    fs.writeFileSync(path.join(out, `${name}.png`), (await win.capturePage()).toPNG());
    console.log('shot', name);
  };
  const click = (t) => js(`(() => { const b = [...document.querySelectorAll('button')].find(b => b.textContent.trim().startsWith(${JSON.stringify(t)}) && !b.disabled); if (b) { b.click(); return true; } return false; })()`);
  const hoverSelector = async (sel) => {
    const r = await js(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const b = e.getBoundingClientRect(); return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) }; })()`);
    if (!r) return false;
    win.webContents.sendInputEvent({ type: 'mouseMove', x: 700, y: 870 });
    await sleep(80);
    win.webContents.sendInputEvent({ type: 'mouseMove', x: r.x - 5, y: r.y - 5 });
    await sleep(80);
    win.webContents.sendInputEvent({ type: 'mouseMove', x: r.x, y: r.y });
    await sleep(150);
    return true;
  };
  const tab = async (down) => {
    win.webContents.sendInputEvent({ type: down ? 'keyDown' : 'keyUp', keyCode: 'Tab' });
    await sleep(150);
  };
  const open = () => js(`!!document.querySelector('.inspect')`);

  try {
    // Without hovering a card, Tab should not open anything.
    await tab(true);
    console.log('popup with no card hovered:', await open());
    await tab(false);

    await click('Deck builder');
    await sleep(300);
    await js(`(() => { const i = document.querySelector('input[type=search]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, 'berserker'); i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await sleep(300);
    await hoverSelector('.builder-grid .card-box');
    await tab(true);
    console.log('popup open in builder:', await open());
    console.log('keywords listed:', await js(`[...document.querySelectorAll('.inspect dt')].map(d => d.textContent).join(', ')`));
    await shot('01-builder-inspect');
    await tab(false);
    console.log('closed after release:', !(await open()));

    // An unscripted card shows the warning.
    await js(`(() => { const i = document.querySelector('input[type=search]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, 'Krr'); i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await sleep(300);
    await hoverSelector('.builder-grid .card-box');
    await tab(true);
    console.log('keywords for Krrask:', await js(`[...document.querySelectorAll('.inspect dt')].map(d => d.textContent).join(', ')`));
    console.log('warning shown:', await js(`!!document.querySelector('.inspect-warn')`));
    await shot('02-unscripted-inspect');
    await tab(false);
    await js(`(() => { const i = document.querySelector('input[type=search]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, 'Steelshaper'); i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await sleep(300);
    await hoverSelector('.builder-grid .card-box');
    await tab(true);
    console.log('popup fits:', await js(`(() => { const e = document.querySelector('.inspect-info'); return e.scrollHeight <= e.clientHeight + 1; })()`));
    await shot('02b-many-keywords');
    await tab(false);

    // In a game: a card in hand, then play until something is on the field.
    await js(`document.querySelector('[aria-label="Back to main menu"]').click()`);
    await sleep(200);
    await click('Play vs bots');
    await sleep(200);
    await click('Start game');
    await sleep(500);
    for (let k = 0; k < 40 && !(await click('Keep')); k++) await sleep(150);
    for (let i = 0; i < 400 && !(await js(`document.body.innerText.includes('End Main phase')`)); i++) await sleep(100);
    await hoverSelector('.hand .card-box');
    await tab(true);
    await shot('03-hand-inspect');
    await tab(false);
    // Let a few turns pass so opponents have creatures, then inspect one.
    await js(`(() => { const b = document.querySelector('.hand .card-box'); b && b.click(); })()`);
    await sleep(150);
    await click('Charge');
    await sleep(200);
    await click('End Main phase');
    for (let i = 0; i < 600; i++) {
      if (await js(`!!document.querySelector('.opps .card-box')`) && (await js(`document.body.innerText.includes('End Main phase')`))) break;
      if (await js(`document.body.innerText.includes('End Main phase')`)) await click('End Main phase');
      await click("Don't block");
      await click('No boost');
      await sleep(100);
    }
    await hoverSelector('.opps .card-box');
    await tab(true);
    await shot('04-field-inspect');
    console.log('right-now block:', await js(`[...document.querySelectorAll('.inspect-block h3')].map(h => h.textContent).join(', ')`));
    await tab(false);
  } catch (e) {
    console.log('ERROR', e);
  }
  console.log('console errors:', JSON.stringify(errors));
  app.quit();
});
