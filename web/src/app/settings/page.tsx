"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Settings, MessageSquare, Mail, Save, Send, Loader2,
  CheckCircle2, AlertCircle, Eye, EyeOff, Info, Zap,
  Brain, Volume2, Presentation, Trash2, AlertTriangle,
  RefreshCw, Wifi, WifiOff, ChevronDown, Bell,
} from "lucide-react";

type Config = {
  wa_number: string; wa_url: string;
  email_to: string; email_from: string;
  smtp_host: string; smtp_port: string; smtp_user: string; smtp_pass: string; smtp_tls: string;
  openai_image_model: string;
  minimax_voice: string;
  ollama_base_url: string; ollama_model: string;
  chat_provider: string; analysis_provider: string; claude_model: string; gemini_model: string;
  notify_whatsapp: string;
  notify_email: string;
};

type TestState = "idle" | "loading" | "ok" | "error";

// ── Helpers ──────────────────────────────────────────────────────────────────

function TestBtn({ label, onTest }: { label: string; onTest: () => Promise<{ ok: boolean; error?: string }> }) {
  const [s, setS] = useState<TestState>("idle");
  const [msg, setMsg] = useState("");
  async function run() {
    setS("loading");
    try {
      const r = await onTest();
      setS(r.ok ? "ok" : "error");
      setMsg(r.ok ? "Enviado correctamente" : (r.error ?? "Error desconocido"));
    } catch (e) { setS("error"); setMsg(String(e)); }
    setTimeout(() => { setS("idle"); setMsg(""); }, 5000);
  }
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button type="button" onClick={run} disabled={s === "loading"}
        className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
          s === "ok" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
          : s === "error" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
          : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
        }`}>
        {s === "loading" ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
          : s === "ok" ? <CheckCircle2 className="h-3.5 w-3.5" />
          : s === "error" ? <AlertCircle className="h-3.5 w-3.5" />
          : <Send className="h-3.5 w-3.5" />}
        {s === "loading" ? "Probando…" : s === "ok" ? "¡Enviado!" : s === "error" ? "Error" : label}
      </button>
      {msg && <span className={`text-xs ${s === "ok" ? "text-emerald-600" : "text-red-500"}`}>{msg}</span>}
    </div>
  );
}

function Field({ label, name, value, onChange, type = "text", placeholder = "", hint, masked = false, half = false }: {
  label: string; name: keyof Config; value: string;
  onChange: (k: keyof Config, v: string) => void;
  type?: string; placeholder?: string; hint?: string; masked?: boolean; half?: boolean;
}) {
  const [show, setShow] = useState(false);
  const isSecret = type === "password" || masked;
  return (
    <div className={half ? "" : "col-span-full sm:col-span-1"}>
      <label className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">{label}</label>
      <div className="relative">
        <input
          type={isSecret ? (show ? "text" : "password") : type}
          value={value}
          onChange={e => onChange(name, e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-900 outline-none transition-all focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:bg-zinc-900"
        />
        {isSecret && (
          <button type="button" onClick={() => setShow(s => !s)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600">
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        )}
      </div>
      {hint && <p className="mt-1 text-[11px] text-zinc-400 leading-relaxed">{hint}</p>}
    </div>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start gap-3">
      <button type="button" onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors ${checked ? "bg-blue-600" : "bg-zinc-300 dark:bg-zinc-600"}`}>
        <div className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-4" : ""}`} />
      </button>
      <div>
        <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{label}</p>
        {hint && <p className="text-[11px] text-zinc-400">{hint}</p>}
      </div>
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-blue-100 bg-blue-50 p-3 dark:border-blue-900/50 dark:bg-blue-950/30">
      <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-blue-500" />
      <p className="text-[11px] text-blue-700 dark:text-blue-300 leading-relaxed">{children}</p>
    </div>
  );
}

function Warn({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-amber-100 bg-amber-50 p-3 dark:border-amber-900/50 dark:bg-amber-950/30">
      <Zap className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-500" />
      <p className="text-[11px] text-amber-700 dark:text-amber-400 leading-relaxed">{children}</p>
    </div>
  );
}

// ── Tabs ─────────────────────────────────────────────────────────────────────

type Tab = { id: string; label: string; icon: React.ElementType; color: string };

const TABS: Tab[] = [
  { id: "motores",        label: "Motores IA",     icon: Brain,         color: "text-blue-600" },
  { id: "notificaciones", label: "Notificaciones", icon: Bell,          color: "text-amber-600"  },
  { id: "minimax",        label: "Audio TTS",      icon: Volume2,       color: "text-blue-600" },
  { id: "gamma",          label: "Gamma",          icon: Presentation,  color: "text-pink-600"   },
  { id: "whatsapp",       label: "WhatsApp",       icon: MessageSquare, color: "text-green-600"  },
  { id: "email",          label: "Email",          icon: Mail,          color: "text-blue-600" },
  { id: "peligro",        label: "Peligro",        icon: Trash2,        color: "text-red-600"    },
];

// ── Contenido de cada tab ────────────────────────────────────────────────────

type ProviderStatus = {
  ok: boolean;
  latency?: number;
  error?: string;
  models?: string[];
};

type AllStatus = {
  claude?: ProviderStatus;
  gemini?: ProviderStatus;
  ollama?: ProviderStatus;
  openai?: ProviderStatus;
};

function StatusPill({ status }: { status: ProviderStatus | undefined; }) {
  if (!status) return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-2.5 py-1 text-[10px] font-semibold text-zinc-500 dark:bg-zinc-800">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-zinc-400" /> Verificando…
    </span>
  );
  if (status.ok) return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
      <Wifi className="h-3 w-3" /> Conectado{status.latency ? ` · ${status.latency}ms` : ""}
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-2.5 py-1 text-[10px] font-semibold text-red-700 dark:bg-red-900/30 dark:text-red-300">
      <WifiOff className="h-3 w-3" /> Sin conexión
    </span>
  );
}

