// Checks the 0.1.5 table screens: GUIDE, choose-a-player, equipment and RECONFIGURE.
// Usage: xvfb-run -a npx electron test/newui.cjs <outDir>
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
  const has = (t) => js(`document.body.innerText.includes(${JSON.stringify(t)})`);
  const hover = async (sel) => {
    const r = await js(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const b = e.getBoundingClientRect(); return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) }; })()`);
    if (!r) return false;
    win.webContents.sendInputEvent({ type: 'mouseMove', x: 700, y: 880 });
    await sleep(80);
    win.webContents.sendInputEvent({ type: 'mouseMove', x: r.x - 3, y: r.y - 3 });
    await sleep(80);
    win.webContents.sendInputEvent({ type: 'mouseMove', x: r.x, y: r.y });
    await sleep(150);
    return true;
  };
  const key = async (down, keyCode) => {
    win.webContents.sendInputEvent({ type: down ? 'keyDown' : 'keyUp', keyCode });
    await sleep(150);
  };
  const popup = () => js(`document.querySelector('.inspect h2')?.textContent ?? null`);

  const wait = async (t, n = 100) => { for (let i = 0; i < n && !(await has(t)); i++) { await click('Pass'); await sleep(100); } return has(t); };
  const playFromHand = async (name) => {
    await js(`(() => { const b = [...document.querySelectorAll('.hand .card-box')].find(b => b.getAttribute('aria-label') === ${JSON.stringify(name)}); b.click(); })()`);
    await sleep(200);
    return click('Play');
  };
  const useField = async (name, label) => {
    await js(`(() => { const b = [...document.querySelectorAll('.mine .card-box')].find(b => b.getAttribute('aria-label') === ${JSON.stringify(name)}); b.click(); })()`);
    await sleep(200);
    return click(label);
  };
  const lastLog = () => js(`[...document.querySelectorAll('.log li')].slice(-4).map(l => l.textContent).join(' | ')`);
  try {
    await click('Play vs bots');
    await sleep(200);
    await click('Start game');
    await sleep(400);
    await click('Keep');
    await wait('End Main phase', 300);

    await js(`window.__manapool.giveCard('Research', 20)`);
    await sleep(200);
    console.log('played Research:', await playFromHand('Research'));
    console.log('GUIDE screen:', await wait('These are the top cards'));
    await shot('01-guide');
    console.log('to-bottom click:', await click('To bottom'));
    await sleep(150);
    console.log('bottom row now:', await js(`[...document.querySelectorAll('.modal .choices')][1]?.innerText`));
    await sleep(150);
    await shot('02-guide-one-to-bottom');
    await click('Done');
    await wait('End Main phase');
    console.log('log:', await lastLog());

    await js(`window.__manapool.giveCard('Insightful Decree')`);
    await sleep(200);
    console.log('played Decree:', await playFromHand('Insightful Decree'));
    console.log('player screen:', await wait('COMMAND a player'));
    await shot('03-choose-player');
    await js(`(() => { const b = [...document.querySelectorAll('.modal button')].find(b => b.textContent.startsWith('Cat')); b.click(); })()`);
    await wait('End Main phase');
    console.log('log:', await lastLog());

    await js(`window.__manapool.giveCard('Fangs')`);
    await sleep(200);
    console.log('played Fangs:', await playFromHand('Fangs'));
    await wait('End Main phase');
    const creature = await js(`window.__manapool.state().players[0].field.find(i => window.__manapool.state().cards[i].cardId !== 'fangs') ?? null`);
    console.log('creature on my field:', creature);
    await js(`window.__manapool.giveCard('Meditating Monk')`);
    await sleep(200);
    await playFromHand('Meditating Monk');
    await wait('End Main phase');
    console.log('equip clicked:', await useField('Fangs', 'Pay 2: Equip'));
    await wait('Equip: choose', 40);
    await shot('04-equip-choose');
    await js(`(() => { const b = [...document.querySelectorAll('.modal .card-box, .modal button')].find(b => (b.getAttribute('aria-label') ?? b.textContent).includes('Meditating Monk')); b && b.click(); })()`);
    await sleep(200);
    await click('Choose');
    await wait('End Main phase');
    console.log('log:', await lastLog());

    await js(`window.__manapool.giveCard('Resonant Mana Node')`);
    await sleep(200);
    await playFromHand('Resonant Mana Node');
    await wait('End Main phase');
    await useField('Resonant Mana Node', 'Tap: add 1 mana');
    await wait('End Main phase');
    console.log('reconfigure clicked:', await useField('Resonant Mana Node', 'RECONFIGURE'));
    await sleep(300);
    console.log('log:', await lastLog());
    await shot('05-after-reconfigure');

    await js(`window.__manapool.giveCard('Demon Shade', 2)`);
    await sleep(200);
    console.log('played Shade:', await playFromHand('Demon Shade'));
    console.log('offer finished:', await wait('accepted', 150));
    console.log('log:', await js(`[...document.querySelectorAll('.log li')].slice(-8).map(l => l.textContent).join(' | ')`));
    console.log('souls shown:', await has('Souls'));
    await shot('06-after-offer');
  } catch (e) {
    console.log('ERROR', e);
  }
  console.log('console errors:', errors.length, errors.slice(0, 3));
  app.quit();
});
