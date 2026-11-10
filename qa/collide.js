const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch();const W=+process.argv[2]||1440;const p=await b.newPage({viewport:{width:W,height:900},reducedMotion:'reduce'});
const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://127.0.0.1:8811/index.html',{waitUntil:'networkidle'});
// startsteget: välj ett yrke och visa kartan
await p.click('#kc-occ');await p.fill('#kc-occ','Backend-utvecklare');await p.waitForTimeout(300);await p.keyboard.press('Enter');await p.click('#kc-go');await p.waitForTimeout(300);
const STEP=+process.argv[3]||1;const labels=(await p.evaluate(()=>{const c=JSON.parse(document.getElementById('kc-data').textContent);return c.o.filter((o,i)=>c.os[i]||c.gs[o[2]]).map(o=>o[1])})).filter((_,i)=>i%STEP===0);
const measure=()=>p.evaluate(()=>{const svg=document.getElementById('kc-map'),R=e=>e.getBoundingClientRect(),S=svg.getBoundingClientRect();
 const items=[];const vis=e=>{const cs=getComputedStyle(e);return cs.display!=='none'&&+cs.opacity>0.05&&!e.closest('.out')};
 svg.querySelectorAll('.occ:not(.out)').forEach(g=>{const id=g.dataset.occ;items.push({k:'dot',id,r:R(g.querySelector('.dot'))});const n=g.querySelector('.name');if(vis(n))items.push({k:'name',id,t:n.textContent,r:R(n)});const s=g.querySelector('.sub');if(+getComputedStyle(s).opacity>0.5&&getComputedStyle(s).display!=='none'&&R(s).width>0)items.push({k:'sub',id,t:s.textContent,r:R(s)});});
 svg.querySelectorAll('.sk:not(.out)').forEach(g=>{if(vis(g))items.push({k:'pill',id:g.dataset.skill,t:g.textContent,r:R(g.querySelector('rect'))})});
 items.push({k:'me',id:'me',r:R(svg.querySelector('.me-dot'))});const mn=svg.querySelector('.me-name');if(vis(mn))items.push({k:'mename',id:'me',t:mn.textContent,r:R(mn)});
 const hit=(a,b)=>a.left<b.right-1&&b.left<a.right-1&&a.top<b.bottom-1&&b.top<a.bottom-1;const out=[];
 for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++){const A=items[i],B=items[j];if(A.id===B.id)continue;if(hit(A.r,B.r))out.push(`${A.k}:${A.t||A.id} × ${B.k}:${B.t||B.id}`);}
 const col=document.querySelector('.kc__mapcol').getBoundingClientRect();
 items.filter(x=>x.k==='name'||x.k==='sub').forEach(x=>{if(x.r.left<col.left-1||x.r.right>col.right+1)out.push(`clipped ${x.k}:${x.t}`)});
 return out;});
let total=0,states=0;const bad={};
for(const lab of labels){
 await p.click('#kc-occ');await p.fill('#kc-occ',lab);await p.waitForTimeout(450);
 const opts=await p.$$eval('#kc-occ-list .kc-find__opt .t',e=>e.map(x=>x.textContent.replace(/\u200b/g,'')));const idx=opts.indexOf(lab);
 if(idx<0){bad['finder:'+lab]=['not found'];continue}
 for(let i=0;i<idx;i++)await p.keyboard.press('ArrowDown');await p.keyboard.press('Enter');await p.waitForTimeout(60);
 const n=await p.$$eval('#kc-map .occ:not(.out)',e=>e.length);
 for(let k=0;k<Math.min(n,8);k++){await p.locator('#kc-map .occ:not(.out)').nth(k).click({force:true});await p.mouse.move(5,5);await p.waitForTimeout(40);
  const o=await measure();states++;if(o.length){total+=o.length;bad[lab+' #'+k]=o;}}
}
console.log('states',states,'collisions',total);const agg={};for(const v of Object.values(bad))for(const x of v){const t=x.startsWith('clipped')?'clipped':x.replace(/:[^×]*/g,'').trim();agg[t]=(agg[t]||0)+1;}console.log(agg);const nc=Object.entries(bad);for(const [k,v] of nc.slice(0,20))console.log(k,'->',v.slice(0,3).join(' ; '));
console.log('ERR',errs);await b.close();})();
