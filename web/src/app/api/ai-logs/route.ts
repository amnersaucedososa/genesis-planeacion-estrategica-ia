import { NextResponse } from "next/server";
import pool from "@/lib/db";

export async function GET() {
  const [rows] = await pool.query(
    "SELECT * FROM chat_history ORDER BY created_at DESC LIMIT 200"
  ) as unknown as [unknown[][], unknown];

  const [tokenSum] = await pool.query(
    "SELECT COALESCE(SUM(tokens_usados), 0) as total FROM chat_history"
  ) as unknown as [unknown[], unknown];

  return NextResponse.json({
    data: rows,
    total_tokens: ((tokenSum as { total: number }[])[0]?.total) || 0,
  });
}
