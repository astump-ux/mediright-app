"use client";
import { useEffect, useRef, useState } from "react";

interface Profile {
  full_name: string;
  phone_whatsapp: string;
  pkv_name: string;
  pkv_nummer: string;
  pkv_tarif: string;
  pkv_seit: string;
  benachrichtigung_whatsapp: boolean;
  geschlecht: string;
  geburtsdatum: string;
  vorsorge_link_custom: string;
  email?: string;
}

const EMPTY: Profile = {
  full_name: "",
  phone_whatsapp: "",
  pkv_name: "",
  pkv_nummer: "",
  pkv_tarif: "",
  pkv_seit: "",
  benachrichtigung_whatsapp: true,
  geschlecht: "",
  geburtsdatum: "",
  vorsorge_link_custom: "",
  email: "",
};

type SaveState = "idle" | "saving" | "saved" | "error";
type PdfState  = "idle" | "uploading" | "done" | "error";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      className="rounded-2xl mb-6"
      style={{ background: "var(--card)", border: "1.5px solid var(--border)" }}
    >
      <div className="px-6 py-4 border-b" style={{ borderColor: "var(--border)" }}>
        <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
          {title}
        </h2>
      </div>
      <div className="px-6 py-5 flex flex-col gap-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
        {label}
      </label>
      {children}
      {hint && <p className="text-xs" style={{ color: "var(--text-muted)" }}>{hint}</p>}
    </div>
  );
}

function Input({
  value,
  onChange,
  placeholder,
  type = "text",
  disabled,
}: {
  value: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={onChange ? (e) => onChange(e.target.value) : undefined}
      placeholder={placeholder}
      disabled={disabled}
      className="rounded-xl px-4 py-2.5 text-sm w-full outline-none transition-all"
      style={{
        background: disabled ? "var(--bg-subtle)" : "white",
        border: "1.5px solid var(--border)",
        color: disabled ? "var(--text-muted)" : "var(--text-primary)",
        fontFamily: "inherit",
      }}
    />
  );
}

const PKV_OPTIONS = [
  "AXA",
  "Allianz",
  "Barmenia",
  "Continentale",
  "Debeka",
  "DKV",
  "Gothaer",
  "Hallesche",
  "HUK-Coburg",
  "Inter",
  "Münchener Verein",
  "R+V",
  "Signal Iduna",
  "Süddeutsche Kranken",
  "Universa",
  "uniVersa",
  "Württembergische",
  "Zurich",
];

