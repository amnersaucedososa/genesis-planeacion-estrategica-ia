"use client";

import { useCallback, useState } from "react";

export function FileUploader() {
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const upload = useCallback(async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (!list.length) return;
    setBusy(true);
    setErr(null);
    setLog(null);
    const fd = new FormData();
    list.forEach((f) => fd.append("files", f));

    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.details || data.error || "Error al procesar");
        return;
      }
      setLog(
        `Listo. run_id: ${data.run_id || "—"} · estado: ${data.status || "ok"}` +
          (data.indicadores != null ? ` · indicadores: ${data.indicadores}` : "")
      );
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        if (e.dataTransfer.files?.length) upload(e.dataTransfer.files);
      }}
      className={`rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
        drag ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30" : "border-zinc-300 dark:border-zinc-600"
      }`}
    >
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Arrastra aquí tu <strong>.db</strong> / <strong>.sqlite</strong> y/o CSVs del assessment, o elige archivos.
      </p>
      <label className="mt-4 inline-block cursor-pointer rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">
        {busy ? "Procesando…" : "Seleccionar archivos"}
        <input
          type="file"
          multiple
          className="hidden"
          disabled={busy}
          onChange={(e) => e.target.files && upload(e.target.files)}
        />
      </label>
      {log ? <p className="mt-4 text-sm text-emerald-700 dark:text-emerald-300">{log}</p> : null}
      {err ? <p className="mt-4 text-sm text-red-600 dark:text-red-400">{err}</p> : null}
    </div>
  );
}
