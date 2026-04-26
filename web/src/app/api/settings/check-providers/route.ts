import { NextResponse } from "next/server";
import { getConfig } from "@/lib/settings";

export const maxDuration = 30;

type ProviderResult = {
  ok: boolean;
  latency?: number;
  model?: string;
  error?: string;
  models?: string[];
};

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`${label}: timeout después de ${ms}ms`)), ms)
  );
  return Promise.race([promise, timeout]);
}

async function checkClaude(): Promise<ProviderResult> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { ok: false, error: "ANTHROPIC_API_KEY no configurada en .env" };
  const t0 = Date.now();
  try {
    const res = await withTimeout(
      fetch("https://api.anthropic.com/v1/models", {
        headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
      }),
      8000, "Claude"
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `HTTP ${res.status}: ${body.slice(0, 120)}` };
    }
    const data = await res.json() as { data?: { id: string }[] };
    const models = data.data?.map(m => m.id) ?? [];
    return { ok: true, latency: Date.now() - t0, models };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

async function checkGemini(): Promise<ProviderResult> {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) return { ok: false, error: "GEMINI_API_KEY no configurada en .env" };
  const t0 = Date.now();
  try {
    const res = await withTimeout(
      fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}&pageSize=5`),
      8000, "Gemini"
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `HTTP ${res.status}: ${body.slice(0, 120)}` };
    }
    const data = await res.json() as { models?: { name: string }[] };
    const models = data.models?.map(m => m.name.replace("models/", "")) ?? [];
    return { ok: true, latency: Date.now() - t0, models };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

async function checkOllama(baseUrl: string): Promise<ProviderResult> {
  const url = baseUrl || "http://localhost:11434";
  const t0 = Date.now();
  try {
    const res = await withTimeout(
      fetch(`${url}/api/tags`),
      5000, "Ollama"
    );
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const data = await res.json() as { models?: { name: string }[] };
    const models = data.models?.map(m => m.name) ?? [];
    return { ok: true, latency: Date.now() - t0, models };
  } catch (e) {
    return { ok: false, error: "Ollama no está corriendo. Ejecuta: ollama serve" };
  }
}

async function checkOpenAI(): Promise<ProviderResult> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { ok: false, error: "OPENAI_API_KEY no configurada en .env" };
  const t0 = Date.now();
  try {
    const res = await withTimeout(
      fetch("https://api.openai.com/v1/models?limit=1", {
        headers: { Authorization: `Bearer ${key}` },
      }),
      8000, "OpenAI"
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `HTTP ${res.status}: ${body.slice(0, 120)}` };
    }
    return { ok: true, latency: Date.now() - t0 };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function GET() {
  const cfg = await getConfig();
  const ollamaUrl = cfg.ollama_base_url || process.env.OLLAMA_BASE_URL || "http://localhost:11434";

  const [claude, gemini, ollama, openai] = await Promise.allSettled([
    checkClaude(),
    checkGemini(),
    checkOllama(ollamaUrl),
    checkOpenAI(),
  ]);

  function unwrap(r: PromiseSettledResult<ProviderResult>): ProviderResult {
    return r.status === "fulfilled" ? r.value : { ok: false, error: String(r.reason) };
  }

  return NextResponse.json({
    claude: unwrap(claude),
    gemini: unwrap(gemini),
    ollama: unwrap(ollama),
    openai: unwrap(openai),
  });
}
