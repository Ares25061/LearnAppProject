import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    ok: true,
    service: "learningapps-studio",
    timestamp: new Date().toISOString(),
  });
}
