import { Sidebar } from "@/components/app/sidebar";
import { QueryProvider } from "@/lib/query-provider";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      <div className="min-h-screen bg-black text-white flex relative">
        {/* Hero bg video — same as landing, very low opacity */}
        <div className="fixed inset-0 z-0 pointer-events-none">
          <video
            autoPlay
            muted
            loop
            playsInline
            aria-hidden="true"
            className="w-full h-full object-cover object-center opacity-[0.90]"
          >
            <source src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/bg-hero-0BnFGdr81Ifnj3WbBZoNt1KE4D5DMT.mp4" type="video/mp4" />
          </video>
          {/* Vignette so edges stay dark */}
          <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-transparent to-black/60" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/60" />
        </div>

        <Sidebar />
        <main className="relative z-10 ml-56 flex-1 min-h-screen overflow-x-hidden">
          {children}
        </main>
      </div>
    </QueryProvider>
  );
}
