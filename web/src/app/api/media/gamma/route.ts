import { NextResponse } from "next/server";
import { logAiAction } from "@/lib/aiLog";

export const maxDuration = 60;

const GAMMA_API = "https://public-api.gamma.app/v1.0";

export async function POST(req: Request) {
  const { text, session_id } = await req.json() as { text: string; session_id?: string };

  const apiKey = process.env.GAMMA_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "GAMMA_API_KEY no configurada en .env.local" }, { status: 400 });
  if (!text)   return NextResponse.json({ error: "text requerido" }, { status: 400 });

  // 1. Iniciar generación
  const startRes = await fetch(`${GAMMA_API}/generations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-KEY": apiKey },
    body: JSON.stringify({
      inputText: text,
      textMode:  "generate",
      format:    "presentation",
      numCards:  10,
    }),
  });

  if (!startRes.ok) {
    const err = await startRes.text();
    return NextResponse.json({ error: `Gamma API ${startRes.status}: ${err.slice(0, 300)}` }, { status: 500 });
  }

  const { generationId } = await startRes.json() as { generationId: string };

  // 2. Polling hasta completado (máx 55 s)
  const deadline = Date.now() + 55_000;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 3500));

    const pollRes = await fetch(`${GAMMA_API}/generations/${generationId}`, {
      headers: { "X-API-KEY": apiKey },
    });
    const data = await pollRes.json() as {
      status: string;
      gammaUrl?: string;
      exportUrl?: string;
    };

    if (data.status === "completed") {
      void logAiAction({
        session_id,
        rol:       "assistant",
        contenido: `[Presentación Gamma] ${text.slice(0, 120)}${text.length > 120 ? "…" : ""}`,
        proveedor: "gamma",
        modelo:    "gamma-ai",
      });
      return NextResponse.json({ ok: true, url: data.gammaUrl, exportUrl: data.exportUrl });
    }

    if (data.status === "failed") {
      return NextResponse.json({ error: "Gamma falló al generar la presentación" }, { status: 500 });
    }
    // status === "processing" — sigue esperando
  }

  return NextResponse.json({ error: "Timeout: la presentación tardó demasiado, intenta de nuevo" }, { status: 504 });
}
