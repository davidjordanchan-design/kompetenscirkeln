const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1440,height:900}});const errs=[];
p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>m.type()==='error'&&!/fonts|ERR_TUNNEL/.test(m.text())&&errs.push(m.text()));
await p.goto('http://127.0.0.1:8811/index.html',{waitUntil:'networkidle'});await p.waitForTimeout(800);
// startsteget: välj ett yrke och visa kartan
await p.click('#kc-occ');await p.fill('#kc-occ','Backend-utvecklare');await p.waitForTimeout(300);await p.keyboard.press('Enter');await p.click('#kc-go');await p.waitForTimeout(300);
await p.screenshot({path:'shots/n-hero.png'});
await p.evaluate(()=>document.querySelector('#kc-map').scrollIntoView({block:'center'}));await p.waitForTimeout(1600);
await p.screenshot({path:'shots/n-map1.png'});
await p.locator('#kc-map [data-occ]').nth(5).click();await p.waitForTimeout(250);
await p.screenshot({path:'shots/n-mid.png'});await p.waitForTimeout(1300);
await p.screenshot({path:'shots/n-map2.png'});
console.log('ERR',errs);await b.close();})();
