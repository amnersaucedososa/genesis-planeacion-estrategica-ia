import { NextResponse } from "next/server";

export async function GET() {
  const base = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
  try {
    const res = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error("Ollama no responde");
    const data = await res.json() as { models?: { name: string; size: number }[] };
    const models = (data.models || []).map((m) => ({
      name: m.name,
      size_gb: Math.round(m.size / 1e9 * 10) / 10,
    }));
    return NextResponse.json({ ok: true, models, base_url: base });
  } catch (e) {
    return NextResponse.json({ ok: false, models: [], error: String(e) });
  }
}
