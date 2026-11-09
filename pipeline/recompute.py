"""Räknar om datafilen ur sparad rådata, utan nätverk.

    python3 pipeline/recompute.py                              # data/raw/radata.json.gz -> data/dataset.json
    python3 pipeline/recompute.py <radata.json.gz> <ut.json>

Används när matchningen eller tillagg.json har ändrats. Logiken finns i kompetens.py.
"""
import gzip, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kompetens

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")

if __name__ == "__main__":
    raw_path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "data", "raw", "radata.json.gz")
    out_path = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, "data", "dataset.json")
    with gzip.open(raw_path, "rt", encoding="utf-8") as f:
        raw = json.load(f)
    ds = kompetens.build_dataset(raw)
    kompetens.write_dataset(ds, out_path)
    print(f"{len(ds['occupations'])} yrken, {len(ds['skills'])} kompetenser, {ds['meta']['adsAnalyzed']} annonser -> {out_path}")
