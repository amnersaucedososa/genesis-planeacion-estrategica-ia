/**
 * GET /api/media/tts-voices
 * Trae la lista completa de voces del sistema MiniMax desde /v1/voice_list
 * Si falla, devuelve las 17 voces preset confirmadas.
 */
import { NextResponse } from "next/server";

export const maxDuration = 15;

type MiniMaxVoice = {
  voice_id: string;
  name?: string;
  gender?: string;
  language?: string;
  description?: string;
};

// 17 voces preset confirmadas para speech-02-hd en platform.minimax.io
const PRESET_VOICES: MiniMaxVoice[] = [
  { voice_id: "Wise_Woman",         name: "Wise Woman",        gender: "female", language: "en", description: "Femenina · Sabia · Profesional" },
  { voice_id: "Friendly_Person",    name: "Friendly Person",   gender: "neutral",language: "en", description: "Neutra · Amigable · Accesible"  },
  { voice_id: "Inspirational_girl", name: "Inspirational Girl",gender: "female", language: "en", description: "Femenina · Inspiradora · Joven"   },
  { voice_id: "Deep_Voice_Man",     name: "Deep Voice Man",    gender: "male",   language: "en", description: "Masculina · Profunda · Ejecutiva" },
  { voice_id: "Calm_Woman",         name: "Calm Woman",        gender: "female", language: "en", description: "Femenina · Calmada · Clara"       },
  { voice_id: "Casual_Guy",         name: "Casual Guy",        gender: "male",   language: "en", description: "Masculina · Natural · Casual"     },
  { voice_id: "Lively_Girl",        name: "Lively Girl",       gender: "female", language: "en", description: "Femenina · Enérgica · Dinámica"   },
  { voice_id: "Patient_Man",        name: "Patient Man",       gender: "male",   language: "en", description: "Masculina · Paciente · Formal"    },
  { voice_id: "Young_Knight",       name: "Young Knight",      gender: "male",   language: "en", description: "Masculina · Joven · Decidida"     },
  { voice_id: "Determined_Man",     name: "Determined Man",    gender: "male",   language: "en", description: "Masculina · Firme · Corporativa"  },
  { voice_id: "Lovely_Girl",        name: "Lovely Girl",       gender: "female", language: "en", description: "Femenina · Suave · Cercana"       },
  { voice_id: "Decent_Boy",         name: "Decent Boy",        gender: "male",   language: "en", description: "Masculina · Correcta · Educada"   },
  { voice_id: "Imposing_Manner",    name: "Imposing Manner",   gender: "male",   language: "en", description: "Masculina · Imponente · Autoridad"},
  { voice_id: "Elegant_Man",        name: "Elegant Man",       gender: "male",   language: "en", description: "Masculina · Elegante · Refinada"  },
  { voice_id: "Abbess",             name: "Abbess",            gender: "female", language: "en", description: "Femenina · Serena · Madura"       },
  { voice_id: "Sweet_Girl_2",       name: "Sweet Girl",        gender: "female", language: "en", description: "Femenina · Dulce · Expresiva"     },
  { voice_id: "Exuberant_Girl",     name: "Exuberant Girl",    gender: "female", language: "en", description: "Femenina · Exuberante · Vívida"   },
];

export async function GET() {
  const apiKey  = process.env.MINIMAX_API_KEY;
  const groupId = process.env.MINIMAX_GROUP_ID;

  // Intentar traer voces del API
  if (apiKey && groupId) {
    try {
      const res = await Promise.race([
        fetch(`https://api.minimax.io/v1/voice_list?GroupId=${groupId}`, {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          cache: "no-store",
        }),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 8000)),
      ]);

      if (res.ok) {
        const data = await res.json() as {
          base_resp?: { status_code: number };
          system_voice?: MiniMaxVoice[];
          voice_list?:   MiniMaxVoice[];
        };

        if (data.base_resp?.status_code === 0) {
          const voices = data.system_voice ?? data.voice_list ?? [];
          if (voices.length > 0) {
            return NextResponse.json({ ok: true, source: "api", voices });
          }
        }
      }
    } catch {
      // fallback a preset
    }
  }

  // Fallback: devolver las 17 voces preset confirmadas
  return NextResponse.json({ ok: true, source: "preset", voices: PRESET_VOICES });
}
