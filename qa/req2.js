const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch();const reqs=new Set();
for(const w of [1440,390]){const p=await b.newPage({viewport:{width:w,height:900}});
p.on('request',r=>{const u=r.url();if(u.includes('127.0.0.1:8811'))reqs.add(u.replace('http://127.0.0.1:8811/',''))});
await p.goto('http://127.0.0.1:8811/index.html',{waitUntil:'networkidle'});
for(let y=0;y<7000;y+=600){await p.evaluate(y=>scrollTo(0,y),y);await p.waitForTimeout(250);}await p.close();}
console.log([...reqs].sort().join('\n'));await b.close();})();
