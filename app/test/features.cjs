// Checks 0.1.2 features in the real app: Alt inspect, Orb reveal, discard piles, and blocking taps.
// Usage: xvfb-run -a npx electron test/features.cjs <outDir>
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

  try {
    await click('Play vs bots');
    await sleep(200);
    await click('Start game');
    await sleep(400);
    for (let k = 0; k < 40 && !(await click('Keep')); k++) await sleep(150);
    for (let i = 0; i < 300 && !(await has('End Main phase')); i++) await sleep(100);

    // Alt over a hand card opens the popup; Tab no longer does.
    await hover('.hand .card-box');
    await key(true, 'Tab');
    console.log('Tab opens popup (should be null):', await popup());
    await key(false, 'Tab');
    await key(true, 'Alt');
    console.log('Alt opens popup:', await popup());
    await shot('01-alt-hand');
    await key(false, 'Alt');
    console.log('closed after release:', (await popup()) === null);

    // Charge a card, then Alt over the Orb shows that card.
    const chargedName = await js(`(() => { const b = document.querySelector('.hand .card-box'); const n = b.getAttribute('aria-label'); b.click(); return n; })()`);
    await sleep(150);
    await click('Charge');
    await sleep(500);
    for (let i = 0; i < 20 && (await click('Yes')); i++) await sleep(300); // answer any "may" prompts
    await hover('.orbs .orb');
    await key(true, 'Alt');
    console.log('charged:', chargedName, '| Orb popup shows:', await popup());
    await shot('02-alt-orb');
    await key(false, 'Alt');

    // Discard pile buttons for you and each opponent.
    console.log('discard buttons:', await js(`[...document.querySelectorAll('.link-btn')].filter(b => b.textContent.startsWith('Discard')).length`));
    await click('End Main phase');
    // Play until something is in a discard pile and you get attacked; block to check tapping.
    let blocked = false;
    let checkedDiscard = false;
    for (let i = 0; i < 900 && !blocked; i++) {
      if (await has('attacks you')) {
        const ok = await js(`(() => { const b = document.querySelector('.mine .card-box.ring-select'); if (!b) return false; b.click(); return true; })()`);
        await sleep(150);
        if (ok && (await click('Block with'))) {
          blocked = true;
          for (let q = 0; q < 10 && ((await click('No boost')) || (await click('Pass'))); q++) await sleep(150);
          await sleep(300);
          console.log('log says blocked:', await js(`[...document.querySelectorAll('.log li')].some(l => l.textContent.includes('You block with'))`));
          await shot('03-after-block');
          break;
        }
        await click("Don't block");
      }
      await click('No boost');
      await click('Yes');
      if (await js(`!!document.querySelector('.modal .choices .card-box') && !document.body.innerText.includes('discard pile')`)) {
        await js(`document.querySelector('.modal .choices .card-box').click()`);
        await sleep(100);
        await click('Choose');
      }
      if (await has('End Main phase')) {
        // Charge once, then play every creature we can afford so we have blockers; then end the turn.
        const n = await js(`document.querySelectorAll('.hand .card-box').length`);
        let charged = false;
        for (let k = 0; k < n; k++) {
          await js(`(() => { const b = document.querySelectorAll('.hand .card-box')[${k}]; if (b) b.click(); })()`);
          await sleep(80);
          const isCreature = await js(`(document.querySelectorAll('.hand .card-box')[${k}]?.getAttribute('aria-label') ?? '') !== '' && !!document.querySelector('.popover')`);
          if (isCreature && (await click('Play'))) { await sleep(400); for (let q = 0; q < 10 && ((await click('Pass')) || (await click('Yes'))); q++) await sleep(150); break; }
          if (!charged && (await click('Charge'))) { charged = true; await sleep(300); continue; }
          win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
          await sleep(80);
        }
        if (await has('Choose a target')) await click('Cancel');
        // Check the discard window once there's something in a pile.
        if (!checkedDiscard && (await js(`[...document.querySelectorAll('.link-btn')].some(b => /Discard [1-9]/.test(b.textContent))`))) {
          checkedDiscard = true;
          await js(`[...document.querySelectorAll('.link-btn')].find(b => /Discard [1-9]/.test(b.textContent)).click()`);
          await sleep(300);
          console.log('discard window:', await js(`document.querySelector('#dp-h')?.textContent`), '| cards shown:', await js(`document.querySelectorAll('.modal .choices .card-box').length`));
          await hover('.modal .choices .card-box');
          await key(true, 'Alt');
          console.log('Alt works in discard window:', await popup());
          await shot('04-discard-alt');
          await key(false, 'Alt');
          await click('Close');
          await sleep(200);
        }
        await click('End Main phase');
      }
      if (await has('Play again')) break;
      await click('Pass');
      await sleep(100);
    }
    // Tapped blocker check: the blocker is drawn sideways (wider than tall) on your field.
    if (blocked) console.log('a creature on your field is tapped:', await js(`[...document.querySelectorAll('.mine .row-cards .card-box')].some(b => b.offsetWidth > b.offsetHeight)`));
    for (let i = 0; i < 300 && !checkedDiscard; i++) {
      if (await js(`[...document.querySelectorAll('.link-btn')].some(b => /Discard [1-9]/.test(b.textContent))`)) {
        checkedDiscard = true;
        await js(`[...document.querySelectorAll('.link-btn')].find(b => /Discard [1-9]/.test(b.textContent)).click()`);
        await sleep(300);
        console.log('discard window:', await js(`document.querySelector('#dp-h')?.textContent`), '| cards shown:', await js(`document.querySelectorAll('.modal .choices .card-box').length`));
        await hover('.modal .choices .card-box');
        await key(true, 'Alt');
        console.log('Alt works in discard window:', await popup());
        await shot('04-discard-alt');
        await key(false, 'Alt');
        await shot('05-discard');
        break;
      }
      await click("Don't block"); await click('No boost'); await click('Yes'); await click('End Main phase'); await click('Pass');
      await sleep(150);
    }
    await shot('99-end'); console.log('end state:', await js(`document.querySelector('.me-panel .btn.primary')?.textContent + ' / ' + (document.querySelector('.modal h2')?.textContent ?? 'no modal') + ' / turn ' + document.querySelector('.topbar')?.textContent`));
    console.log('blocked:', blocked, '| discard checked:', checkedDiscard);
  } catch (e) {
    console.log('ERROR', e);
  }
  console.log('console errors:', JSON.stringify(errors));
  app.quit();
});
