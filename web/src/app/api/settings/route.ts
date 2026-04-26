import { NextResponse } from "next/server";
import { getConfig, saveConfig, MASKED_KEYS } from "@/lib/settings";

const MASK = "••••••••";

export async function GET() {
  const cfg = await getConfig();
  const safe = { ...cfg } as Record<string, string>;
  // Enmascarar claves sensibles
  for (const key of MASKED_KEYS) {
    safe[key] = (cfg as Record<string, string>)[key] ? MASK : "";
  }
  return NextResponse.json(safe);
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as Record<string, string>;
    // Si el valor es la máscara, no sobreescribir (el usuario no cambió ese campo)
    for (const key of MASKED_KEYS) {
      if (body[key] === MASK) delete body[key];
    }
    await saveConfig(body);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
