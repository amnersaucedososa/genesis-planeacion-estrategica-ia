/**
 * GET /api/settings/ollama-models?url=http://161.97.129.17:11434
 *
 * Escanea un servidor Ollama y devuelve TODOS los modelos disponibles
 * (locales + cloud). Acepta la URL desde el query param para poder
 * escanear antes de guardar la configuración.
 */
import { NextResponse } from "next/server";
import { getConfig } from "@/lib/settings";

export const maxDuration = 30;

type OllamaModel = {
  name: string;
  model?: string;
  modified_at?: string;
  size?: number;
  details?: {
    family?: string;
    parameter_size?: string;
    quantization_level?: string;
  };
};

type OllamaTagsResponse = {
  models?: OllamaModel[];
};

function isCloudModel(name: string): boolean {
  return (
    name.endsWith(":cloud") ||
    name.includes(":cloud-") ||
    name.includes("cloud:") ||
    name.startsWith("hf.co/") ||
    name.startsWith("registry.ollama.ai/library/")
  );
}

function formatSize(bytes?: number): string {
  if (!bytes) return "";
  const gb = bytes / 1_000_000_000;
  if (gb >= 1) return `${gb.toFixed(1)}GB`;
  const mb = bytes / 1_000_000;
  return `${mb.toFixed(0)}MB`;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  // Prioridad: query param → config BD → env → default
  let baseUrl = searchParams.get("url") ?? "";
  if (!baseUrl) {
    const cfg = await getConfig();
    baseUrl = cfg.ollama_base_url || process.env.OLLAMA_BASE_URL || "http://localhost:11434";
  }

  // Limpiar trailing slash
  baseUrl = baseUrl.replace(/\/+$/, "");

  const t0 = Date.now();

  try {
    // Intentamos /api/tags (modelos locales + cloud registrados)
    const tagsRes = await Promise.race([
      fetch(`${baseUrl}/api/tags`, {
        headers: { Accept: "application/json" },
        // Next.js fetch cache: no queremos cache aquí
        cache: "no-store",
      }),
      new Promise<never>((_, rej) =>
        setTimeout(() => rej(new Error("timeout")), 15000)
      ),
    ]);

    if (!tagsRes.ok) {
      return NextResponse.json(
        { ok: false, error: `Ollama respondió HTTP ${tagsRes.status}` },
        { status: 502 }
      );
    }

    const data = (await tagsRes.json()) as OllamaTagsResponse;
    const raw  = data.models ?? [];
    const latency = Date.now() - t0;

    // Separar locales vs cloud
    const models = raw.map(m => ({
      name:      m.name,
      size:      formatSize(m.size),
      family:    m.details?.family ?? "",
      paramSize: m.details?.parameter_size ?? "",
      quant:     m.details?.quantization_level ?? "",
      isCloud:   isCloudModel(m.name),
    }));

    // Ordenar: cloud primero, luego alphabético
    models.sort((a, b) => {
      if (a.isCloud !== b.isCloud) return a.isCloud ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return NextResponse.json({
      ok: true,
      latency,
      url: baseUrl,
      total: models.length,
      local: models.filter(m => !m.isCloud).length,
      cloud: models.filter(m => m.isCloud).length,
      models,
    });
  } catch (e) {
    const msg = String(e);
    const friendly = msg.includes("timeout")
      ? "Tiempo de espera agotado (15s). ¿Está corriendo Ollama?"
      : msg.includes("ECONNREFUSED")
      ? "Conexión rechazada. Verifica que Ollama esté corriendo y la URL sea correcta."
      : msg.includes("ENOTFOUND")
      ? "No se pudo resolver el host. Verifica la URL."
      : msg;

    return NextResponse.json({ ok: false, error: friendly }, { status: 502 });
  }
}
