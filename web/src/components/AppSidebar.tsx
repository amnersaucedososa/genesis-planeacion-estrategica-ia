"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LayoutDashboard, Zap, Settings, Activity, BrainCircuit, MessageSquare, Sun, Moon } from "lucide-react";

const links = [
  { href: "/",       label: "Dashboard",    icon: LayoutDashboard },
  { href: "/datos",  label: "Datos y Chat", icon: MessageSquare   },
  { href: "/audit",  label: "Auditoría",    icon: Activity        },
  { href: "/ai-logs",label: "Auditoría IA", icon: BrainCircuit    },
];

// ── Dark mode switch ──────────────────────────────────────────────────────────
function ThemeSwitch() {
  const [dark, setDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    if (next) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  };

  if (!mounted) return <div className="h-6 w-11 rounded-full bg-zinc-200 dark:bg-zinc-700 animate-pulse" />;

  return (
    <button
      type="button"
      onClick={toggle}
      title={dark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
        dark ? "bg-blue-600" : "bg-zinc-200 dark:bg-zinc-700"
      }`}
      role="switch"
      aria-checked={dark}
    >
      {/* Thumb */}
      <span
        className={`pointer-events-none flex h-5 w-5 transform items-center justify-center rounded-full bg-white shadow-sm ring-0 transition-transform duration-200 ${
          dark ? "translate-x-5" : "translate-x-0"
        }`}
      >
        {dark
          ? <Moon  className="h-3 w-3 text-blue-600" />
          : <Sun   className="h-3 w-3 text-amber-500"  />
        }
      </span>
    </button>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
export function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-52 shrink-0 flex-col border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">

      {/* Logo */}
      <div className="flex items-center gap-2.5 border-b border-zinc-200 px-4 py-3.5 dark:border-zinc-800">
        <img
          src="/genesis-logo.jpg"
          alt="Génesis Empresarial"
          className="h-8 w-8 rounded-lg object-cover shrink-0 shadow-sm"
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-zinc-900 dark:text-zinc-50 leading-tight">Génesis</p>
          <p className="truncate text-[10px] text-zinc-400 leading-tight">Planeación Estratégica IA</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-0.5 p-2 pt-3 overflow-y-auto">
        <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">
          Menú
        </p>
        {links.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== "/" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                active
                  ? "bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300"
                  : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
              }`}
            >
              <Icon className={`h-4 w-4 shrink-0 ${active ? "text-blue-600 dark:text-blue-400" : "text-zinc-400"}`} />
              {label}
              {active && (
                <span className="ml-auto h-1.5 w-1.5 rounded-full bg-blue-600 dark:bg-blue-400" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Bottom — Configuración + Theme switch */}
      <div className="border-t border-zinc-100 p-2 dark:border-zinc-800 space-y-1">

        {/* Theme switch row */}
        <div className="flex items-center justify-between rounded-lg px-3 py-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-zinc-400">
              {/* sun/moon icon decorativo al lado del label */}
            </span>
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 select-none">
              Tema
            </span>
          </div>
          <ThemeSwitch />
        </div>

        {/* Configuración link */}
        {(() => {
          const active = pathname.startsWith("/settings");
          return (
            <Link
              href="/settings"
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                active
                  ? "bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300"
                  : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
              }`}
            >
              <Settings className={`h-4 w-4 shrink-0 ${active ? "text-blue-600 dark:text-blue-400" : "text-zinc-400"}`} />
              Configuración
              {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-blue-600 dark:bg-blue-400" />}
            </Link>
          );
        })()}
      </div>
    </aside>
  );
}
