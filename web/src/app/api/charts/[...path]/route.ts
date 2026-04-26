import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { getAssessmentRoot } from "@/lib/assessmentRoot";

export async function GET(
  _req: Request,
  context: { params: Promise<{ path: string[] }> }
) {
  const { path: segments } = await context.params;
  const safe = (segments || []).join("/").replace(/\.\./g, "");
  if (!safe || !safe.endsWith(".png")) {
    return NextResponse.json({ error: "No permitido" }, { status: 400 });
  }

  const root = getAssessmentRoot();
  const filePath = path.join(root, "outputs", "charts", path.basename(safe));

  try {
    const buf = await fs.readFile(filePath);
    return new NextResponse(buf, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Gráfica no encontrada" }, { status: 404 });
  }
}
