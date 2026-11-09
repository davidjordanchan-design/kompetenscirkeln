# Data: källor, schema, matchning och kvalitet

## Flöde

```
JobTech-API:er ──(pipeline/hamta.py)──> data/dataset.json (+ data/raw/radata.json.gz, bara lokalt)
data/dataset.json ──(web/build.py)──> web/index.html, web/artifact.html
radata.json.gz ──(pipeline/recompute.py)──> data/dataset.json   # omräkning utan nät
```

Första körningen gjordes 9 nov 2026 och omfattade:

- Data/IT med 12 yrkesgrupper och 67 yrken;
- 2 808 IT-annonser;
- 1 824 annonser i 8 närliggande yrkesgrupper utanför IT, som kom med via utbytbarhet;
- Yrkesbarometern omgång 2026-1 för alla 21 län.

## data/dataset.json (det sidan läser)

| Fält | Innehåll |
|---|---|
| `meta` | `field`, `generated`, `barometerOmgang`, `adsAnalyzed`, `adsInField`, `method`, `sources` (tas bort när sidan byggs; antal och datum skrivs in i sidans text) |
| `groups[]` | `id`, `label`, `ssyk` (SSYK-4), `external` (utanför Data/IT, med via utbytbarhet), `adCount`, `adsAnalyzed` |
| `occupations[]` | `id`, `label`, `groupId`, `substitutes[]`, `adCount`, `external` |
| `skills[]` | `id`, `label` (rensat visningsnamn), `headline` (kompetensrubrik). Innehåller alla 1 065 (egna tillägg har id som börjar på `x_`), så att sökningen hittar allt |
| `groupSkills{groupId: [{skillId, share}]}` | topp 40 kompetenser per yrkesgrupp, andel annonser (≥ 0,02) |
| `occSkills{occId: [{skillId, share}]}` | samma sak per yrkesbenämning, bara för yrken med ≥ 15 annonser |
| `barometer{ssyk: {lan: {yrke, jobbmojligheter, rekrytering, prognos, text}}}` | `lan` är länskoden, där `"00"` = riket |

Profilen för ett yrke tas från `occSkills[occId]` om den finns, annars från `groupSkills[groupId]`.

## data/raw/radata.json.gz

Fälten är `field`, `fetched`, `groups`, `skillsByGroup` (taxonomins kompetenser med alternativa och dolda etiketter), `ads[]`, `barometerRows` och `occupations`.

Varje post i `ads[]` har `id`, `published`, `region`, `occupationId`, `text` (≤ 6 000 tecken), `skillIds` och `groupId`.

Annonstexten är extern och opålitlig data.

## Matchning av kompetenser i annonstext (pipeline/kompetens.py)

1. Tokenisera på `[A-Za-zÅÄÖåäö…0-9#+.]+` och bilda 1–4-gram, både i originalform och i gemener.
2. Termerna för en kompetens är:
   - den egna etiketten, men bara om den inte innehåller "/";
   - alternativa och dolda etiketter. En etikett med komma används som hel fras, utom när första delen är samma som den egna etiketten.
3. Förkortningar matchas skiftlägeskänsligt. Det gäller termer på högst 3 tecken, och termer i versaler på högst 6 tecken.
4. Stopplistan innehåller Vi, Access, Progress, Client, Server, Logic, MOST, Ada, Management, Nätverk, Arbetsmiljö, E-post, Friskvård, Research, Source, Hälso- och sjukvård, Ledningssystem, Office, Go, Basic, Swift, Design, Sales, Support, Service och Teams.
5. Kompetenser med samma visningsnamn slås ihop till ett id. Visningsnamnet är etiketten före första kommatecknet, med ersättningarna CI → CI/CD, Node → Node.js, Amazon Web Services → AWS och Google Cloud Platform → Google Cloud.
6. Varje annons matchas mot **alla** kompetenser. Annonsens egna `skillIds` räknas också.
7. Andelen är antalet annonser med träff delat med antalet annonser. Konstanterna är `TOP_SKILLS = 40`, `MIN_SHARE = 0.02` och `MIN_OCC_ADS = 15`. Lika andelar sorteras på id, så att resultatet blir deterministiskt.

8. Egna tillägg och synonymer läses ur `pipeline/tillagg.json`. Termerna där är handgranskade och går förbi stopplistan. Termer i `cs` matchas skiftlägeskänsligt (React, Spark, SAFe).

## Kända kvalitetsproblem

| Problem | Effekt | Förslag |
|---|---|---|
| "AI" i 25–70 % av annonserna, ofta i företagsbeskrivningen | Drar upp likheten mellan alla IT-yrken | Räkna inte träffar i "Om oss"-stycken, eller nedvikta allmänna termer (idf) |
| Få annonser: Supporttekniker IT (18), Testledare/QA lead (18), Säkerhetsadministratör (19) | Osäkra profiler | Åtgärdat delvis: kortet visar "Osäker profil" under 25 annonser. Kvar: slå ihop med gruppen eller använd historiska annonser |
| Mjuka kompetenser och omskrivningar | Missas av ordmatchningen | JobAd Enrichments (JobTech) |
| Kubernetes med flera saknas i taxonomins kompetenslista | Syntes inte trots att de är vanliga | Åtgärdat med `pipeline/tillagg.json` (27 tillägg, 3 synonymer). Listan bör granskas och stämmas av med JobTech |
| "ML" i taxonomin är programspråket ML, men träffarna gäller maskininlärning | Visas som egen kompetens bredvid Machine learning | Slå ihop med Machine learning via `tillagg.json` |
| JobSearch ger max 2 000 träffar per sökning | Stora grupper blir ett stickprov | Historiska annonser eller fler filter (region, datum) |
| Utbytbarheten är grov (75/25) och ibland oväntad | Externa yrken kan bli konstiga | Använd den bara för att ta med kandidater. Rangordningen görs efter kompetensöverlapp |
| Taxonomin och barometern ändras från december 2026 | Hämtningen kan gå sönder | Versionshantera taxonomin och stäm av med JobTech |
