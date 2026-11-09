import http from "node:http";
const field = {concepts:[{id:"F1",preferred_label:"Data/IT",narrower:[
 {id:"G1",preferred_label:"Mjukvaruutvecklare m.fl.",ssyk_code_2012:"2512",narrower:[
   {id:"O1",preferred_label:"Backend-utvecklare",substitutes:[{id:"O2",preferred_label:"Frontend-utvecklare",substitutability_percentage:75,broader:[{id:"G1",preferred_label:"x",ssyk_code_2012:"2512"}]},{id:"X1",preferred_label:"Dataingenjör",substitutability_percentage:25,broader:[{id:"GX",preferred_label:"Ingenjörer el",ssyk_code_2012:"2149"}]}]},
   {id:"O2",preferred_label:"Frontend-utvecklare",substitutes:[]}]},
 {id:"G2",preferred_label:"IT-säkerhetsspecialister",ssyk_code_2012:"2516",narrower:[{id:"O3",preferred_label:"IT-säkerhetsanalytiker",substitutes:[]}]}]}]};
const skills = {
 G1:[{id:"S1",preferred_label:"Python, programmeringsspråk",alternative_labels:[],hidden_labels:[],broader:[{preferred_label:"Programmeringsspråk"}]},
     {id:"S2",preferred_label:"React, ramverk",alternative_labels:["ReactJS"],hidden_labels:null,broader:[{preferred_label:"Ramverk"}]},
     {id:"S3",preferred_label:"Go, programmeringsspråk",alternative_labels:[],hidden_labels:[],broader:[]}],
 G2:[{id:"S4",preferred_label:"ISO 27001, standard",alternative_labels:[],hidden_labels:[],broader:[{preferred_label:"Standarder"}]},{id:"S1",preferred_label:"Python, programmeringsspråk",broader:[{preferred_label:"Programmeringsspråk"}]}],
 GX:[{id:"S5",preferred_label:"Elektronik",broader:[]}]};
function ads(g){ const base={G1:[["O1","Vi söker backend med Python och Go."],["O1","Python, Docker. we go further"],["O2","React och ReactJS frontend"],["O2","reactive stuff, python"]],G2:[["O3","ISO 27001 och python"]],GX:[["X1","Elektronik"]]}[g]||[];
 return base.map(([o,t],i)=>({id:g+i,headline:"Annons",description:{text:t},occupation:{concept_id:o},must_have:{skills:[]},nice_to_have:{skills:i===1&&g==="G1"?[{concept_id:"S2"}]:[]}}));}
http.createServer((req,res)=>{const u=new URL(req.url,"http://x");res.setHeader("content-type","application/json");
 if(u.pathname==="/v1/taxonomy/graphql"){const q=u.searchParams.get("query");
   if(q.includes('ssyk-level-4") {\n        id preferred_label ssyk_code_2012')||q.includes('narrower(type: "ssyk-level-4")')) return res.end(JSON.stringify({data:field}));
   const id=q.match(/id: "(\w+)"/)[1]; return res.end(JSON.stringify({data:{concepts:[{related:skills[id]||[]}]}}));}
 if(u.pathname==="/search"){const g=u.searchParams.get("occupation-group");const a=ads(g);const off=+u.searchParams.get("offset");return res.end(JSON.stringify({total:{value:a.length+100},hits:off===0?a:[]}));}
 if(u.pathname==="/yb.json") return res.end(JSON.stringify([{ssyk:"2512",lan:"00",yb_yrke:"Mjukvaruutvecklare",jobbmojligheter:"medelstora",rekryteringssituation:"balans",prognos:"öka",text_jobbmojligheter:"t",omgang:"2026-1"},{ssyk:"4119",lan:"00"}]));
 res.statusCode=404;res.end("{}");}).listen(8765,()=>console.log("mock up"));
