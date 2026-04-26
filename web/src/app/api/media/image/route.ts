import { NextResponse } from "next/server";
import { getConfig } from "@/lib/settings";
import { logAiAction } from "@/lib/aiLog";

export const maxDuration = 60;

async function callOpenAI(apiKey: string, model: string, prompt: string) {
  const isGptImage = model.startsWith("gpt-image");
  const body: Record<string, unknown> = { model, prompt, n: 1, size: "1024x1024" };
  if (!isGptImage) body.response_format = "url";

  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  const data = await res.json() as { data?: { url?: string; b64_json?: string }[]; error?: { message: string; code?: string } };
  if (!res.ok || data.error) throw Object.assign(new Error(data.error?.message || `HTTP ${res.status}`), { code: data.error?.code });

  const item = data.data?.[0];
  let url: string | null = null;
  if (item?.url)       url = item.url;
  else if (item?.b64_json) url = `data:image/png;base64,${item.b64_json}`;
  return { url, model };
}

export async function POST(req: Request) {
  const { prompt, session_id } = await req.json() as { prompt: string; session_id?: string };

  const cfg = await getConfig();
  const apiKey = (cfg.openai_api_key && cfg.openai_api_key !== "••••••••")
    ? cfg.openai_api_key
    : process.env.OPENAI_API_KEY;

  if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY no configurada." }, { status: 400 });
  if (!prompt) return NextResponse.json({ error: "prompt requerido" }, { status: 400 });

  // Try preferred model first, then fall back to dall-e-3 (no org verification needed)
  const preferredModel = cfg.openai_image_model || process.env.OPENAI_IMAGE_MODEL || "dall-e-3";
  const fallbackModel  = "dall-e-3";

  try {
    const result = await callOpenAI(apiKey, preferredModel, prompt);
    void logAiAction({
      session_id,
      rol:       "assistant",
      contenido: `[Infografía] ${prompt.slice(0, 150)}${prompt.length > 150 ? "…" : ""}`,
      proveedor: "openai",
      modelo:    result.model ?? preferredModel,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const err = e as Error & { code?: string };
    // If the error is org-verification (gpt-image-2), auto-retry with dall-e-3
    const needsFallback = preferredModel !== fallbackModel && (
      err.message?.includes("verified") ||
      err.message?.includes("organization") ||
      err.code === "organization_verification_required"
    );

    if (needsFallback) {
      try {
        const result = await callOpenAI(apiKey, fallbackModel, prompt);
        void logAiAction({
          session_id,
          rol:       "assistant",
          contenido: `[Infografía·fallback] ${prompt.slice(0, 150)}${prompt.length > 150 ? "…" : ""}`,
          proveedor: "openai",
          modelo:    fallbackModel,
        });
        return NextResponse.json({ ok: true, ...result, fallback: true });
      } catch (e2) {
        return NextResponse.json({ error: String(e2) }, { status: 500 });
      }
    }
    return NextResponse.json({ error: err.message || String(e) }, { status: 500 });
  }
}
