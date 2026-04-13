"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { LayoutDashboard, UserPlus, Play, HelpCircle, Activity } from "lucide-react";

const navLinks = [
  { href: "/dashboard",    label: "Dashboard",    icon: LayoutDashboard },
  { href: "/register",     label: "Register",     icon: UserPlus        },
  { href: "/demo",         label: "Demo",         icon: Play            },
  { href: "/how-it-works", label: "How It Works", icon: HelpCircle      },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 h-screen w-56 bg-black border-r border-white/10 flex flex-col z-40">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-white/10">
        <Link href="/" className="flex items-center gap-2 group">
          <span className="font-mono text-white text-base tracking-tight">KiteGarden</span>
          <span className="font-mono text-white/30 text-xs">β</span>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 flex flex-col gap-1">
        {navLinks.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 text-sm font-mono transition-colors rounded-sm ${
                active
                  ? "bg-white/10 text-white"
                  : "text-white/40 hover:text-white/80 hover:bg-white/5"
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Status */}
      <div className="px-6 py-4 border-t border-white/10">
        <div className="flex items-center gap-2 mb-1">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-xs font-mono text-white/40">Kite testnet</span>
        </div>
        <div className="flex items-center gap-2">
          <Activity className="w-3 h-3 text-white/20" />
          <span className="text-xs font-mono text-white/20">Goldsky live</span>
        </div>
      </div>
    </aside>
  );
}
