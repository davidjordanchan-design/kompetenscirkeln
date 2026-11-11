// Följer kartan bildruta för bildruta under de vanligaste händelserna (visa kartan, välja yrke, simulera lärande,
// bocka av en kompetens, snabba klick, byta yrke) och rapporterar:
//   maxJump   största förflyttning mellan två bildrutor för ett yrke eller kurslinjen (bör ligga under cirka 30 px)
//   blinks    antal gånger ett yrkes synlighet ändras mer än 0,35 mellan två bildrutor (ska vara 0)
//   stillMoving  om något fortfarande rör sig när mätningen slutar (ska vara false)
// Kör från web/ med servern på 8811:  node ../qa/anim.js [bredd]
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const W = +process.argv[2] || 1440;
  const p = await b.newPage({ viewport: { width: W, height: 900 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://127.0.0.1:8811/index.html', { waitUntil: 'networkidle' });
  await p.click('#kc-occ'); await p.fill('#kc-occ', 'Backend-utvecklare'); await p.waitForTimeout(400); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
  await p.evaluate(() => {
    window.__rec = []; const svg = document.getElementById('kc-map');
    const loop = () => {
      const f = { t: performance.now(), n: {}, c: null, st: 0 };
      svg.querySelectorAll('.occ').forEach(g => { const m = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(g.getAttribute('transform') || ''); f.n[g.dataset.occ] = [m ? +m[1] : null, m ? +m[2] : null, +g.getAttribute('opacity')]; });
      const c = svg.querySelector('.course'); f.c = [+c.getAttribute('x2'), +c.getAttribute('y2'), +c.getAttribute('opacity')];
      f.st = svg.querySelectorAll('.stone').length;
      window.__rec.push(f); requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
  const run = async (name, act, ms = 1500) => {
    await p.evaluate(() => { window.__rec.length = 0; }); await act(); await p.waitForTimeout(ms);
    const rec = await p.evaluate(() => window.__rec.slice()); let maxJump = 0, maxDt = 0, blink = 0; const ids = new Set(); rec.forEach(f => Object.keys(f.n).forEach(k => ids.add(k)));
    for (let i = 1; i < rec.length; i++) {
      maxDt = Math.max(maxDt, rec[i].t - rec[i - 1].t);
      for (const id of ids) { const a = rec[i - 1].n[id], c = rec[i].n[id]; if (!a || !c || a[0] === null || c[0] === null) continue; maxJump = Math.max(maxJump, Math.hypot(a[0] - c[0], a[1] - c[1])); if (Math.abs(a[2] - c[2]) > 0.35) blink++; }
      const a = rec[i - 1].c, c = rec[i].c; if (a[2] > 0.3 && c[2] > 0.3) maxJump = Math.max(maxJump, Math.hypot(a[0] - c[0], a[1] - c[1]));
    }
    const last = rec[rec.length - 1], q = rec[rec.length - 3];
    const moving = Object.keys(last.n).some(id => q.n[id] && Math.hypot(q.n[id][0] - last.n[id][0], q.n[id][1] - last.n[id][1]) > 0.2);
    console.log(name.padEnd(12), 'frames', rec.length, 'maxJump', maxJump.toFixed(1), 'px  maxFrameGap', maxDt.toFixed(0), 'ms  blinks', blink, ' nodes', Object.keys(last.n).length, 'stones', last.st, 'stillMoving', moving);
  };
  await run('reveal', () => p.click('#kc-go'), 2000);
  await run('select', () => p.locator('#kc-map .occ').nth(5).click());
  await run('select2', () => p.locator('#kc-map .occ').nth(1).click());
  await run('simulate', () => p.click('#kc-card [data-add]'));
  await run('chip-off', () => p.locator('#kc-chips .kc__chip[aria-pressed="true"]').first().click());
  await run('fast-clicks', async () => { for (const i of [0, 3, 6, 2, 7]) await p.locator('#kc-map .occ:not(.out)').nth(i).click(); });
  await run('new-occ', async () => { await p.click('#kc-occ'); await p.fill('#kc-occ', 'Kock'); await p.waitForTimeout(400); await p.keyboard.press('Enter'); }, 2400);
  // sökmenyerna i kartläget ska ligga ovanpå kartan och gå att klicka
  for (const [inp, list] of [['#kc-occ', '#kc-occ-list'], ['#kc-add', '#kc-add-list']]) {
    await p.click(inp); await p.waitForTimeout(400);
    const ok = await p.evaluate(sel => { const box = document.querySelector(sel).getBoundingClientRect(); return [...document.querySelectorAll(sel + ' .kc-find__opt')].filter(l => { const r = l.getBoundingClientRect(), y = r.top + r.height / 2; return y > box.top && y < Math.min(box.bottom, innerHeight); })  // bara raderna som syns i listan, resten rullas fram
      .every(l => { const r = l.getBoundingClientRect(); return l.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)); }); }, list);
    console.log('dropdown', inp, ok ? 'klickbar' : 'TÄCKT'); await p.keyboard.press('Escape');
  }
  console.log('ERR', errs); await b.close();
})();
