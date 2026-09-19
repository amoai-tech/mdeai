import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET() {
  const cookieStore = cookies();
  const session = cookieStore.get("session");
  return NextResponse.json({ signedIn: Boolean(session) });
}
