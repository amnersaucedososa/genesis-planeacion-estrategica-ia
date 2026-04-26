import { NextResponse } from "next/server";
import { getConfig } from "@/lib/settings";

export async function POST() {
  const cfg = await getConfig();
  try {
    const resp = await fetch(cfg.wa_url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        number: cfg.wa_number,
        message:
          "🤖 *Assessment · Planeación Estratégica*\n\n✅ Prueba de configuración exitosa.\nSistema Multi-LLM operativo.\nAgente 1: Claude Haiku | Agente 2: Claude Sonnet\nRAG: ChromaDB activo",
      }),
      signal: AbortSignal.timeout(12000),
    });
    const body = resp.ok ? (await resp.json().catch(() => ({}))) : null;
    if (!resp.ok) return NextResponse.json({ ok: false, error: `HTTP ${resp.status}` }, { status: 502 });
    return NextResponse.json({ ok: true, response: body });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 502 });
  }
}
