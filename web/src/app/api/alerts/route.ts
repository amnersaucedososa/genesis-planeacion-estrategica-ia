import { NextResponse } from "next/server";
import pool from "@/lib/db";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const semafor = searchParams.get("semafor");
  const run_id = searchParams.get("run_id");
  const limit = parseInt(searchParams.get("limit") || "50");

  try {
    let where = "WHERE 1=1";
    const params: (string | number)[] = [];

    if (semafor) {
      where += " AND a.semafor = ?";
      params.push(semafor);
    }
    if (run_id) {
      where += " AND a.run_id = ?";
      params.push(run_id);
    }

    params.push(limit);

    const [rows] = await pool.query(
      `SELECT a.*, r.created_at as run_fecha
       FROM alertas a
       LEFT JOIN run_logs r ON r.run_id = a.run_id
       ${where}
       ORDER BY
         CASE a.semafor WHEN 'rojo' THEN 1 WHEN 'amarillo' THEN 2 ELSE 3 END,
         a.created_at DESC
       LIMIT ?`,
      params
    );

    return NextResponse.json({ data: rows });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Error consultando alertas" }, { status: 500 });
  }
}
