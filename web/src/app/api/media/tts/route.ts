import { NextResponse } from "next/server";
import { getConfig } from "@/lib/settings";
import { logAiAction } from "@/lib/aiLog";

export const maxDuration = 60;

export async function POST(req: Request) {
  const { text, voice, session_id } = await req.json() as { text: string; voice?: string; session_id?: string };

  const cfg = await getConfig();
  const apiKey = process.env.MINIMAX_API_KEY;
  const groupId = process.env.MINIMAX_GROUP_ID;

  if (!apiKey || !groupId) {
    return NextResponse.json(
      { error: "MINIMAX_API_KEY o MINIMAX_GROUP_ID no configurados en web/.env.local" },
      { status: 400 }
    );
  }

  // Valid MiniMax T2A v2 voice IDs — "Bingjie" is NOT valid for this endpoint
  const VALID_VOICES = new Set(["Wise_Woman", "Deep_Voice_Man", "Calm_Woman", "Exuberant_Girl", "Narration_Man", "Audiobook_Man"]);
  const rawVoice = voice || cfg.minimax_voice || process.env.MINIMAX_VOICE || "Wise_Woman";
  const voiceId  = VALID_VOICES.has(rawVoice) ? rawVoice : "Wise_Woman";

  try {
    const res = await fetch(
      `https://api.minimax.io/v1/t2a_v2?GroupId=${groupId}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "speech-02-hd",
          text,
          voice_setting: {
            voice_id: voiceId,
            speed: 1.15,
            vol: 1.0,
            pitch: 0,
          },
          audio_setting: {
            audio_sample_rate: 32000,
            bitrate: 128000,
            format: "mp3",
          },
        }),
      }
    );

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json(
        { error: `MiniMax HTTP ${res.status}: ${err.slice(0, 300)}` },
        { status: 500 }
      );
    }

    // MiniMax t2a_v2 devuelve JSON con el audio en hex dentro de data.audio
    const json = await res.json() as {
      base_resp?: { status_code: number; status_msg: string };
      data?: { audio?: string };
    };

    if (json.base_resp && json.base_resp.status_code !== 0) {
      return NextResponse.json(
        { error: `MiniMax error ${json.base_resp.status_code}: ${json.base_resp.status_msg}` },
        { status: 500 }
      );
    }

    const hexAudio = json.data?.audio;
    if (!hexAudio) {
      return NextResponse.json(
        { error: "MiniMax no devolvió audio. Respuesta: " + JSON.stringify(json).slice(0, 300) },
        { status: 500 }
      );
    }

    // Convertir hex → Buffer → base64 y devolver como JSON
    // (evita problemas de Content-Type con blob binario en el browser)
    const audioBuffer = Buffer.from(hexAudio, "hex");
    const base64Audio = audioBuffer.toString("base64");

    // ── Log en chat_history ──────────────────────────────────────────────────
    void logAiAction({
      session_id,
      rol:       "assistant",
      contenido: `[Audio TTS] "${text.slice(0, 120)}${text.length > 120 ? "…" : ""}"`,
      proveedor: "minimax",
      modelo:    `speech-02-hd · voz:${voiceId}`,
    });

    return NextResponse.json({ ok: true, audio: base64Audio, mime: "audio/mpeg" });

  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
