import type { Dataset } from "../types";

/**
 * Laddar public/data/dataset.json (skapas med `npm run data`).
 * Finns den inte används den inbyggda demodatan.
 */
export async function loadDataset(): Promise<Dataset> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}data/dataset.json`, { cache: "no-cache" });
    if (res.ok && res.headers.get("content-type")?.includes("json")) {
      const ds = (await res.json()) as Dataset;
      if (Array.isArray(ds.occupations) && ds.occupations.length > 0) return ds;
    }
  } catch {
    /* faller tillbaka på demodata */
  }
  const demo = await import("../data/demo-dataset.json");
  return demo.default as unknown as Dataset;
}

/** Live: antal aktuella annonser i Platsbanken för en yrkesbenämning (valfritt, kräver nätåtkomst). */
export async function fetchLiveAdCount(occupationId: string, signal?: AbortSignal): Promise<number | null> {
  if (occupationId.startsWith("demo-")) return null;
  try {
    const res = await fetch(`https://jobsearch.api.jobtechdev.se/search?occupation-name=${occupationId}&limit=0`, {
      signal,
      headers: { accept: "application/json" },
    });
    if (!res.ok) return null;
    const json = await res.json();
    return typeof json?.total?.value === "number" ? json.total.value : null;
  } catch {
    return null;
  }
}

export const LAN: Record<string, string> = {
  "00": "Hela riket",
  "01": "Stockholms län",
  "03": "Uppsala län",
  "04": "Södermanlands län",
  "05": "Östergötlands län",
  "06": "Jönköpings län",
  "07": "Kronobergs län",
  "08": "Kalmar län",
  "09": "Gotlands län",
  "10": "Blekinge län",
  "12": "Skåne län",
  "13": "Hallands län",
  "14": "Västra Götalands län",
  "17": "Värmlands län",
  "18": "Örebro län",
  "19": "Västmanlands län",
  "20": "Dalarnas län",
  "21": "Gävleborgs län",
  "22": "Västernorrlands län",
  "23": "Jämtlands län",
  "24": "Västerbottens län",
  "25": "Norrbottens län",
};

export function platsbankenUrl(label: string): string {
  return `https://arbetsformedlingen.se/platsbanken/annonser?q=${encodeURIComponent(label)}`;
}
