"use client";
import { useEffect, useState } from "react";

interface Profile {
  full_name: string;
  phone_whatsapp: string;
  pkv_name: string;
  pkv_nummer: string;
  pkv_tarif: string;
  pkv_seit: string;
  benachrichtigung_whatsapp: boolean;
  geschlecht: string;
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
  email: "",
};

type SaveState = "idle" | "saving" | "saved" | "error";

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

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then(({ profile: p, email }) => {
        if (p) setProfile({ ...EMPTY, ...p, email: email ?? "" });
        setLoading(false);
      })
      .catch(() => setLoading(false));
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
