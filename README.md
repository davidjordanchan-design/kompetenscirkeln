# Kompetenscirkeln

Kompetenskarta för alla yrkesområden, byggd på Arbetsförmedlingens öppna data. Du väljer ditt yrke och markerar vad du kan. Kartan visar då:

- vilka närliggande yrken du når, i ordning och på avstånd efter hur mycket du redan kan;
- vilka av dem som är vanliga yrkesbyten från ditt yrke;
- vad som saknas;
- hur jobbmöjligheterna ser ut i ditt län.

**Snabbstart**

```bash
python3 web/build.py
cd web && python3 -m http.server 8811
# öppna http://127.0.0.1:8811/index.html
```

**Ny data**

```bash
python3 pipeline/hamta.py && python3 web/build.py
```

På GitHub görs detta automatiskt varje måndag, och sidan publiceras på GitHub Pages. Se `pipeline/README.md`.

**Läs mer**

- `pipeline/README.md`: hämtning, matchning och tester.
- `docs/data.md`: datakällor, schema, matchning och kända kvalitetsproblem.
- `qa/README.md`: kontroller av kartan och sökrutorna.

Ingen backend, inga cookies, ingen inloggning.
