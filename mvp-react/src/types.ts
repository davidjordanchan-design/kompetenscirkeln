export interface SkillWeight {
  skillId: string;
  /** Andel annonser (0–1) som nämner kompetensen */
  share: number;
}

export interface Group {
  id: string;
  label: string;
  ssyk: string;
  external?: boolean;
  adCount?: number;
  adsAnalyzed?: number;
}

export interface Occupation {
  id: string;
  label: string;
  groupId: string;
  external?: boolean;
  adCount?: number;
  /** Utbytbarhet enligt Arbetsförmedlingens taxonomi (75 = hög, 25 = låg) */
  substitutes: { id: string; pct: number | null }[];
}

export interface Skill {
  id: string;
  label: string;
  headline: string;
}

export interface BarometerEntry {
  yrke: string;
  jobbmojligheter: string | null; // "små" | "medelstora" | "stora"
  rekrytering: string | null; // "överskott" | "balans" | "brist"
  prognos: string | null; // t.ex. "öka", "vara oförändrad", "minska"
  text: string | null;
}

export interface Dataset {
  meta: {
    demo: boolean;
    generated: string;
    field: { id: string; label: string };
    barometerOmgang: string | null;
    adsAnalyzed: number;
    method: string;
    sources: string[];
  };
  groups: Group[];
  occupations: Occupation[];
  skills: Skill[];
  groupSkills: Record<string, SkillWeight[]>;
  occSkills: Record<string, SkillWeight[]>;
  /** ssyk -> länskod ("00" = riket) -> bedömning */
  barometer: Record<string, Record<string, BarometerEntry>>;
}

export interface Match {
  occupation: Occupation;
  group: Group;
  /** 0–1: hur stor del av yrkets annonsviktade kompetensbehov du täcker */
  score: number;
  have: SkillWeight[];
  missing: SkillWeight[];
  /** Minsta antal saknade kompetenser (i viktordning) för att nå målnivån */
  bridge: SkillWeight[];
  substitutability: number | null;
  barometer: BarometerEntry | null;
}
