import { useMemo, useState } from "react";
import type { Dataset } from "../types";

interface Props {
  ds: Dataset;
  value: string | null;
  onChange: (occupationId: string) => void;
}

export default function OccupationPicker({ ds, value, onChange }: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const current = ds.occupations.find((o) => o.id === value);
  const groupLabel = useMemo(() => new Map(ds.groups.map((g) => [g.id, g.label])), [ds]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ds.occupations
      .filter((o) => !o.external)
      .filter((o) => !q || o.label.toLowerCase().includes(q) || groupLabel.get(o.groupId)?.toLowerCase().includes(q))
      .sort((a, b) => (b.adCount ?? 0) - (a.adCount ?? 0))
      .slice(0, 30);
  }, [ds, query, groupLabel]);

  return (
    <div className="picker">
      <label htmlFor="occ-search" className="label">
        Vad jobbar du som?
      </label>
      <input
        id="occ-search"
        type="search"
        placeholder={current ? current.label : "Backend-utvecklare"}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls="occ-list"
      />
      {open && (
        <ul id="occ-list" className="picker__list" role="listbox">
          {results.length === 0 && <li className="picker__empty">Inga yrken matchar. Prova ett annat ord.</li>}
          {results.map((o) => (
            <li
              key={o.id}
              role="option"
              aria-selected={o.id === value}
              onMouseDown={() => {
                onChange(o.id);
                setQuery("");
                setOpen(false);
              }}
            >
              <span>{o.label}</span>
              <small>{groupLabel.get(o.groupId)}</small>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
