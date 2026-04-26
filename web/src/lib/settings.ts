/**
 * Lee y escribe configuración completa desde MySQL (tabla app_config).
 * Incluye: WhatsApp, Email/SMTP, OpenAI, MiniMax TTS, Ollama, Gamma, Chat provider.
 */
import pool from "./db";

export type AppConfig = {
  // ── WhatsApp ──────────────────────────────────────
  wa_number: string;
  wa_url: string;
  // ── Email / SMTP ──────────────────────────────────
  email_to: string;
  email_from: string;
  smtp_host: string;
  smtp_port: string;
  smtp_user: string;
  smtp_pass: string;
  smtp_tls: string;
  // ── OpenAI (imágenes gpt-image-1) ─────────────────
  openai_api_key: string;
  openai_image_model: string;
  // ── MiniMax (audio TTS) ───────────────────────────
  minimax_api_key: string;
  minimax_group_id: string;
  minimax_voice: string;
  // ── Ollama (modelos locales) ──────────────────────
  ollama_base_url: string;
  ollama_model: string;
  // ── Chat provider y modelos por motor ────────────
  chat_provider: string;
  analysis_provider: string;
  claude_model: string;
  gemini_model: string;
  // ── Gamma.app (presentaciones) ────────────────────
  gamma_api_key: string;
  // ── Canales de notificación ────────────────────────
  notify_whatsapp: string;   // "1" | "0"
  notify_email: string;      // "1" | "0"
};

const DEFAULTS: AppConfig = {
  wa_number:          "50249899115",
  wa_url:             "http://161.97.129.17:3001/send",
  email_to:           "",
  email_from:         "",
  smtp_host:          "smtp.gmail.com",
  smtp_port:          "587",
  smtp_user:          "",
  smtp_pass:          "",
  smtp_tls:           "1",
  openai_api_key:     "",
  openai_image_model: "gpt-image-2",
  minimax_api_key:    "",
  minimax_group_id:   "",
  minimax_voice:      "Wise_Woman",
  ollama_base_url:    "http://localhost:11434",
  ollama_model:       "llama3.2",
  chat_provider:      "claude",
  analysis_provider:  "claude",
  claude_model:       "claude-sonnet-4-20250514",
  gemini_model:       "gemini-1.5-flash",
  gamma_api_key:      "",
  notify_whatsapp:    "1",
  notify_email:       "0",
};

/** Claves que se enmascaran en el GET (nunca se envían en texto plano) */
const MASKED_KEYS = new Set(["smtp_pass", "openai_api_key", "minimax_api_key", "gamma_api_key"]);

export async function getConfig(): Promise<AppConfig> {
  try {
    const [rows] = await pool.query(
      "SELECT clave, valor FROM app_config"
    ) as unknown as [{ clave: string; valor: string }[], unknown];
    const map: Record<string, string> = {};
    rows.forEach((r) => { map[r.clave] = r.valor ?? ""; });
    return { ...DEFAULTS, ...map } as AppConfig;
  } catch {
    return DEFAULTS;
  }
}

export async function saveConfig(updates: Partial<AppConfig>): Promise<void> {
  const entries = Object.entries(updates).filter(([k]) => k in DEFAULTS);
  for (const [clave, valor] of entries) {
    await pool.query(
      "INSERT INTO app_config (clave, valor) VALUES (?, ?) ON DUPLICATE KEY UPDATE valor=VALUES(valor)",
      [clave, valor ?? ""]
    );
  }
}

export { MASKED_KEYS };
