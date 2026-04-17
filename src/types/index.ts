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

export interface FachgruppeStats {
  fach: string;           // e.g. "Innere Medizin"
  vorgaenge: number;      // number of Vorgänge in current year
  eingereicht: number;    // € eingereicht bei Kasse
  abgelehnt: number;      // € abgelehnt
  ablehnungsquote: number; // % = abgelehnt/eingereicht*100
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
  widerspruchLaufend?: { betrag: number; count: number };
  kasseName: string;
  fachgruppenStats: FachgruppeStats[];
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

/** One Kassenbescheid that has an active or recently completed savings procedure */
export interface WiderspruchVerfahren {
  kasseId: string
  bescheiddatum: string | null
  referenznummer: string | null
  arztNames: string[]           // from kasse_analyse.rechnungen[].arztName
  // Kassenwiderspruch track (blue)
  betragKasse: number           // betrag_widerspruch_kasse
  kasseStatus: string           // 'keiner'|'erstellt'|'gesendet'|'beantwortet'|'erfolgreich'|'abgelehnt'
  // Arztreklamation track (orange)
  betragArzt: number            // betrag_korrektur_arzt
  arztStatus: string            // 'keiner'|'erstellt'|'gesendet'
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
  einsparpotenzial: number;          // GOÄ / Arzt-side (§12 GOÄ violations, wrong codes)
  widerspruchPotenzialKasse: number; // Kasse-side: formal appeal to insurance
  korrekturArztPotenzial?: number;   // Arzt-side from kasse analysis (aktionstyp='korrektur_arzt')
  widerspruchVerfahren: WiderspruchVerfahren[]  // per-case status for SavingsProgress
  prognose: number;
  monthsWithData: number;
  vorgaenge: Vorgang[];
  aerzte: Arzt[];
  kasse: KasseStats;
  ausgabenNachFach: { fach: string; betrag: number; icon: string; farbe: string }[];
  vorsorgeLeistungen: VorsorgeItem[];
}
