import Header from "@/components/layout/Header";
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <div className="max-w-[1100px] mx-auto px-6 py-7 pb-20">{children}</div>
      </main>
    </div>
  );
}