export default function SettingsClient() {
  const [profile, setProfile] = useState<Profile>(EMPTY);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>("idle");

  // PDF upload state
  const [pdfState, setPdfState] = useState<PdfState>("idle");
  const [pdfResult, setPdfResult] = useState<{ count: number; items: string[] } | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Current Vorsorge config — loaded on mount to show status even after page refresh
  const [vorsorgeConfig, setVorsorgeConfig] = useState<{
    count: number; quelle: string; names: string[]
  } | null>(null);

  useEffect(() => {
    // Load profile
    fetch("/api/settings")
      .then((r) => r.json())
      .then(({ profile: p, email }) => {
        if (p) setProfile({ ...EMPTY, ...p, email: email ?? "" });
        setLoading(false);
      })
      .catch(() => setLoading(false));

    // Load current Vorsorge config status
    fetch("/api/vorsorge/init")
      .then((r) => r.json())
      .then(({ templates }) => {
        if (Array.isArray(templates) && templates.length > 0) {
          setVorsorgeConfig({
            count: templates.length,
            quelle: templates[0]?.quelle ?? "unbekannt",
            names: templates.map((t: { name: string }) => t.name),
          });
        }
      })
      .catch(() => {});
  }, []);

  function set(key: keyof Profile, value: string | boolean) {
    setProfile((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  }

  async function save() {
    setSaveState("saving");
    const { email: _email, ...rest } = profile;
    void _email;
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rest),
      });
      if (!res.ok) throw new Error("API error");
      setSaveState("saved");
      setDirty(false);
      setTimeout(() => setSaveState("idle"), 2500);
    } catch {
      setSaveState("error");
      setTimeout(() => setSaveState("idle"), 3000);
    }
  }

  async function uploadPdf(file: File) {
    setPdfState("uploading");
    setPdfResult(null);
    setPdfError(null);
    try {
      const fd = new FormData();
      fd.append("pdf", file);
      const res = await fetch("/api/vorsorge/upload", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Fehler beim Upload");
      const items = json.items ?? [];
      setPdfResult({ count: json.seeded, items });
      setVorsorgeConfig({ count: json.seeded, quelle: "pdf_upload", names: items });
      setPdfState("done");
    } catch (e) {
      setPdfError(e instanceof Error ? e.message : "Unbekannter Fehler");
      setPdfState("error");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div
          className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: "var(--mint)", borderTopColor: "transparent" }}
        />
      </div>
    );
  }

  return (
    <div>
      {/* ── Persönliche Daten ─────────────────────────────────────────── */}
      <Section title="Persönliche Daten">
        <Field label="Name">
          <Input
            value={profile.full_name}
            onChange={(v) => set("full_name", v)}
            placeholder="Vorname Nachname"
          />
        </Field>
        <Field label="E-Mail-Adresse">
          <Input value={profile.email ?? ""} disabled />
        </Field>
        <Field
          label="WhatsApp-Nummer"
          hint="Format: +49 170 1234567 — wird für den automatischen Rechnungs-Upload verwendet"
        >
          <Input
            value={profile.phone_whatsapp}
            onChange={(v) => set("phone_whatsapp", v)}
            placeholder="+49 170 1234567"
            type="tel"
          />
        </Field>
        <Field
          label="Geschlecht"
          hint="Wird für geschlechtsspezifische Vorsorge-Erinnerungen verwendet (z.B. gynäkologische Vorsorge)"
        >
          <div className="flex gap-2">
            {([["male","Mann"],["female","Frau"],["diverse","Divers"]] as const).map(([val, label]) => (
              <button
                key={val}
                type="button"
                onClick={() => set("geschlecht", val)}
                className="flex-1 rounded-xl py-2.5 text-sm font-medium transition-all"
                style={{
                  background: profile.geschlecht === val ? "var(--navy)" : "white",
                  color: profile.geschlecht === val ? "white" : "var(--text-primary)",
                  border: `1.5px solid ${profile.geschlecht === val ? "var(--navy)" : "var(--border)"}`,
                  fontFamily: "inherit",
                  cursor: "pointer",
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </Field>

        <Field
          label="Geburtsdatum"
          hint="Viele Vorsorgeuntersuchungen sind altersabhängig — z.B. Hautkrebs-Screening erst ab 35, Darmkrebsfrüherkennung ab 50, Prostatauntersuchung ab 45. Mit Ihrem Geburtsdatum zeigt MediRight nur die für Ihr Alter relevanten Erinnerungen."
        >
          <Input
            value={profile.geburtsdatum}
            onChange={(v) => set("geburtsdatum", v)}
            type="date"
          />
        </Field>
      </Section>

      {/* ── PKV-Versicherung ──────────────────────────────────────────── */}
      <Section title="Private Krankenversicherung">
        <div
          className="rounded-xl px-4 py-4 text-sm flex flex-col gap-3"
          style={{
            background: "rgba(92,198,183,0.08)",
            border: "1.5px solid rgba(92,198,183,0.25)",
            color: "var(--text-primary)",
          }}
        >
          <div className="flex gap-2">
            <span>🤖</span>
            <span>
              Durch Angabe Ihrer Versicherung erkennt MediRight Kassenbescheide beim WhatsApp-Upload
              automatisch — kein manuelles Tippen mehr nötig.
            </span>
          </div>
          <div className="h-px" style={{ background: "rgba(92,198,183,0.25)" }} />
          <div className="flex gap-2">
            <span>🎯</span>
            <div className="flex flex-col gap-1">
              <p className="font-semibold" style={{ color: "var(--navy)" }}>Höhere Präzision durch Tarifangabe</p>
              <p style={{ color: "var(--text-muted)" }}>
                Mit Versicherung <strong>und</strong> Tarif analysiert MediRight Ihre Rechnungen und
                Kassenbescheide präziser — abgelehnte Positionen werden tarifgenau bewertet,
                Widerspruchschancen realistischer eingeschätzt.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <span>📅</span>
            <p style={{ color: "var(--text-muted)" }}>
              Die Vorsorge-Erinnerungen werden automatisch auf Ihren Tarif abgestimmt — mit direktem
              Link zu den Leistungsbedingungen Ihrer Versicherung.
            </p>
          </div>
        </div>

        <Field label="Versicherungsgesellschaft">
          <div className="relative">
            <select
              value={profile.pkv_name}
              onChange={(e) => set("pkv_name", e.target.value)}
              className="rounded-xl px-4 py-2.5 text-sm w-full outline-none appearance-none"
              style={{
                background: "white",
                border: "1.5px solid var(--border)",
                color: profile.pkv_name ? "var(--text-primary)" : "var(--text-muted)",
                fontFamily: "inherit",
              }}
            >
              <option value="">Bitte wählen…</option>
              {PKV_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
              <option value="Andere">Andere</option>
            </select>
            <span className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-xs" style={{ color: "var(--text-muted)" }}>▾</span>
          </div>
        </Field>

        {profile.pkv_name === "Andere" && (
          <Field label="Name der Versicherung">
            <Input
              value={profile.pkv_name === "Andere" ? "" : profile.pkv_name}
              onChange={(v) => set("pkv_name", v)}
              placeholder="z.B. Meine Versicherung AG"
            />
          </Field>
        )}

        <div className="grid grid-cols-2 gap-4">
          <Field label="Versicherungsnummer / Mitgliedsnummer">
            <Input
              value={profile.pkv_nummer}
              onChange={(v) => set("pkv_nummer", v)}
              placeholder="z.B. 12345678"
            />
          </Field>
          <Field label="Tarif">
            <Input
              value={profile.pkv_tarif}
              onChange={(v) => set("pkv_tarif", v)}
              placeholder="z.B. ActiveMe-U"
            />
          </Field>
        </div>

        <Field label="Versichert seit">
          <Input
            value={profile.pkv_seit}
            onChange={(v) => set("pkv_seit", v)}
            type="date"
          />
        </Field>
      </Section>

      {/* ── Vorsorge-Unterlagen ───────────────────────────────────────── */}
      <Section title="Vorsorge-Unterlagen">
        {/* Custom URL */}
        <Field
          label="Link zu den Vorsorgebestimmungen Ihrer Kasse"
          hint="Wird im Dashboard als Direktlink zu den Leistungsbedingungen angezeigt — überschreibt den automatischen Link."
        >
          <Input
            value={profile.vorsorge_link_custom}
            onChange={(v) => set("vorsorge_link_custom", v)}
            placeholder="https://www.meinekasse.de/vorsorge"
            type="url"
          />
        </Field>

        {/* Divider */}
        <div className="flex items-center gap-3 my-1">
          <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>oder</span>
          <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
        </div>

        {/* Current config status — shown after page refresh if config exists */}
        {vorsorgeConfig && pdfState === "idle" && (
          <div
            className="rounded-xl px-4 py-3 flex items-start gap-3"
            style={{ background: "rgba(92,198,183,0.07)", border: "1.5px solid rgba(92,198,183,0.2)" }}
          >
            <span className="text-base leading-none mt-0.5">
              {vorsorgeConfig.quelle === "pdf_upload" ? "📄" : "🤖"}
            </span>
            <div className="flex flex-col gap-0.5 flex-1 min-w-0">
              <p className="text-xs font-semibold" style={{ color: "var(--navy)" }}>
                {vorsorgeConfig.count} Vorsorge-Leistungen gespeichert
                <span className="font-normal ml-1" style={{ color: "var(--text-muted)" }}>
                  ({vorsorgeConfig.quelle === "pdf_upload" ? "aus PDF" : vorsorgeConfig.quelle === "ai_research" ? "KI-Recherche" : "Standard"})
                </span>
              </p>
              <p className="text-[11px] truncate" style={{ color: "var(--text-muted)" }}>
                {vorsorgeConfig.names.slice(0, 4).join(" · ")}{vorsorgeConfig.names.length > 4 ? ` + ${vorsorgeConfig.names.length - 4} weitere` : ""}
              </p>
            </div>
          </div>
        )}

        {/* PDF Upload */}
        <Field
          label={vorsorgeConfig ? "Vorsorge-PDF erneut hochladen" : "Leistungsverzeichnis / Vorsorge-PDF hochladen"}
          hint="KI analysiert das PDF alters- und geschlechtsspezifisch und aktualisiert Ihre Vorsorge-Erinnerungen — bisherige Einträge werden ersetzt."
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) uploadPdf(file);
              // Reset input so re-upload of same file triggers onChange
              e.target.value = "";
            }}
          />
          <div className="flex gap-2 items-center flex-wrap">
            <button
              type="button"
              disabled={pdfState === "uploading"}
              onClick={() => fileInputRef.current?.click()}
              className="rounded-xl px-4 py-2.5 text-sm font-semibold flex items-center gap-2 transition-all"
              style={{
                background: pdfState === "uploading" ? "var(--bg-subtle)" : "var(--navy)",
                color: pdfState === "uploading" ? "var(--text-muted)" : "white",
                border: "none",
                cursor: pdfState === "uploading" ? "wait" : "pointer",
                fontFamily: "inherit",
              }}
            >
              {pdfState === "uploading" ? (
                <>
                  <span
                    className="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin inline-block"
                    style={{ borderColor: "var(--text-muted)", borderTopColor: "transparent" }}
                  />
                  Analysiere…
                </>
              ) : (
                <>📄 PDF auswählen & analysieren</>
              )}
            </button>

            {/* Result feedback */}
            {pdfState === "done" && pdfResult && (
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-semibold" style={{ color: "#059669" }}>
                  ✅ {pdfResult.count} Vorsorge-Leistungen erkannt
                </span>
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {pdfResult.items.slice(0, 3).join(", ")}{pdfResult.items.length > 3 ? ` + ${pdfResult.items.length - 3} weitere` : ""}
                </span>
              </div>
            )}
            {pdfState === "error" && pdfError && (
              <span className="text-sm" style={{ color: "#ef4444" }}>❌ {pdfError}</span>
            )}
          </div>
        </Field>
      </Section>

      {/* ── Benachrichtigungen ────────────────────────────────────────── */}
      <Section title="Benachrichtigungen">
        <label className="flex items-center gap-3 cursor-pointer select-none">
          <div
            className="relative w-11 h-6 rounded-full transition-colors"
            style={{
              background: profile.benachrichtigung_whatsapp ? "var(--mint-dark)" : "var(--border)",
            }}
            onClick={() => set("benachrichtigung_whatsapp", !profile.benachrichtigung_whatsapp)}
          >
            <div
              className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform"
              style={{
                transform: profile.benachrichtigung_whatsapp ? "translateX(20px)" : "translateX(2px)",
              }}
            />
          </div>
          <div>
            <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
              WhatsApp-Benachrichtigungen
            </p>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              Analyse-Ergebnis nach PDF-Upload direkt via WhatsApp erhalten
            </p>
          </div>
        </label>
      </Section>

      {/* ── WhatsApp-Anleitung ────────────────────────────────────────── */}
      <section
        className="rounded-2xl mb-8"
        style={{ background: "var(--bg-subtle)", border: "1.5px solid var(--border)" }}
      >
        <div className="px-6 py-4 border-b" style={{ borderColor: "var(--border)" }}>
          <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
            WhatsApp-Upload Anleitung
          </h2>
        </div>
        <div className="px-6 py-5 flex flex-col gap-3 text-sm" style={{ color: "var(--text-primary)" }}>
          <div className="flex gap-3 items-start">
            <span className="text-lg">🧾</span>
            <div>
              <p className="font-medium">Arztrechnung einreichen</p>
              <p style={{ color: "var(--text-muted)" }}>
                PDF einfach an{" "}
                <span className="font-mono font-semibold">+1 415 523 8886</span> schicken — MediRight
                erkennt automatisch, dass es eine Arztrechnung ist.
              </p>
            </div>
          </div>
          <div className="flex gap-3 items-start">
            <span className="text-lg">🏥</span>
            <div>
              <p className="font-medium">Kassenbescheid zuordnen</p>
              <p style={{ color: "var(--text-muted)" }}>
                {profile.pkv_name
                  ? `MediRight erkennt ${profile.pkv_name}-Dokumente automatisch.`
                  : "Wenn Sie Ihre Versicherung oben eintragen, erkennt MediRight Kassenbescheide automatisch."}
              </p>
            </div>
          </div>
          <div className="flex gap-3 items-start">
            <span className="text-lg">📊</span>
            <div>
              <p className="font-medium">Ergebnis</p>
              <p style={{ color: "var(--text-muted)" }}>
                In 1–2 Minuten erhalten Sie die Analyse per WhatsApp — und alles erscheint
                automatisch im Dashboard.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Save bar ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="text-sm" style={{ color: saveState === "error" ? "#ef4444" : "var(--text-muted)" }}>
          {saveState === "saved" && "✅ Gespeichert"}
          {saveState === "error" && "❌ Fehler beim Speichern"}
          {saveState === "idle" && dirty && "Ungespeicherte Änderungen"}
        </div>
        <button
          onClick={save}
          disabled={!dirty || saveState === "saving"}
          className="px-6 py-2.5 rounded-xl text-sm font-semibold text-white transition-all"
          style={{
            background: dirty ? "var(--navy)" : "var(--border)",
            cursor: dirty ? "pointer" : "not-allowed",
          }}
        >
          {saveState === "saving" ? "Speichere…" : "Speichern"}
        </button>
      </div>
    </div>
  );
}
