import { NextResponse } from "next/server";
import pool from "@/lib/db";

export async function GET() {
  const [rows] = await pool.query(
    "SELECT * FROM run_logs ORDER BY created_at DESC LIMIT 50"
  ) as unknown as [unknown[][], unknown];
  return NextResponse.json({ data: rows });
}
