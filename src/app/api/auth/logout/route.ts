import { NextResponse } from "next/server";
import { clearSession } from "@/lib/auth";
import { getPublicAppOrigin } from "@/lib/public-origin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  await clearSession();
  return NextResponse.redirect(
    new URL("/", getPublicAppOrigin(request)),
    { status: 303 },
  );
}
