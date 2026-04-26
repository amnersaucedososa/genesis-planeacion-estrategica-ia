"use client";

import { useState } from "react";

export type AlertaRow = {
  id: number;
  tipo: string;
  nombre_entidad: string | null;
  periodo: string;
  semafor: string;
  desviacion_pct: number | null;
  texto_alerta: string | null;
  whatsapp_simulado?: number | null;
};

function badge(semafor: string) {
  if (semafor === "rojo") return "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200";
  if (semafor === "amarillo") return "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100";
  return "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100";
}

export function AlertaCard({ alerta }: { alerta: AlertaRow }) {
  const [open, setOpen] = useState(false);

  return (
    <article className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-wide text-zinc-500">{alerta.tipo}</p>
          <h4 className="font-medium text-zinc-900 dark:text-zinc-50">{alerta.nombre_entidad || "—"}</h4>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">{alerta.periodo}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${badge(alerta.semafor)}`}>
            {alerta.semafor}
          </span>
          {alerta.whatsapp_simulado ? (
            <span className="text-xs text-zinc-500">WhatsApp simulado ✓</span>
          ) : null}
        </div>
      </div>
      {alerta.desviacion_pct != null && (
        <p className="mt-2 text-sm tabular-nums text-zinc-700 dark:text-zinc-300">
          Desviación: {Number(alerta.desviacion_pct).toFixed(2)}%
        </p>
      )}
      {alerta.texto_alerta ? (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400"
          >
            {open ? "Ocultar insight" : "Ver insight ejecutivo"}
          </button>
          {open ? (
            <div className="mt-2 whitespace-pre-wrap rounded-lg bg-zinc-50 p-3 text-sm text-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
              {alerta.texto_alerta}
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
