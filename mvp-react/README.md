# Kompetenscirkeln – MVP

Webbapp där man väljer sitt yrke, bockar i sina kompetenser och ser en **cirkel** med:

- **ditt yrke** i mitten
- **dina kompetenser** (grönt) och **kompetenser som saknas** (streckat orange) i inre ringen
- **närliggande yrken** i yttre ringen, färgade efter Yrkesbarometerns jobbmöjligheter, med pil för 5-årsprognosen

Klicka på ett yrke för att se matchning, vad du har, vad som saknas och din **brygga** – de få kompetenser som tar dig till ≥ 70 % match. Klicka på en saknad kompetens (i cirkeln eller med +) för att simulera att du lär dig den – cirkeln räknas om direkt.

Första versionen är avgränsad till **Data/IT** men skriptet fungerar för vilket yrkesområde som helst.

## Kom igång

```bash
npm install
npm run data     # hämtar riktiga data från JobTech → public/data/dataset.json (tar några minuter)
npm run dev      # http://localhost:5173
```

Utan `npm run data` startar appen med **demodata** (gul banner). Demodatan har riktiga yrkesgrupper och yrkesbenämningar ur taxonomin, men kompetensvikter, utbytbarhet och prognoser är påhittade.

Övrigt:

```bash
npm test         # enhetstester för matchning och textmatchning
npm run build    # statisk build i dist/ – kan läggas på valfri webbhotell / GitHub Pages
FIELD_ID=NYW6_mP6_vwf npm run data   # annat yrkesområde (här Hälso- och sjukvård)
```

Yrkesområdes-ID:n: Data/IT `apaJ_2ja_LuF`, Hälso- och sjukvård `NYW6_mP6_vwf`, Bygg och anläggning `j7Cq_ZJe_GkT`, Yrken med teknisk inriktning `6Hq3_tKo_V57`, Pedagogik `MVqp_eS8_kDZ` (hela listan: `https://taxonomy.api.jobtechdev.se/v1/taxonomy/main/concepts?type=occupation-field`).

## Datakällor och metod

| Vad | Källa | Används till |
|---|---|---|
| Yrkesgrupper (SSYK-4) och yrkesbenämningar | JobTech Taxonomy, GraphQL | Valbara yrken |
| Kompetenser per yrkesgrupp | Taxonomy (`related(type:"skill")`) | Vokabulär för textmatchning |
| Utbytbarhet mellan yrken (75 = hög, 25 = låg) | Taxonomy (`substitutes`, `substitutability_percentage`) | Badge + tar med närliggande yrken utanför området |
| Aktuella annonser | JobSearch (`/search?occupation-group=…`) | **Kompetensvikter** |
| Jobbmöjligheter, rekryteringsläge, 5-årsprognos per SSYK-4 och län | `data.jobtechdev.se/prognoser/yrkesbarometer.json` | Färg och pil på yrkena |

**Varför egna vikter?** Taxonomin kopplar kompetenser till hela SSYK-4-grupper (ofta flera hundra per grupp) och saknar vikter. Skriptet läser därför de aktuella annonserna och räknar hur stor andel som nämner varje kompetens – per yrkesbenämning när det finns minst 15 annonser, annars per yrkesgrupp. Det är det som gör cirkeln "spetsig".

**Matchning:** för varje yrke tas de 15 tyngsta kompetenserna. Match = summan av vikterna för de kompetenser du har ÷ summan av alla 15. Bryggan = saknade kompetenser i viktordning tills du når 70 %. Konstanterna finns i `src/lib/match.ts`.

### Kända begränsningar (bra frågor till Arbetsförmedlingens IT-avdelning)

1. **Textmatchningen är enkel** (etiketter + alternativa etiketter mot annonstext). Mjuka kompetenser och omskrivningar missas. Nästa steg: köra annonserna genom **JobAd Enrichments** eller få tillgång till de berikade fälten i historiska annonser – och be om en koppling mellan berikade kompetenser och taxonomins kompetens-ID:n.
2. **Yrkesbarometerns struktur ändras** från december 2026 enligt Arbetsförmedlingen. Fälten mappas i `fetchBarometer()` i `scripts/build-dataset.mjs` – kontrollera där om färgerna slutar fungera.
3. **Utbytbarhet** är grov (två nivåer) och ibland oväntad (t.ex. mjukvaruutvecklare ↔ elektronikingenjörer). Den används därför som komplement, inte som huvudsignal.
4. Livesiffran "X annonser i Platsbanken nu" hämtas direkt från JobSearch i webbläsaren och visas bara om anropet lyckas.
5. JobSearch ger max 2 000 annonser per sökning; för stora yrkesgrupper är vikterna ett stickprov av de senaste.

## Struktur

```
scripts/build-dataset.mjs   hämtar och bearbetar data (Node 18+, inga beroenden)
scripts/match.test.mjs      tester
src/lib/match.ts            matchning, brygga, prognosmappning
src/lib/data.ts             laddar dataset.json, faller tillbaka på demodata
src/components/             OccupationPicker, SkillPanel, CompetenceCircle (SVG), MatchDetail
src/data/demo-dataset.json  demodata
public/data/dataset.json    skapas av `npm run data`
```

Ingen backend, inga cookies, ingen inloggning – allt användaren väljer stannar i webbläsaren.

## Föra in i Lovable

Lovable-projekt är Vite + React + TypeScript, så filerna kan flyttas rakt in: kopiera `src/lib`, `src/components`, `src/types.ts`, `src/data` och `scripts/`, och rendera `<App />` (eller komponenterna) i en route. Styling ligger i `src/styles.css` och kan ersättas med Tailwind/shadcn. Det enklaste är att koppla Lovable till ett GitHub-repo och pusha den här koden dit.

## Förslag på nästa steg

- **Utbildningsvägar:** koppla bryggan till JobEd Connect / Susa-navet – "den här YH-kursen ger dig Kubernetes och Terraform".
- **Trender:** historiska annonser → visa om en kompetens ökar eller minskar (pil på kompetensnoderna).
- **Region:** vikta kompetenser och annonsantal per län, inte bara prognosen.
- **Arbetsgivarläge:** ladda upp en personalgrupp (yrke + kompetenser) → aggregerad cirkel: vilka interna roller kan medarbetarna växa in i, vilka kompetenser ger störst hävstång.
- **Validering:** testa med studie- och yrkesvägledare och en omställningsorganisation innan arbetsgivarläget byggs.
