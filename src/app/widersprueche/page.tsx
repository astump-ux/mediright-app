export default function WiderspruchPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center gap-4">
      <div className="text-5xl">🔒</div>
      <h1 className="text-2xl" style={{ fontFamily: "'DM Serif Display', Georgia, serif", color: "var(--navy)" }}>
        Widersprüche — Premium-Feature
      </h1>
      <p className="text-slate-500 max-w-md">
        Mit MediRight Premium erstellen wir rechtssichere Widerspruchsschreiben für alle identifizierten Positionen — fertig zum Versand.
      </p>
      <button
        className="mt-2 px-7 py-3.5 rounded-full font-bold text-white text-sm"
        style={{ background: "var(--mint)" }}
      >
        Premium freischalten
      </button>
    </div>
  );
}
