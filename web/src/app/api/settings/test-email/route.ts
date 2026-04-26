import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { getConfig, saveConfig } from "@/lib/settings";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));

  // Si vienen credenciales del formulario, guardarlas antes de probar
  if (body && Object.keys(body).length) {
    const toSave = { ...body };
    if (toSave.smtp_pass === "••••••••") delete toSave.smtp_pass;
    await saveConfig(toSave);
  }

  const cfg = await getConfig();

  if (!cfg.email_to || !cfg.smtp_host || !cfg.smtp_user || !cfg.smtp_pass) {
    return NextResponse.json(
      { ok: false, error: "Completa todos los campos SMTP antes de probar" },
      { status: 400 }
    );
  }

  try {
    const transporter = nodemailer.createTransport({
      host: cfg.smtp_host,
      port: parseInt(cfg.smtp_port || "587"),
      secure: cfg.smtp_tls === "1" && parseInt(cfg.smtp_port || "587") === 465,
      auth: { user: cfg.smtp_user, pass: cfg.smtp_pass },
      tls: { rejectUnauthorized: false },
    });

    await transporter.sendMail({
      from: cfg.email_from || cfg.smtp_user,
      to: cfg.email_to,
      subject: "✅ Assessment · Prueba de configuración de correo",
      html: `
        <div style="max-width:480px;margin:32px auto;font-family:sans-serif">
          <div style="background:linear-gradient(135deg,#4F46E5,#7C3AED);padding:24px;border-radius:12px 12px 0 0;text-align:center">
            <h2 style="color:white;margin:0">⚡ Assessment · Correo configurado</h2>
          </div>
          <div style="border:1px solid #E5E7EB;border-top:none;border-radius:0 0 12px 12px;padding:24px">
            <p style="color:#111827;font-size:15px">✅ La configuración de correo funciona correctamente.</p>
            <p style="color:#6B7280;font-size:13px">
              Recibirás reportes HTML ejecutivos completos cada vez que se ejecute el pipeline,
              incluyendo KPIs, semáforos y alertas generadas por Claude Haiku.
            </p>
            <div style="background:#F9FAFB;border-radius:8px;padding:16px;margin-top:16px;font-size:12px;color:#6B7280">
              🧠 Agente 1: Claude Haiku &nbsp;·&nbsp; ✨ Agente 2: Claude Sonnet<br>
              🗄️ RAG: ChromaDB &nbsp;·&nbsp; 📱 WhatsApp activo
            </div>
          </div>
        </div>
      `,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
