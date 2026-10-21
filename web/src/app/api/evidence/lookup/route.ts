import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const tradeId = request.nextUrl.searchParams.get("tradeId");
    const milestone = request.nextUrl.searchParams.get("milestone");

    if (
      !tradeId ||
      !milestone ||
      !/^(0|[1-9]\d{0,17})$/.test(tradeId) ||
      !/^(0|[1-9]\d{0,17})$/.test(milestone)
    ) {
      return NextResponse.json(
        { error: "Invalid trade ID or milestone" },
        { status: 400 }
      );
    }

    const redis = Redis.fromEnv();

    const key = `mezo:evidence:cid:${tradeId}:${milestone}`;

    const cid = await redis.get<string>(key);

    return NextResponse.json(
      { cid: cid ?? null },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch {
    return NextResponse.json(
      { error: "Evidence lookup unavailable" },
      { status: 503 }
    );
  }
}
