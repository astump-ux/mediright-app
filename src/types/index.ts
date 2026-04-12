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
  // Kassenbescheid data per Arzt
  erstattetVonKasse?: number;
  abgelehntVonKasse?: number;
  eingereichtBeiKasse?: number;
}

export interface KasseStats {
  erstattungsquote: number;
  erstattungsquoteAvg: number;
  ablehnungsrate: number[];
  ablehnungsrateReal: number;
  stilleKuerzungTotal: number;
  stilleKuerzungCount: number;
  stilleKuerzungen: { kategorie: string; betrag: number; vorgaenge: number }[];
  totalAbgelehnt: number;
  totalSelbstbehalt: number;
  widerspruchPotenzial: number;
  kasseName: string;
}

export interface VorsorgeItem {
  id: string;
  name: string;
  icon: string;
  fachgebiet: string;
  empfIntervallMonate: number;
  letzteDatum: string | null;
  naechstesDatum: string | null;
  status: 'faellig' | 'bald' | 'ok' | 'unbekannt';
  axaLeistung: boolean;
}

export interface EigenanteilBreakdown {
  abgelehnt: number;
  stilleKuerzungen: number;
  selbstbehalt: number;
  offeneRechnungen: number;
}

export interface DashboardData {
  user: { name: string; tarif: string; kasse: string };
  currentYear: number;
  vorgangCount: number;
  einsparpotenzialCount: number;
  jahresausgaben: number;
  eigenanteil: number;
  eigenanteilBreakdown: EigenanteilBreakdown;
  erstattungsquote: number;
  einsparpotenzial: number;        // GOÄ-based (Ärzte)
  widerspruchPotenzialKasse: number; // Kasse-based (AXA appeals)
  prognose: number;
  monthsWithData: number;
  vorgaenge: Vorgang[];
  aerzte: Arzt[];
  kasse: KasseStats;
  ausgabenNachFach: { fach: string; betrag: number; icon: string; farbe: string }[];
  vorsorgeLeistungen: VorsorgeItem[];
}
