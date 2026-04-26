/**
 * aiLog.ts — Escribe en chat_history cualquier acción IA del sistema.
 * Usado por: stream/route.ts, tts/route.ts, image/route.ts
 * Nunca lanza excepción — el log no debe bloquear ninguna respuesta.
 */
import pool from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

export async function logAiAction(row: {
  session_id?:   string;          // si es null, genera un UUID nuevo
  rol:           "user" | "assistant";
  contenido:     string;
  proveedor?:    string | null;
  modelo?:       string | null;
  tokens_usados?: number;
  grafica_path?: string | null;
  run_id?:       string | null;
}) {
  try {
    const sid = row.session_id || uuidv4();
    await pool.query(
      `INSERT INTO chat_history
         (run_id, session_id, rol, proveedor, modelo,
          contenido, tokens_usados, grafica_path)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.run_id       ?? null,
        sid,
        row.rol,
        row.proveedor    ?? null,
        row.modelo       ?? null,
        row.contenido    ?? "",
        row.tokens_usados ?? 0,
        row.grafica_path ?? null,
      ]
    );
  } catch {
    // silencioso — el log nunca rompe el flujo principal
  }
}
