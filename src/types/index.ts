export type Status = 'erstattet' | 'abgelehnt' | 'pruefen' | 'offen';

export interface Vorgang {
  id: string;
  datum: string;
  arzt: string;
  fachrichtung: string;
  betrag: number;
  einsparpotenzial?: number;
  status: Status;
  goaZiffern?: string[];
  faktor?: number;
  flagged?: boolean;
  flagReason?: string;
}

export interface Arzt {
  id: string;
  name: string;
  fachrichtung: string;
  ort: string;
  besuche: number;
  gesamtBetrag: number;
  avgFaktor: number;
  flagged: boolean;
  faktorVerlauf: { datum: string; faktor: number }[];
  alerts: string[];
}

export interface KasseStats {
  erstattungsquote: number;
  erstattungsquoteAvg: number;
  ablehnungsrate: number[];
  stilleKuerzungTotal: number;
  stilleKuerzungen: { kategorie: string; betrag: number; vorgaenge: number }[];
}

export interface DashboardData {
  user: { name: string; tarif: string; kasse: string };
  jahresausgaben: number;
  eigenanteil: number;
  erstattungsquote: number;
  einsparpotenzial: number;
  prognose: number;
  vorgaenge: Vorgang[];
  aerzte: Arzt[];
  kasse: KasseStats;
  ausgabenNachFach: { fach: string; betrag: number; icon: string; farbe: string }[];
}