function ModelSelect({ value, onChange, options }: {
  value: string;
  onChange: (v: string) => void;
  options: { id: string; label: string; sub: string }[];
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full appearance-none rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 pr-8 text-sm font-medium text-zinc-800 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
      >
        {options.map(o => (
          <option key={o.id} value={o.id}>{o.label} — {o.sub}</option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
    </div>
  );
}

type OllamaModelInfo = {
  name: string;
  size: string;
  family: string;
  paramSize: string;
  quant: string;
  isCloud: boolean;
};

function TabMotores({ config, set }: { config: Config; set: (k: keyof Config, v: string) => void }) {
  const [status, setStatus] = useState<AllStatus>({});
  const [checking, setChecking] = useState(true);
  const [activeMotor, setActiveMotor] = useState("claude");

  // Ollama scan state (independiente del check general)
  const [ollamaModels, setOllamaModels] = useState<OllamaModelInfo[]>([]);
  const [ollamaScanning, setOllamaScanning] = useState(false);
  const [ollamaError, setOllamaError] = useState<string | null>(null);
  const [customModel, setCustomModel] = useState("");

  async function scanOllama(url?: string) {
    const targetUrl = url ?? config.ollama_base_url;
    setOllamaScanning(true);
    setOllamaError(null);
    try {
      const res = await fetch(`/api/settings/ollama-models?url=${encodeURIComponent(targetUrl)}`);
      const data = await res.json() as { ok: boolean; models?: OllamaModelInfo[]; error?: string };
      if (data.ok && data.models) {
        setOllamaModels(data.models);
      } else {
        setOllamaError(data.error ?? "No se pudieron obtener los modelos");
      }
    } catch (e) {
      setOllamaError(String(e));
    }
    setOllamaScanning(false);
  }

  async function checkAll() {
    setChecking(true);
    setStatus({});
    try {
      const res = await fetch("/api/settings/check-providers");
      const data = await res.json() as AllStatus;
      setStatus(data);
    } catch {
      setStatus({ claude: { ok: false, error: "Error de red" }, gemini: { ok: false, error: "Error de red" }, ollama: { ok: false, error: "Error de red" }, openai: { ok: false, error: "Error de red" } });
    }
    setChecking(false);
  }

  useEffect(() => {
    void checkAll();
    void scanOllama();  // escanear modelos Ollama al cargar
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const motors = [
    {
      id: "claude",
      emoji: "🧠",
      label: "Claude",
      company: "Anthropic",
      accentBorder: "border-blue-300 dark:border-blue-700",
      accentBg: "bg-blue-50 dark:bg-blue-950/30",
      accentRing: "ring-blue-400",
      statusKey: "claude" as const,
      modelKey: "claude_model" as keyof Config,
      modelOptions: [
        { id: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet",  sub: "Mejor calidad · Recomendado" },
        { id: "claude-3-5-haiku-20241022",  label: "Claude 3.5 Haiku",   sub: "Más rápido · Económico"      },
        { id: "claude-3-opus-20240229",     label: "Claude 3 Opus",      sub: "Máxima capacidad"            },
      ],
      hint: "Requiere ANTHROPIC_API_KEY en .env",
    },
    {
      id: "gemini",
      emoji: "✨",
      label: "Gemini",
      company: "Google AI",
      accentBorder: "border-blue-300 dark:border-blue-700",
      accentBg: "bg-blue-50 dark:bg-blue-950/30",
      accentRing: "ring-blue-400",
      statusKey: "gemini" as const,
      modelKey: "gemini_model" as keyof Config,
      modelOptions: [
        { id: "gemini-1.5-flash",  label: "Gemini 1.5 Flash", sub: "Rápido · Económico" },
        { id: "gemini-1.5-pro",    label: "Gemini 1.5 Pro",   sub: "Alta capacidad"     },
        { id: "gemini-2.0-flash",  label: "Gemini 2.0 Flash", sub: "Más reciente"       },
      ],
      hint: "Requiere GEMINI_API_KEY en .env",
    },
    {
      id: "ollama",
      emoji: "🦙",
      label: "Ollama",
      company: "Local · Privado",
      accentBorder: "border-emerald-300 dark:border-emerald-700",
      accentBg: "bg-emerald-50 dark:bg-emerald-950/30",
      accentRing: "ring-emerald-400",
      statusKey: "ollama" as const,
      modelKey: "ollama_model" as keyof Config,
      modelOptions: null, // dinámico
      hint: "Ejecuta: ollama serve",
    },
    {
      id: "openai",
      emoji: "🤖",
      label: "OpenAI",
      company: "Imágenes IA",
      accentBorder: "border-rose-300 dark:border-rose-700",
      accentBg: "bg-rose-50 dark:bg-rose-950/30",
      accentRing: "ring-rose-400",
      statusKey: "openai" as const,
      modelKey: "openai_image_model" as keyof Config,
      modelOptions: [
        { id: "gpt-image-2", label: "gpt-image-2", sub: "Último · Máxima calidad · Recomendado" },
        { id: "gpt-image-1", label: "gpt-image-1", sub: "Alta calidad"                        },
        { id: "dall-e-3",    label: "DALL·E 3",    sub: "Compatible · Buena calidad"           },
      ],
      hint: "Usa OPENAI_API_KEY del .env · Solo para generación de imágenes",
    },
  ];

  const m = motors.find(x => x.id === activeMotor)!;
  const st = status[m.statusKey];
  const isForChat     = config.chat_provider     === m.id;
  const isForAnalysis = config.analysis_provider === m.id;
  const isActiveMotor = m.id !== "openai";
  const isOnline      = st?.ok === true;
  const isChecking    = !st;

  return (
    <div className="flex flex-col h-full gap-0">

      {/* ── Tabs de motores ── */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        {motors.map(t => {
          const tSt = status[t.statusKey];
          const isSel = activeMotor === t.id;
          const tOnline = tSt?.ok === true;
          const tChat = config.chat_provider === t.id;
          const tAnalysis = config.analysis_provider === t.id;
          return (
            <button key={t.id} type="button" onClick={() => setActiveMotor(t.id)}
              className={`flex items-center gap-2 rounded-2xl border-2 px-4 py-2.5 text-sm font-semibold transition-all ${
                isSel
                  ? `${t.accentBorder} ${t.accentBg} shadow-sm`
                  : "border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:border-zinc-600"
              }`}>
              <span className="text-base">{t.emoji}</span>
              <span className={isSel ? "text-zinc-900 dark:text-zinc-50" : "text-zinc-600 dark:text-zinc-400"}>{t.label}</span>
              {/* Punto online */}
              <span className={`h-2 w-2 rounded-full shrink-0 ${
                !tSt ? "bg-zinc-300 animate-pulse"
                : tOnline ? "bg-emerald-500"
                : "bg-red-400"
              }`} />
              {/* Badges de uso en miniatura */}
              {tChat     && <span className="rounded-full bg-blue-600 px-1.5 py-0.5 text-[8px] font-bold text-white">Chat</span>}
              {tAnalysis && <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[8px] font-bold text-white">IA</span>}
            </button>
          );
        })}
        <button type="button" onClick={checkAll} disabled={checking}
          className="ml-auto flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-500 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">
          <RefreshCw className={`h-3 w-3 ${checking ? "animate-spin text-blue-500" : ""}`} />
          {checking ? "Verificando…" : "Re-verificar"}
        </button>
      </div>

      {/* ── Panel del motor seleccionado ── */}
      <div className={`flex-1 rounded-2xl border-2 p-6 transition-all ${
        (isForChat || isForAnalysis) && isActiveMotor
          ? `${m.accentBorder} ${m.accentBg}`
          : "border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-800/40"
      }`}>

        {/* Encabezado */}
        <div className="flex items-center gap-4 mb-6">
          <span className="text-5xl">{m.emoji}</span>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-xl font-extrabold text-zinc-900 dark:text-zinc-50">{m.label}</h2>
              <span className={`h-2.5 w-2.5 rounded-full ${
                isChecking ? "bg-zinc-300 animate-pulse" : isOnline ? "bg-emerald-500" : "bg-red-400"
              }`} />
              <span className={`text-xs font-medium ${
                isChecking ? "text-zinc-400" : isOnline ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"
              }`}>
                {isChecking ? "Verificando conexión…" : isOnline ? `Conectado${st.latency ? ` · ${st.latency}ms` : ""}` : "Sin conexión"}
              </span>
            </div>
            <p className="text-sm text-zinc-400">{m.company}</p>
          </div>
        </div>

        {/* Error */}
        {st && !st.ok && st.error && (
          <div className="mb-5 flex items-start gap-2 rounded-xl bg-red-50 border border-red-100 px-4 py-3 dark:bg-red-950/20 dark:border-red-900/50">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-500" />
            <p className="text-sm text-red-600 dark:text-red-400">{st.error.replace(/^HTTP \d+: /, "")}</p>
          </div>
        )}

        {/* Botones de uso — grandes y claros */}
        {isActiveMotor ? (
          <div className="grid grid-cols-2 gap-3 mb-6">
            <button type="button" onClick={() => set("chat_provider", m.id)}
              className={`flex flex-col items-center gap-2 rounded-2xl border-2 py-5 px-4 transition-all ${
                isForChat
                  ? "border-blue-400 bg-blue-600 text-white shadow-lg scale-[1.01]"
                  : "border-zinc-200 bg-zinc-50 text-zinc-500 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600 dark:border-zinc-600 dark:bg-zinc-800/80"
              }`}>
              <span className="text-3xl">{isForChat ? "✅" : "💬"}</span>
              <span className="text-base font-bold">{isForChat ? "Usando para Chat" : "Usar para Chat"}</span>
              <span className={`text-xs text-center ${isForChat ? "text-blue-200" : "text-zinc-400"}`}>
                {isForChat ? "Este motor responde en el chat" : "Haz clic para que este motor responda en el chat"}
              </span>
            </button>
            <button type="button" onClick={() => set("analysis_provider", m.id)}
              className={`flex flex-col items-center gap-2 rounded-2xl border-2 py-5 px-4 transition-all ${
                isForAnalysis
                  ? "border-amber-400 bg-amber-500 text-white shadow-lg scale-[1.01]"
                  : "border-zinc-200 bg-zinc-50 text-zinc-500 hover:border-amber-300 hover:bg-amber-50 hover:text-amber-600 dark:border-zinc-600 dark:bg-zinc-800/80"
              }`}>
              <span className="text-3xl">{isForAnalysis ? "✅" : "⚙️"}</span>
              <span className="text-base font-bold">{isForAnalysis ? "Usando para Análisis" : "Usar para Análisis"}</span>
              <span className={`text-xs text-center ${isForAnalysis ? "text-amber-100" : "text-zinc-400"}`}>
                {isForAnalysis ? "Este motor analiza los datos del pipeline" : "Haz clic para que este motor analice los datos"}
              </span>
            </button>
          </div>
        ) : (
          <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 dark:border-rose-900/40 dark:bg-rose-950/20">
            <p className="text-sm text-rose-600 dark:text-rose-400">🖼️ OpenAI solo se usa para <strong>generar imágenes</strong> desde el botón Imagen del chat. No aplica para chat ni análisis.</p>
          </div>
        )}

        {/* Versión del modelo */}
        <div className="border-t border-zinc-200/60 dark:border-zinc-700 pt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-400">
            {m.id === "openai" ? "Modelo para imágenes" : "Versión del modelo"}
          </p>
          {m.id === "ollama" ? (
            <div className="space-y-4">

              {/* URL + Escanear */}
              <div>
                <p className="mb-1.5 text-[11px] font-semibold text-zinc-400 uppercase tracking-widest">URL del servidor</p>
                <div className="flex gap-2">
                  <input type="text" value={config.ollama_base_url}
                    onChange={e => set("ollama_base_url", e.target.value)}
                    placeholder="http://localhost:11434"
                    className="flex-1 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 font-mono text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100" />
                  <button type="button"
                    onClick={() => void scanOllama(config.ollama_base_url)}
                    disabled={ollamaScanning}
                    className="flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700 transition-all hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400">
                    {ollamaScanning
                      ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Escaneando…</>
                      : <><RefreshCw className="h-3.5 w-3.5" /> Escanear</>}
                  </button>
                </div>
                <p className="mt-1 text-[11px] text-zinc-400">Usa la URL interna real de Ollama (no el dominio de esta app).</p>
              </div>

              {/* Error de escaneo */}
              {ollamaError && (
                <div className="flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2.5 dark:border-red-900/40 dark:bg-red-950/20">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-red-500" />
                  <p className="text-[11px] text-red-600 dark:text-red-400">{ollamaError}</p>
                </div>
              )}

              {/* Modelos disponibles */}
              {ollamaModels.length > 0 && (
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-widest">
                      Modelos disponibles
                    </p>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[9px] font-bold text-zinc-500 dark:bg-zinc-800">
                        {ollamaModels.filter(m => !m.isCloud).length} locales
                      </span>
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[9px] font-bold text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                        {ollamaModels.filter(m => m.isCloud).length} cloud
                      </span>
                    </div>
                  </div>
                  <div className="max-h-52 overflow-y-auto rounded-xl border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-700 dark:bg-zinc-800/50">
                    <div className="flex flex-wrap gap-1.5">
                      {ollamaModels.map(mod => {
                        const isSelected = config.ollama_model === mod.name;
                        return (
                          <button key={mod.name} type="button"
                            onClick={() => set("ollama_model", mod.name)}
                            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all ${
                              isSelected
                                ? "border-emerald-400 bg-emerald-500 text-white shadow-sm ring-1 ring-emerald-400"
                                : mod.isCloud
                                ? "border-blue-200 bg-blue-50 text-blue-700 hover:border-blue-400 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300"
                                : "border-zinc-200 bg-white text-zinc-600 hover:border-emerald-300 hover:bg-emerald-50 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-300"
                            }`}>
                            <span className="text-[11px]">{mod.isCloud ? "☁️" : "🦙"}</span>
                            <span className="max-w-[200px] truncate">{mod.name}</span>
                            {mod.size && !isSelected && (
                              <span className={`text-[9px] ${mod.isCloud ? "text-blue-400" : "text-zinc-400"}`}>{mod.size}</span>
                            )}
                            {isSelected && <CheckCircle2 className="h-3 w-3 shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Sin escaneo aún: input manual */}
              {ollamaModels.length === 0 && !ollamaScanning && (
                <div>
                  <p className="mb-1.5 text-[11px] font-semibold text-zinc-400 uppercase tracking-widest">Modelo activo</p>
                  <input type="text" value={config.ollama_model}
                    onChange={e => set("ollama_model", e.target.value)}
                    placeholder="llama3.2"
                    className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100" />
                  <p className="mt-1 text-[11px] text-zinc-400">
                    Haz clic en <strong>Escanear</strong> para ver todos los modelos disponibles (locales + cloud).
                  </p>
                </div>
              )}

              {/* Agregar modelo manual */}
              {ollamaModels.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[11px] font-semibold text-zinc-400 uppercase tracking-widest">Nombre del modelo (manual)</p>
                  <div className="flex gap-2">
                    <input type="text" value={customModel}
                      onChange={e => setCustomModel(e.target.value)}
                      placeholder="ej: gemma2:9b"
                      className="flex-1 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100" />
                    <button type="button"
                      onClick={() => { if (customModel.trim()) { set("ollama_model", customModel.trim()); setCustomModel(""); } }}
                      disabled={!customModel.trim()}
                      className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-600 transition hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                      <CheckCircle2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* Modelo seleccionado actualmente */}
              {config.ollama_model && (
                <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 dark:border-emerald-800 dark:bg-emerald-950/20">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                    Modelo seleccionado: <code className="font-mono">{config.ollama_model}</code>
                  </p>
                </div>
              )}
            </div>
          ) : (
            <ModelSelect
              value={config[m.modelKey] || m.modelOptions![0].id}
              onChange={v => set(m.modelKey, v)}
              options={m.modelOptions!}
            />
          )}
        </div>
      </div>
    </div>
  );
}

const VOICE_SAMPLE = "Hola, soy el asistente de Planeación Estratégica de Fundación Génesis Empresarial. Estoy listo para ayudarte a analizar indicadores y generar reportes ejecutivos.";

type VoiceItem = {
  voice_id: string;
  name?: string;
  gender?: string;
  language?: string;
  description?: string;
};

const GENDER_EMOJI: Record<string, string> = {
  female:  "👩",
  male:    "👨",
  neutral: "🎙️",
};

const GENDER_LABEL: Record<string, string> = {
  female:  "Femenina",
  male:    "Masculina",
  neutral: "Neutra",
};

function TabMinimax({ config, set }: { config: Config; set: (k: keyof Config, v: string) => void }) {
  const [testing,   setTesting]   = useState<string | null>(null);
  const [audioUrl,  setAudioUrl]  = useState<string | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [voices,    setVoices]    = useState<VoiceItem[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(true);
  const [voiceSource, setVoiceSource] = useState<"api" | "preset">("preset");
  const [filterGender, setFilterGender] = useState<"all" | "female" | "male" | "neutral">("all");

  useEffect(() => {
    void (async () => {
      try {
        const res  = await fetch("/api/media/tts-voices");
        const data = await res.json() as { ok: boolean; voices?: VoiceItem[]; source?: "api" | "preset" };
        if (data.ok && data.voices) {
          setVoices(data.voices);
          setVoiceSource(data.source ?? "preset");
        }
      } catch { /* usa lista vacía */ }
      setLoadingVoices(false);
    })();
  }, []);

  async function probarVoz(voiceId: string) {
    setTesting(voiceId);
    setAudioUrl(null);
    setTestError(null);
    try {
      const res = await fetch("/api/media/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: VOICE_SAMPLE, voice: voiceId }),
      });
      const json = await res.json() as { ok?: boolean; audio?: string; mime?: string; error?: string };
      if (!res.ok || json.error) {
        setTestError(json.error ?? `Error ${res.status}`);
      } else if (json.audio) {
        const binary = atob(json.audio);
        const bytes  = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const blob = new Blob([bytes], { type: json.mime ?? "audio/mpeg" });
        const url  = URL.createObjectURL(blob);
        setAudioUrl(url);
        new Audio(url).play().catch(() => {});
      }
    } catch (e) {
      setTestError(String(e));
    }
    setTesting(null);
  }

  const displayed = filterGender === "all"
    ? voices
    : voices.filter(v => (v.gender ?? "neutral") === filterGender);

  return (
    <div className="space-y-5">

      {/* Nota .env */}
      <div className="flex items-start gap-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800">
        <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-zinc-400" />
        <p className="text-[11px] text-zinc-500 leading-relaxed dark:text-zinc-400">
          Credenciales <strong className="text-zinc-700 dark:text-zinc-300">MINIMAX_API_KEY</strong> y{" "}
          <strong className="text-zinc-700 dark:text-zinc-300">MINIMAX_GROUP_ID</strong> se leen del archivo{" "}
          <code className="font-mono bg-zinc-200 dark:bg-zinc-700 px-1 rounded">.env</code>.
          {voiceSource === "api"
            ? <span className="ml-1 text-emerald-600 dark:text-emerald-400 font-semibold">✓ Voces obtenidas del API ({voices.length})</span>
            : <span className="ml-1 text-amber-600 dark:text-amber-400 font-semibold">· {voices.length} voces preset</span>}
        </p>
      </div>

      {/* Filtro de género */}
      {!loadingVoices && voices.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-widest">Filtrar</p>
          {(["all", "female", "male", "neutral"] as const).map(g => (
            <button key={g} type="button" onClick={() => setFilterGender(g)}
              className={`rounded-lg px-3 py-1 text-xs font-semibold transition-all ${
                filterGender === g
                  ? "bg-blue-600 text-white"
                  : "border border-zinc-200 bg-zinc-50 text-zinc-500 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400"
              }`}>
              {g === "all" ? `Todas (${voices.length})` : g === "female" ? `👩 Femeninas` : g === "male" ? `👨 Masculinas` : `🎙️ Neutras`}
            </button>
          ))}
        </div>
      )}

      {/* Grid de voces */}
      <div>
        <p className="mb-2 text-xs font-semibold text-zinc-600 dark:text-zinc-400">Voz del asistente</p>

        {loadingVoices ? (
          <div className="flex h-32 items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800">
            <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
            <span className="text-sm text-zinc-400">Cargando voces desde MiniMax…</span>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {displayed.map(v => {
              const isActive  = config.minimax_voice === v.voice_id;
              const isLoading = testing === v.voice_id;
              const gender    = v.gender ?? "neutral";
              const emoji     = GENDER_EMOJI[gender] ?? "🎙️";
              const gLabel    = GENDER_LABEL[gender] ?? "Neutra";
              const displayName = v.name ?? v.voice_id.replace(/_/g, " ");
              const desc = v.description ?? `${gLabel}`;
              return (
                <div key={v.voice_id}
                  className={`flex flex-col rounded-xl border transition-all ${
                    isActive
                      ? "border-blue-400 bg-blue-50 ring-1 ring-blue-400 dark:border-blue-700 dark:bg-blue-950/30"
                      : "border-zinc-200 bg-zinc-50 hover:border-blue-200 dark:border-zinc-700 dark:bg-zinc-800"
                  }`}>
                  {/* Seleccionar */}
                  <button type="button" onClick={() => set("minimax_voice", v.voice_id)}
                    className="flex flex-col items-center gap-1 p-3 text-center w-full flex-1">
                    <span className="text-2xl">{emoji}</span>
                    <p className="text-[11px] font-bold text-zinc-800 dark:text-zinc-100 leading-tight">{displayName}</p>
                    <p className="text-[9px] text-zinc-400 leading-tight">{desc}</p>
                    {isActive && (
                      <span className="mt-0.5 inline-flex items-center gap-0.5 rounded-full bg-blue-600 px-2 py-0.5 text-[8px] font-bold text-white">
                        ✓ Activa
                      </span>
                    )}
                  </button>
                  {/* Botón probar */}
                  <button type="button"
                    onClick={() => void probarVoz(v.voice_id)}
                    disabled={isLoading || !!testing}
                    className={`flex items-center justify-center gap-1 rounded-b-xl border-t py-1.5 text-[10px] font-semibold transition-all disabled:opacity-50 ${
                      isActive
                        ? "border-blue-200 text-blue-600 hover:bg-blue-100 dark:border-blue-800 dark:text-blue-400 dark:hover:bg-blue-900/30"
                        : "border-zinc-200 text-zinc-500 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-700"
                    }`}>
                    {isLoading
                      ? <><Loader2 className="h-3 w-3 animate-spin" /> Generando…</>
                      : <>▶ Probar</>}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Voz activa seleccionada */}
      {config.minimax_voice && (
        <div className="flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 dark:border-blue-800 dark:bg-blue-950/20">
          <CheckCircle2 className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
          <p className="text-[11px] font-semibold text-blue-700 dark:text-blue-300">
            Voz activa: <code className="font-mono">{config.minimax_voice}</code>
          </p>
        </div>
      )}

      {/* Error de prueba */}
      {testError && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 dark:border-red-900/50 dark:bg-red-950/20">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-red-500" />
          <p className="text-[11px] text-red-700 dark:text-red-300 leading-relaxed">{testError}</p>
        </div>
      )}

      {/* Confirmación visual mínima de que el audio se está reproduciendo */}
      {audioUrl && (
        <div className="flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 dark:border-blue-800 dark:bg-blue-950/20">
          <span className="flex gap-0.5">
            {[0, 1, 2].map(i => (
              <span key={i} className="inline-block w-1 rounded-full bg-blue-500 animate-bounce"
                style={{ height: "12px", animationDelay: `${i * 0.15}s` }} />
            ))}
          </span>
          <p className="text-[11px] font-semibold text-blue-600 dark:text-blue-400">Reproduciendo muestra…</p>
        </div>
      )}

      <Hint>
        Haz clic en <strong>▶ Probar</strong> para escuchar una muestra real. La voz activa se usa en el botón <strong>🎙️ Audio</strong> del chat.
      </Hint>
    </div>
  );
}


function TabGamma({ config: _config, set: _set }: { config: Config; set: (k: keyof Config, v: string) => void }) {
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800">
        <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-zinc-400" />
        <p className="text-[11px] text-zinc-500 leading-relaxed dark:text-zinc-400">
          La clave <strong className="text-zinc-700 dark:text-zinc-300">GAMMA_API_KEY</strong> se configura en el archivo <code className="font-mono bg-zinc-200 dark:bg-zinc-700 px-1 rounded">.env</code>. Sin key, el botón 🎯 Gamma abre Gamma.app con el contenido pre-cargado para que tú generes la presentación con un clic.
        </p>
      </div>
      <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800">
        <p className="text-xs font-bold text-zinc-700 dark:text-zinc-200 mb-2">¿Cómo funciona?</p>
        <div className="space-y-2">
          {[
            { emoji: "1️⃣", text: "Desde el chat, haz clic en 🎯 Gamma" },
            { emoji: "2️⃣", text: "El agente genera un outline ejecutivo con datos del dashboard" },
            { emoji: "3️⃣", text: "Sin API key → se abre Gamma.app con el texto pre-cargado, tú generas con un clic" },
            { emoji: "4️⃣", text: "Con API key → se crea la presentación automáticamente y te devuelve el link" },
          ].map(s => (
            <div key={s.emoji} className="flex items-start gap-2 text-xs text-zinc-600 dark:text-zinc-400">
              <span>{s.emoji}</span>
              <span>{s.text}</span>
            </div>
          ))}
        </div>
      </div>
      <Hint>
        La presentación incluye: estado de indicadores, alertas críticas, arquitectura Multi-LLM y próximos pasos —
        todo generado automáticamente a partir de los datos del pipeline.
      </Hint>
    </div>
  );
}

function TabNotificaciones({ config, set }: { config: Config; set: (k: keyof Config, v: string) => void }) {
  const waOn    = config.notify_whatsapp === "1";
  const emailOn = config.notify_email    === "1";

  const channels = [
    {
      key:     "notify_whatsapp" as keyof Config,
      on:      waOn,
      emoji:   "📱",
      label:   "WhatsApp",
      desc:    "Envía cada alerta + resumen del run por WhatsApp al número configurado",
      color:   "emerald",
      check:   !!config.wa_number && !!config.wa_url,
      warning: !config.wa_number ? "Configura el número en la pestaña WhatsApp" : undefined,
      tab:     "whatsapp",
    },
    {
      key:     "notify_email" as keyof Config,
      on:      emailOn,
      emoji:   "✉️",
      label:   "Email / Gmail",
      desc:    "Envía un reporte HTML ejecutivo con alertas, gráficas y KPIs al correo configurado",
      color:   "indigo",
      check:   !!config.email_to && !!config.smtp_host && !!config.smtp_user,
      warning: !config.email_to ? "Configura el destino en la pestaña Email" : undefined,
      tab:     "email",
    },
  ] as const;

  type Channel = typeof channels[number];

  function borderColor(ch: Channel) {
    if (!ch.on) return "border-zinc-200 dark:border-zinc-700";
    return ch.color === "emerald"
      ? "border-emerald-400 dark:border-emerald-600"
      : "border-blue-400 dark:border-blue-600";
  }
  function bgColor(ch: Channel) {
    if (!ch.on) return "bg-white dark:bg-zinc-800/40";
    return ch.color === "emerald"
      ? "bg-emerald-50 dark:bg-emerald-950/20"
      : "bg-blue-50 dark:bg-blue-950/20";
  }
  function dotColor(ch: Channel) {
    if (!ch.on) return "bg-zinc-300 dark:bg-zinc-600";
    return ch.color === "emerald" ? "bg-emerald-500" : "bg-blue-500";
  }
  function toggleBg(ch: Channel) {
    if (!ch.on) return "bg-zinc-300 dark:bg-zinc-600";
    return ch.color === "emerald" ? "bg-emerald-500" : "bg-blue-500";
  }

  return (
    <div className="space-y-6">

      {/* Encabezado */}
      <div className="flex items-start gap-2 rounded-xl border border-amber-100 bg-amber-50 p-3 dark:border-amber-900/40 dark:bg-amber-950/20">
        <Bell className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-500" />
        <p className="text-[11px] text-amber-700 dark:text-amber-400 leading-relaxed">
          Elige qué canales reciben las notificaciones automáticas al final de cada ejecución del pipeline.
          Puedes activar ambos al mismo tiempo.
        </p>
      </div>

      {/* Resumen de estado */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">Canales activos:</span>
        {!waOn && !emailOn && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-500 dark:bg-zinc-800">
            🔕 Ninguno (silencioso)
          </span>
        )}
        {waOn && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
            📱 WhatsApp activo
          </span>
        )}
        {emailOn && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
            ✉️ Email activo
          </span>
        )}
      </div>

      {/* Cards de canales */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {channels.map(ch => (
          <div key={ch.key}
            className={`rounded-2xl border-2 p-5 transition-all ${borderColor(ch)} ${bgColor(ch)}`}>

            {/* Header de la card */}
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{ch.emoji}</span>
                <div>
                  <p className="text-sm font-bold text-zinc-800 dark:text-zinc-100">{ch.label}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className={`h-2 w-2 rounded-full ${dotColor(ch)}`} />
                    <span className={`text-[10px] font-semibold ${ch.on ? (ch.color === "emerald" ? "text-emerald-600 dark:text-emerald-400" : "text-blue-600 dark:text-blue-400") : "text-zinc-400"}`}>
                      {ch.on ? "Activo" : "Inactivo"}
                    </span>
                  </div>
                </div>
              </div>
              {/* Toggle */}
              <button type="button"
                onClick={() => set(ch.key, ch.on ? "0" : "1")}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${toggleBg(ch)}`}>
                <div className={`absolute top-1 left-1 h-4 w-4 rounded-full bg-white shadow transition-transform ${ch.on ? "translate-x-5" : ""}`} />
              </button>
            </div>

            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed mb-3">{ch.desc}</p>

            {/* Warning si falta config */}
            {ch.on && ch.warning && (
              <div className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 dark:border-amber-800 dark:bg-amber-950/20">
                <AlertTriangle className="h-3 w-3 shrink-0 text-amber-500" />
                <p className="text-[10px] text-amber-600 dark:text-amber-400">{ch.warning}</p>
              </div>
            )}

            {/* Check de que la config está completa */}
            {ch.on && !ch.warning && (
              <div className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-2 dark:border-emerald-800 dark:bg-emerald-950/20">
                <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-500" />
                <p className="text-[10px] text-emerald-600 dark:text-emerald-400">Configurado correctamente</p>
              </div>
            )}

            {/* Estado inactivo */}
            {!ch.on && (
              <div className="flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-2 dark:border-zinc-700 dark:bg-zinc-800">
                <span className="text-[10px] text-zinc-400">Activa el toggle para recibir notificaciones por este canal</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Cuándo se envía */}
      <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800">
        <p className="text-xs font-bold text-zinc-700 dark:text-zinc-200 mb-3">¿Cuándo se envían?</p>
        <div className="space-y-2">
          {[
            { emoji: "🔴", text: "Al detectar indicadores en ROJO (desviación >5%)" },
            { emoji: "🟡", text: "Al detectar proyectos en AMARILLO o ROJO (5-15pp / >15pp)" },
            { emoji: "📊", text: "Resumen del run al finalizar: total alertas, rojas, amarillas" },
          ].map(s => (
            <div key={s.emoji} className="flex items-start gap-2 text-xs text-zinc-600 dark:text-zinc-400">
              <span className="shrink-0">{s.emoji}</span>
              <span>{s.text}</span>
            </div>
          ))}
        </div>
      </div>

      <Hint>
        Guarda los cambios con el botón <strong>Guardar</strong> para que tomen efecto en la próxima ejecución del pipeline.
      </Hint>
    </div>
  );
}

function TabWhatsapp({ config, set }: { config: Config; set: (k: keyof Config, v: string) => void }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Número de destino" name="wa_number" value={config.wa_number} onChange={set}
          placeholder="50249899115" hint="Con código de país, sin + ni espacios" />
        <Field label="URL del servidor WhatsApp" name="wa_url" value={config.wa_url} onChange={set}
          placeholder="http://161.97.129.17:3001/send" hint="Endpoint que recibe { number, message }" />
      </div>
      <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800">
        <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 mb-2">Probar configuración actual</p>
        <TestBtn label="Enviar mensaje de prueba" onTest={async () => {
          const r = await fetch("/api/settings/test-wa", { method: "POST" });
          return r.json() as Promise<{ ok: boolean; error?: string }>;
        }} />
      </div>
      <Hint>
        Se envía automáticamente después de cada ejecución del pipeline con un resumen de alertas críticas.
        También puedes enviarlo manualmente desde el botón <strong>📱 WhatsApp</strong> del chat.
      </Hint>
    </div>
  );
}

function TabEmail({ config, set }: { config: Config; set: (k: keyof Config, v: string) => void }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Enviar reporte a" name="email_to" value={config.email_to} onChange={set}
          placeholder="gerente@empresa.com" hint="Destino del reporte ejecutivo HTML" />
        <Field label="Remitente (from)" name="email_from" value={config.email_from} onChange={set}
          placeholder="assessment@empresa.com" />
        <Field label="Servidor SMTP" name="smtp_host" value={config.smtp_host} onChange={set}
          placeholder="smtp.gmail.com" hint="Gmail: smtp.gmail.com · Outlook: smtp.office365.com" />
        <Field label="Puerto" name="smtp_port" value={config.smtp_port} onChange={set}
          placeholder="587" hint="587 (TLS) · 465 (SSL) · 25 (sin cifrado)" />
        <Field label="Usuario SMTP" name="smtp_user" value={config.smtp_user} onChange={set}
          placeholder="tu@gmail.com" hint="Para Gmail usa tu dirección completa" />
        <Field label="Contraseña / App Password" name="smtp_pass" value={config.smtp_pass} onChange={set}
          type="password" placeholder="••••••••" hint="Gmail: usa 'Contraseña de aplicación'" />
        <div className="col-span-full">
          <Toggle label="Usar TLS / STARTTLS (recomendado)"
            hint="Puerto 587 con STARTTLS — configuración más segura"
            checked={config.smtp_tls === "1"}
            onChange={v => set("smtp_tls", v ? "1" : "0")} />
        </div>
      </div>
      <Warn>
        <strong>Gmail:</strong> ve a <code className="font-mono">myaccount.google.com → Seguridad → Contraseñas de aplicaciones</code>{" "}
        y genera una para &quot;Correo&quot;. Requiere verificación en 2 pasos activada.
      </Warn>
      <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800">
        <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 mb-2">Enviar correo de prueba</p>
        <TestBtn label="Enviar correo de prueba" onTest={async () => {
          const r = await fetch("/api/settings/test-email", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify(config),
          });
          return r.json() as Promise<{ ok: boolean; error?: string }>;
        }} />
      </div>
    </div>
  );
}

function TabPeligro({ onClear }: { onClear: () => void }) {
  const [state, setState] = useState<"idle" | "loading" | "ok" | "error">("idle");

  async function handleClear() {
    if (!confirm("¿Limpiar TODA la base de datos?\n\nSe borrarán: runs, indicadores, proyectos, alertas, logs de IA y ChromaDB.\n\n✅ La configuración se conserva.\n\nDespués deberás re-ejecutar el pipeline.")) return;
    setState("loading");
    try {
      const r = await fetch("/api/settings/clear-db", { method: "POST" });
      const d = await r.json() as { ok?: boolean };
      setState(d.ok ? "ok" : "error");
      if (d.ok) onClear();
    } catch { setState("error"); }
    setTimeout(() => setState("idle"), 5000);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-2xl border-2 border-red-200 bg-red-50 p-5 dark:border-red-900 dark:bg-red-950/20">
        <AlertTriangle className="h-5 w-5 shrink-0 text-red-500 mt-0.5" />
        <div>
          <p className="text-sm font-bold text-red-700 dark:text-red-400">Limpiar base de datos completa</p>
          <p className="text-xs text-red-600 dark:text-red-500 mt-1 mb-4 leading-relaxed">
            Esta acción elimina <strong>todos los runs, indicadores, proyectos, alertas, historial de chat y vectores ChromaDB</strong>.
            La configuración (WhatsApp, Email, API keys) se conserva intacta.
            Esta acción es <strong>irreversible</strong>.
          </p>
          <button type="button" onClick={handleClear} disabled={state === "loading"}
            className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-all ${
              state === "ok" ? "bg-emerald-500 text-white"
              : state === "error" ? "bg-red-700 text-white"
              : "bg-red-500 text-white hover:bg-red-600 active:scale-95"
            }`}>
            {state === "loading" ? <Loader2 className="h-4 w-4 animate-spin" />
              : state === "ok" ? <CheckCircle2 className="h-4 w-4" />
              : state === "error" ? <AlertCircle className="h-4 w-4" />
              : <Trash2 className="h-4 w-4" />}
            {state === "loading" ? "Limpiando…" : state === "ok" ? "Base de datos limpia ✓" : state === "error" ? "Error al limpiar" : "Limpiar todo ahora"}
          </button>
        </div>
      </div>
      <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-xs text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800">
        <p className="font-semibold text-zinc-700 dark:text-zinc-300 mb-2">Qué se borra vs qué se conserva</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="font-medium text-red-600 mb-1">❌ Se elimina</p>
            <ul className="space-y-0.5">
              {["run_logs", "indicadores_dim/fact", "proyectos_dim/fact", "alertas", "chat_history", "embeddings_meta", "ChromaDB"].map(t => (
                <li key={t} className="font-mono">{t}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="font-medium text-emerald-600 mb-1">✅ Se conserva</p>
            <ul className="space-y-0.5">
              {["app_config (toda la configuración)", "Archivos de datos (.db, .csv)", "outputs/charts/ (imágenes)"].map(t => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Página principal ─────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [tab, setTab] = useState("motores");
  const [config, setConfig] = useState<Config>({
    wa_number: "", wa_url: "http://161.97.129.17:3001/send",
    email_to: "", email_from: "",
    smtp_host: "smtp.gmail.com", smtp_port: "587", smtp_user: "", smtp_pass: "", smtp_tls: "1",
    openai_image_model: "gpt-image-2",
    minimax_voice: "Bingjie",
    ollama_base_url: "http://localhost:11434", ollama_model: "llama3.2",
    chat_provider: "claude", analysis_provider: "claude", claude_model: "claude-sonnet-4-20250514", gemini_model: "gemini-1.5-flash",
    notify_whatsapp: "1", notify_email: "0",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<"idle" | "saving" | "ok" | "error">("idle");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/settings");
      const d = await r.json() as Partial<Config>;
      setConfig(c => ({ ...c, ...d }));
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const set = (k: keyof Config, v: string) => setConfig(c => ({ ...c, [k]: v }));

  async function save() {
    setSaving("saving");
    try {
      const r = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      setSaving(r.ok ? "ok" : "error");
    } catch { setSaving("error"); }
    setTimeout(() => setSaving("idle"), 3000);
  }

  const activeTab = TABS.find(t => t.id === tab)!;

  if (loading) return (
    <div className="flex h-full items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
    </div>
  );

  return (
    <div className="flex h-screen flex-col overflow-hidden">

      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-100 dark:bg-zinc-800">
            <Settings className="h-4.5 w-4.5 text-zinc-600 dark:text-zinc-300" />
          </div>
          <div>
            <h1 className="text-lg font-extrabold text-zinc-900 dark:text-zinc-50">Configuración</h1>
            <p className="text-xs text-zinc-400">
              <activeTab.icon className={`inline h-3 w-3 mr-1 ${activeTab.color}`} />
              {activeTab.label}
            </p>
          </div>
        </div>
        <button type="button" onClick={save} disabled={saving === "saving"}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold shadow-sm transition-all ${
            saving === "ok" ? "bg-emerald-500 text-white"
            : saving === "error" ? "bg-red-500 text-white"
            : "bg-blue-600 text-white hover:bg-blue-700 active:scale-95"
          }`}>
          {saving === "saving" ? <Loader2 className="h-4 w-4 animate-spin" />
            : saving === "ok" ? <CheckCircle2 className="h-4 w-4" />
            : <Save className="h-4 w-4" />}
          {saving === "saving" ? "Guardando…" : saving === "ok" ? "Guardado ✓" : saving === "error" ? "Error" : "Guardar"}
        </button>
      </div>

      {/* ── Layout principal ─────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Sidebar de tabs */}
        <nav className="flex w-48 shrink-0 flex-col gap-0.5 border-r border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="mb-2 px-2 text-[10px] font-bold uppercase tracking-widest text-zinc-400">Secciones</p>
          {TABS.map(t => {
            const Icon = t.icon;
            const active = tab === t.id;
            const isDanger = t.id === "peligro";
            return (
              <button key={t.id} type="button" onClick={() => setTab(t.id)}
                className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium text-left transition-all ${
                  active
                    ? isDanger
                      ? "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400"
                      : "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-50"
                    : isDanger
                      ? "text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20"
                      : "text-zinc-500 hover:bg-white hover:text-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                }`}>
                <Icon className={`h-4 w-4 shrink-0 ${active ? t.color : "text-zinc-400"}`} />
                {t.label}
                {active && !isDanger && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-blue-500" />}
              </button>
            );
          })}
        </nav>

        {/* Contenido del tab activo */}
        <main className="flex-1 overflow-y-auto p-6">
          <div className="w-full max-w-3xl">
            {tab === "motores"        && <TabMotores        config={config} set={set} />}
            {tab === "notificaciones" && <TabNotificaciones config={config} set={set} />}
            {tab === "minimax"        && <TabMinimax        config={config} set={set} />}
            {tab === "gamma"          && <TabGamma          config={config} set={set} />}
            {tab === "whatsapp"       && <TabWhatsapp       config={config} set={set} />}
            {tab === "email"          && <TabEmail          config={config} set={set} />}
            {tab === "peligro"        && <TabPeligro        onClear={() => {}} />}
          </div>
        </main>
      </div>
    </div>
  );
}
