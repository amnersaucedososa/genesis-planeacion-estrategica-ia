"use client";

import { useEffect, useRef, useState } from "react";

type Msg = { rol: string; contenido: string; grafica_path?: string | null };

export function ChatWindow() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    setLoading(true);
    const userMsg: Msg = { rol: "user", contenido: text };
    setMessages((m) => [...m, userMsg]);

    const historial = messages.slice(-6).map((x) => ({
      role: x.rol === "user" ? "user" : "assistant",
      content: x.contenido,
    }));

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pregunta: text,
          session_id: sessionId,
          historial,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessages((m) => [
          ...m,
          { rol: "assistant", contenido: data.error || "Error al consultar" },
        ]);
        return;
      }
      if (data.session_id) setSessionId(data.session_id);
      setMessages((m) => [
        ...m,
        {
          rol: "assistant",
          contenido: data.respuesta || "",
          grafica_path: data.grafica_path,
        },
      ]);
    } catch (e) {
      setMessages((m) => [...m, { rol: "assistant", contenido: `Error de red: ${String(e)}` }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-[min(70vh,640px)] flex-col rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <p className="text-sm text-zinc-500">
            Haz una pregunta sobre tus indicadores o proyectos. El contexto se recupera con RAG (ChromaDB + embeddings
            locales).
          </p>
        ) : null}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.rol === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm leading-relaxed ${
                msg.rol === "user"
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
              }`}
            >
              <p className="whitespace-pre-wrap">{msg.contenido}</p>
              {msg.grafica_path ? (
                <div className="mt-3 overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-700">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={msg.grafica_path} alt="Gráfica generada" className="max-h-80 w-full object-contain bg-white" />
                </div>
              ) : null}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="border-t border-zinc-200 p-3 dark:border-zinc-800">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Ej. ¿Qué indicadores están en rojo en 2024?"
            rows={2}
            className="min-h-[44px] flex-1 resize-none rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none ring-indigo-500 focus:border-indigo-500 focus:ring-2 dark:border-zinc-600 dark:bg-zinc-950"
          />
          <button
            type="button"
            onClick={send}
            disabled={loading}
            className="shrink-0 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {loading ? "…" : "Enviar"}
          </button>
        </div>
      </div>
    </div>
  );
}
