# QA-skript (Playwright)

Alla skript utom mock-servern förutsätter att sidan serveras på port 8811 från `web/`:

```bash
cd web && python3 -m http.server 8811 &
node ../qa/collide.js 1440 6  # vart 6:e yrke; även 1024 och 390. Förväntat: "collisions 0". Utan steg körs alla yrken
```

| Skript | Vad det kontrollerar |
|---|---|
| `collide.js <bredd>` | Varje yrke som eget yrke × 8 fokuslägen. Kontrollerar att etiketter, prickar och kompetenser inte överlappar och inte klipps av SVG-kanten |
| `popcheck.js` | Sökförslagens layout (namn mot annonsantal) på 1440, 1024 och 390 |
| `t3.js` | Sökrutorna: stavfel ("suport", "kubernets", "pyton", "javscript" med flera), tangentbord, val. Sparar skärmdumpar i `shots/` |
| `t2.js` | Skärmdumpar av hero och karta före och efter ett val, i `shots/` |
| `req2.js` | Listar vilka filer sidan laddar. Det är listan över `files` vid artifact-publicering |
| `mock-server.mjs` | Falskt JobTech-API på port 8765 för att testa hämtningsskriptet utan nät: `TAXONOMY_BASE=http://127.0.0.1:8765 JOBSEARCH_BASE=http://127.0.0.1:8765 BAROMETER_URL=http://127.0.0.1:8765/yb.json python3 pipeline/hamta.py`. Skrevs för MVP:ns `build-dataset.mjs` och kan behöva justeras |

Playwright kräver `npm i playwright` och `npx playwright install chromium` om det inte redan finns.
Skripten som sparar skärmdumpar skriver till `shots/` i den katalog du står i. Skapa den först (`mkdir -p shots`).
