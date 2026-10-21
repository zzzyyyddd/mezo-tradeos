import { NextRequest, NextResponse } from "next/server";
import { keccak256, stringToHex } from "viem";

import {
  serializeEvidence,
  type EvidenceDocument,
} from "@/lib/evidenceContent";

import {
  type EvidenceAuthPayload,
} from "@/lib/evidenceAuth";

import { verifyEvidenceSeller } from "@/lib/evidenceServer";
import { reserveEvidenceUpload } from "@/lib/evidenceRateLimit";

export const runtime = "nodejs";

const MAX_REQUEST_BYTES = 8192;

export async function POST(request: NextRequest) {
  try {
    const jwt = process.env.PINATA_JWT;

    if (!jwt) {
      return NextResponse.json(
        { error: "Evidence upload is not configured" },
        { status: 503 }
      );
    }

    const origin = request.headers.get("origin");

    const allowedOrigins = [
      "http://localhost:3000",
      "https://mezo-tradeos.vercel.app",
    ];

    if (!origin || !allowedOrigins.includes(origin)) {
      return NextResponse.json(
        { error: "Unauthorized origin" },
        { status: 403 }
      );
    }

    const declaredLength = Number(
      request.headers.get("content-length") ?? 0
    );

    if (
      !Number.isSafeInteger(declaredLength) ||
      declaredLength <= 0 ||
      declaredLength > MAX_REQUEST_BYTES
    ) {
      return NextResponse.json(
        { error: "Invalid request size" },
        { status: 413 }
      );
    }

    const reader = request.body?.getReader();

    if (!reader) {
      return NextResponse.json(
        { error: "Missing request body" },
        { status: 400 }
      );
    }

    const chunks: Uint8Array[] = [];
    let totalBytes = 0;

    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      totalBytes += value.byteLength;

      if (totalBytes > MAX_REQUEST_BYTES) {
        await reader.cancel();
        return NextResponse.json(
          { error: "Request too large" },
          { status: 413 }
        );
      }

      chunks.push(value);
    }

    const rawBody = Buffer.concat(chunks).toString("utf8");

    const body = JSON.parse(rawBody) as {
      document: EvidenceDocument;
      authorization: EvidenceAuthPayload;
      signature: `0x${string}`;
    };

    if (
      !body.document ||
      !body.authorization ||
      typeof body.signature !== "string"
    ) {
      throw new Error("Missing evidence authorization");
    }

    const canonical = serializeEvidence(body.document);

    const evidenceHash = keccak256(
      stringToHex(canonical)
    );

    if (
      evidenceHash.toLowerCase() !==
      body.authorization.evidenceHash?.toLowerCase()
    ) {
      throw new Error("Evidence hash does not match authorization");
    }

    if (
      body.document.tradeId !== body.authorization.tradeId ||
      body.document.milestone !== body.authorization.milestone
    ) {
      throw new Error("Evidence trade or milestone mismatch");
    }

    const domain = new URL(origin).host;

    if (body.authorization.domain !== domain) {
      throw new Error("Authorization domain mismatch");
    }

    console.log("[Evidence] Verifying seller and blockchain...");

    const verified = await verifyEvidenceSeller(
      body.authorization,
      body.signature
    );

    console.log("[Evidence] Seller verification passed");
    console.log("[Evidence] Reserving Redis nonce and quota...");

    await reserveEvidenceUpload(
      verified.seller,
      body.authorization.nonce
    );

    console.log("[Evidence] Redis reservation passed");

    const form = new FormData();

    form.append(
      "file",
      new Blob([canonical], { type: "application/json" }),
      `mezo-trade-${verified.tradeId}-milestone-${verified.milestone}.json`
    );

    form.append("network", "public");

    console.log("[Evidence] Starting Pinata upload...");

    const pinataResponse = await fetch(
      "https://uploads.pinata.cloud/v3/files",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${jwt}`,
        },
        body: form,
        signal: AbortSignal.timeout(20000),
      }
    );

    console.log(
      "[Evidence] Pinata HTTP status:",
      pinataResponse.status
    );

    if (!pinataResponse.ok) {
      throw new Error(
        `Pinata upload failed (HTTP ${pinataResponse.status})`
      );
    }

    const pinataData = await pinataResponse.json();

    const cid = pinataData?.data?.cid;

    if (
      typeof cid !== "string" ||
      !/^[a-zA-Z0-9]+$/.test(cid)
    ) {
      throw new Error("Pinata returned an invalid CID");
    }

    return NextResponse.json({
      cid,
      evidenceHash,
      gatewayUrl: `https://gateway.pinata.cloud/ipfs/${cid}`,
    });

  } catch (error) {
    console.error(
      "Evidence upload failed:",
      error instanceof Error ? error.message : "Unknown error"
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Evidence upload failed",
      },
      { status: 400 }
    );
  }
}
