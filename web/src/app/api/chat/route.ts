import { NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import pool from "@/lib/db";
import { getAssessmentRoot } from "@/lib/assessmentRoot";
import { getConfig } from "@/lib/settings";
import { v4 as uuidv4 } from "uuid";

export const maxDuration = 600; // 10 min — modelos grandes (32B+) pueden tardar varios minutos

// Timeout por proveedor en ms (Ollama con modelos grandes necesita mucho tiempo)
const PROVIDER_TIMEOUT: Record<string, number> = {
  ollama:  540_000, // 9 min
  claude:  90_000,  // 90s
  gemini:  90_000,  // 90s
  openai:  90_000,  // 90s
};

function runChatCli(
  payload: object,
  extraEnv: Record<string, string> = {},
  timeoutMs = 120_000,
): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; error: string }> {
  const root = getAssessmentRoot();
  const script = path.join(root, "pipeline", "chat_cli.py");

  return new Promise((resolve) => {
    const py = spawn(process.env.PYTHON_BIN || "python3", [script], {
      cwd: root,
      env: {
        ...process.env,
        ...extraEnv,
        PYTHONPATH: root,
        PYTHONUNBUFFERED: "1",
      },
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    // Timer de seguridad — mata el proceso si tarda demasiado
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        py.kill("SIGTERM");
        resolve({
          ok: false,
          error: `El modelo tardó más de ${Math.round(timeoutMs / 60000)} minutos en responder. ` +
                 `Para modelos grandes (32B+) esto es normal — intenta con un modelo más pequeño o espera más.`,
        });
      }
    }, timeoutMs);

    py.stdout.on("data", (d) => { stdout += d.toString(); });
    py.stderr.on("data", (d) => { stderr += d.toString(); });

    py.on("error", (err) => {
      if (!settled) { settled = true; clearTimeout(timer); resolve({ ok: false, error: err.message }); }
    });

    py.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      if (code !== 0) {
        resolve({
          ok: false,
          error: stderr.slice(0, 800) || `Proceso Python salió con código ${code}`,
        });
        return;
      }
      const lines = stdout.trim().split("\n").filter(Boolean);
      const last = lines[lines.length - 1] || "";
      try {
        resolve({ ok: true, data: JSON.parse(last) as Record<string, unknown> });
      } catch {
        resolve({ ok: false, error: stdout.slice(0, 500) || "Respuesta inválida del agente" });
      }
    });

    py.stdin.write(JSON.stringify(payload));
    py.stdin.end();
  });
}

export async function POST(req: Request): Promise<NextResponse> {
  const body = await req.json();
  const pregunta    = typeof body.pregunta    === "string"  ? body.pregunta.trim() : "";
  const historial   = Array.isArray(body.historial)         ? body.historial : [];
  const session_id  = typeof body.session_id  === "string"  ? body.session_id : uuidv4();
  const agent_mode  = body.agent_mode === true;

  if (!pregunta) {
    return NextResponse.json({ error: "Pregunta requerida" }, { status: 400 });
  }

  // Leer config de BD: proveedor de chat + API keys
  const cfg = await getConfig();
  // El cliente puede sugerir un proveedor; si no, usa el configurado en BD, si no, .env, si no "claude"
  const provider = typeof body.provider === "string" && body.provider
    ? body.provider
    : (cfg.chat_provider || process.env.CHAT_PROVIDER || "claude");

  const [runs] = (await pool.query(
    "SELECT run_id FROM run_logs WHERE status='completed' ORDER BY created_at DESC LIMIT 1"
  )) as unknown as { run_id: string }[][];

  const run_id = runs[0]?.run_id ?? null;

  const extraEnv: Record<string, string> = {
    CHAT_PROVIDER: provider,
    // Siempre inyectar OLLAMA_BASE_URL y OLLAMA_MODEL:
    // prioridad: BD → .env.local → default
    OLLAMA_BASE_URL: cfg.ollama_base_url || process.env.OLLAMA_BASE_URL || "http://localhost:11434",
    OLLAMA_MODEL:    cfg.ollama_model    || process.env.OLLAMA_MODEL    || "llama3.2",
  };
  if (cfg.claude_model)  extraEnv.ANTHROPIC_MODEL = cfg.claude_model;
  if (cfg.gemini_model)  extraEnv.GOOGLE_MODEL    = cfg.gemini_model;
  if (cfg.minimax_voice) extraEnv.MINIMAX_VOICE   = cfg.minimax_voice;

  const timeoutMs = PROVIDER_TIMEOUT[provider] ?? 120_000;
  const result = await runChatCli(
    { pregunta, run_id, historial: historial.slice(-6), provider, agent_mode },
    extraEnv,
    timeoutMs,
  );

  if (!result.ok) {
    const errMsg = "error" in result ? result.error : "Error desconocido";
    console.error("Chat CLI:", errMsg);
    // Devolver el error directamente como "respuesta" para mostrarlo en el chat
    return NextResponse.json({
      respuesta: `⚠️ ${errMsg}`,
      session_id,
      necesita_grafica: false,
      grafica_path: null,
      tokens: 0,
      provider,
      model_used: null,
      error: true,
    });
  }

  const data = result.data;
  const respuesta    = typeof data.respuesta    === "string" ? data.respuesta    : "";
  const tokens       = typeof data.tokens_usados === "number" ? data.tokens_usados : 0;
  const chunks       = data.chunks_usados;
  const graficaPath  = typeof data.grafica_path === "string" ? data.grafica_path : null;
  const proveedorUsado = typeof data.provider   === "string" ? data.provider     : provider;
  const modeloUsado  = typeof data.model_used   === "string" ? data.model_used   : null;

  try {
    await pool.query(
      "INSERT INTO chat_history (run_id, session_id, rol, proveedor, modelo, contenido, tokens_usados, chunks_usados) VALUES (?,?,?,?,?,?,?,?)",
      [run_id, session_id, "user", proveedorUsado, modeloUsado, pregunta, 0, "[]"]
    );
    await pool.query(
      "INSERT INTO chat_history (run_id, session_id, rol, proveedor, modelo, contenido, tokens_usados, chunks_usados, grafica_path) VALUES (?,?,?,?,?,?,?,?,?)",
      [run_id, session_id, "assistant", proveedorUsado, modeloUsado, respuesta, tokens, JSON.stringify(chunks ?? []), graficaPath]
    );
  } catch (e) {
    console.error("chat_history insert:", e);
  }

  return NextResponse.json({
    respuesta,
    session_id,
    necesita_grafica: Boolean(data.necesita_grafica),
    grafica_path: graficaPath,
    tokens,
    provider: proveedorUsado,
    model_used: modeloUsado,
    acciones: Array.isArray(data.acciones) ? data.acciones : [],
    agent_mode,
  });
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const session_id = searchParams.get("session_id");

  if (!session_id) {
    return NextResponse.json({ data: [] });
  }

  const [rows] = (await pool.query(
    "SELECT * FROM chat_history WHERE session_id = ? ORDER BY created_at ASC",
    [session_id]
  )) as unknown[][];

  return NextResponse.json({ data: rows });
}
