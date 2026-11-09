const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch();const out=[];
for(const W of [1440,1024,390]){const p=await b.newPage({viewport:{width:W,height:900},reducedMotion:'reduce'});
await p.goto('http://127.0.0.1:8811/index.html',{waitUntil:'networkidle'});
for(const [sel,qs] of [['#kc-occ',['','sys','utvecklare','säkerhet','projekt','data','it']],['#kc-add',['','win','python','azure','cert','test']]]){
 for(const q of qs){await p.click(sel);await p.fill(sel,q);await p.waitForTimeout(200);
  const r=await p.evaluate(sel=>{const list=document.getElementById(document.querySelector(sel).getAttribute('aria-controls'));const L=list.getBoundingClientRect();const res=[];
   const hit=(a,b)=>a.left<b.right-1&&b.left<a.right-1&&a.top<b.bottom-1&&b.top<a.bottom-1;
   list.querySelectorAll('.kc-find__opt').forEach(o=>{const t=o.querySelector('.t').getBoundingClientRect(),n=o.querySelector('.n')?.getBoundingClientRect(),m=o.querySelector('.m').getBoundingClientRect();
    if(n&&hit(t,n))res.push('name×count '+o.querySelector('.t').textContent);if(hit(t,m))res.push('name×meta '+o.querySelector('.t').textContent);
    if(t.right>L.right+1||m.right>L.right+1)res.push('overflow '+o.querySelector('.t').textContent);});
   if(L.right>innerWidth||L.left<0)res.push('list off-screen');return res;},sel);
  if(r.length)out.push(W+' '+sel+' "'+q+'": '+r.join('; '));}
 await p.keyboard.press('Escape');}
await p.close();}
console.log(out.length?out.join('\n'):'popovers: no overlaps');await b.close();})();
