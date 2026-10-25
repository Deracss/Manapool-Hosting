// Visual scenes for review: board, targeting, attack arrow, play announcement, expanded field, menu.
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
  const shot = async (name, wait = 300) => { await sleep(wait); fs.writeFileSync(path.join(out, `${name}.png`), (await win.capturePage()).toPNG()); console.log('shot', name); };
  const click = (t) => js(`(() => { const b = [...document.querySelectorAll('button')].find(b => b.textContent.trim().startsWith(${JSON.stringify(t)}) && !b.disabled); if (b) { b.click(); return true; } return false; })()`);
  const has = (t) => js(`document.body.innerText.includes(${JSON.stringify(t)})`);
  const clickCard = (name, scope = '') => js(`(() => { const b = [...document.querySelectorAll('${scope} .card-box')].find(b => b.getAttribute('aria-label') === ${JSON.stringify(name)}); if (b) { b.click(); return true; } return false; })()`);
  try {
    await click('Play vs bots');
    await sleep(200);
    await click('Start game');
    await sleep(400);
    for (let k = 0; k < 120; k++) { await js(`(() => { const g = window.__manapool.state(); if (g.roll && !g.roll.done && g.roll.contenders.includes(0) && g.roll.results[0] === null) window.__manapool.act({ type: 'roll', player: 0 }); })()`); if ((await click('To the opening hands')) || (await click('Keep'))) break; await sleep(150); } for (let k = 0; k < 40 && !(await click('Keep')); k++) await sleep(150);
    for (let i = 0; i < 300 && !(await has('End Main phase')); i++) await sleep(100);
    const put = (n, p, t = false) => js(`window.__manapool.put(${JSON.stringify(n)}, ${p}, ${t})`);
    await put('Vampire Duke', 0); await put('Steelshaper Vanguard', 0); await put('Fangs', 0); await put('Clockwork Servitor', 0, true);
    await put('Goblin Rusher', 1); await put('Goblin Shaman', 1, true);
    await put('Lurking Vampire', 2); await put('Isolde, Bloodborne Mistress', 2);
    await put('Demon Pup', 3); await put('Win / Win', 3); await put('War Cry', 0); await put('Mana Tree', 0);
    await js(`window.__manapool.giveCard('Divine judgment', 8)`);
    await shot('1-board', 600);
    const r = await js(`(() => { const b = [...document.querySelectorAll('.hand .card-box')].find(b => b.getAttribute('aria-label') === 'Divine judgment'); if (!b) return null; const q = b.getBoundingClientRect(); return { x: Math.round(q.left + q.width / 2), y: Math.round(q.top + 40) }; })()`);
    console.log('hand card at', r);
    if (r) { win.webContents.sendInputEvent({ type: 'mouseMove', x: r.x - 5, y: r.y }); await sleep(100); win.webContents.sendInputEvent({ type: 'mouseMove', x: r.x, y: r.y }); }
    await shot('2-hover-pay');
    await clickCard('Divine judgment', '.hand');
    await sleep(200);
    await click('Play');
    await shot('3-targeting');
    await click('Cancel');
    await sleep(200);
    await js(`window.__manapool.giveCard('Sacrifice', 4)`);
    await sleep(200);
    await clickCard('Sacrifice', '.hand');
    await sleep(200);
    await click('Play');
    await shot('3b-sacrifice-step1');
    await js(`document.querySelector('.modal .grouped .card-box').click()`);
    await shot('3c-sacrifice-step2');
    await click('Cancel');
    await sleep(200);
    await js(`window.__manapool.giveCard('Research')`);
    await sleep(200);
    await clickCard('Research', '.hand');
    await sleep(200);
    await click('Play');
    await shot('4-announce', 250);
    for (let i = 0; i < 60 && !(await has('End Main phase')); i++) { await click('Done'); await click('Pass'); await sleep(150); }
    await clickCard('Steelshaper Vanguard', '.mine');
    await sleep(200);
    await click('Attack Cat');
    await shot('5-attack', 500);
    for (let i = 0; i < 40; i++) { if (await click('No boost')) break; await sleep(150); }
    await shot('6-after-boost', 200);
    for (let i = 0; i < 60 && !(await has('End Main phase')); i++) { await click('Pass'); await sleep(150); }
    await shot('7-after-combat', 400);
    await js(`document.querySelector('[aria-label="Expand Cat\\'s field"]').click()`);
    await shot('8-expanded');
    await click('You');
    await shot('8b-expanded-you');
    await click('Close');
    await click('Menu');
    await shot('9-menu');
  } catch (e) { console.log('ERROR', e); }
  console.log('console errors:', errors.length, errors.slice(0, 3));
  app.quit();
});
