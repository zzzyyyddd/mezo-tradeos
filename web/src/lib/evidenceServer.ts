import "server-only";

import {
  createPublicClient,
  http,
  isAddress,
  isHex,
  verifyMessage,
} from "viem";

import {
  mezoTestnet,
  TRADE_ESCROW_ADDRESS,
} from "@/lib/mezo";

import escrowAbi from "@/lib/tradeEscrowAbi.json";

import {
  evidenceAuthMessage,
  type EvidenceAuthPayload,
} from "@/lib/evidenceAuth";

const client = createPublicClient({
  chain: mezoTestnet,
  transport: http("https://rpc.test.mezo.org"),
});

const ZERO_HASH = `0x${"00".repeat(32)}`;

export async function verifyEvidenceSeller(
  payload: EvidenceAuthPayload,
  signature: `0x${string}`
) {
  const now = Math.floor(Date.now() / 1000);

  if (
    payload.chainId !== mezoTestnet.id ||
    payload.contract.toLowerCase() !==
      TRADE_ESCROW_ADDRESS.toLowerCase()
  ) {
    throw new Error("Invalid network or contract");
  }

  const allowedDomains = [
    "localhost:3000",
    "mezo-tradeos.vercel.app",
  ];

  if (!allowedDomains.includes(payload.domain)) {
    throw new Error("Unauthorized application domain");
  }

  if (!isAddress(payload.seller)) {
    throw new Error("Invalid seller address");
  }

  if (
    !/^\d+$/.test(payload.tradeId) ||
    !/^\d+$/.test(payload.milestone)
  ) {
    throw new Error("Invalid trade or milestone");
  }

  if (
    !isHex(payload.evidenceHash, { strict: true }) ||
    payload.evidenceHash.length !== 66
  ) {
    throw new Error("Invalid evidence hash");
  }

  if (
    !Number.isSafeInteger(payload.expiresAt) ||
    payload.expiresAt < now ||
    payload.expiresAt > now + 300
  ) {
    throw new Error("Expired or invalid authorization");
  }

  if (
    !/^[a-f0-9]{32}$/.test(payload.nonce)
  ) {
    throw new Error("Invalid nonce");
  }

  const validSignature = await verifyMessage({
    address: payload.seller as `0x${string}`,
    message: evidenceAuthMessage(payload),
    signature,
  });

  if (!validSignature) {
    throw new Error("Invalid wallet signature");
  }

  const tradeId = BigInt(payload.tradeId);
  const milestone = BigInt(payload.milestone);

  const nextTradeId = await client.readContract({
    address: TRADE_ESCROW_ADDRESS,
    abi: escrowAbi,
    functionName: "nextTradeId",
  }) as bigint;

  if (tradeId >= nextTradeId) {
    throw new Error("Trade does not exist");
  }

  const trade = await client.readContract({
    address: TRADE_ESCROW_ADDRESS,
    abi: escrowAbi,
    functionName: "trades",
    args: [tradeId],
  }) as readonly unknown[];

  if (
    String(trade[1]).toLowerCase() !==
    payload.seller.toLowerCase()
  ) {
    throw new Error("Wallet is not the trade seller");
  }

  if (Number(trade[8]) !== 1) {
    throw new Error("Trade is not funded");
  }

  if (BigInt(String(trade[7])) !== milestone) {
    throw new Error("Milestone is not active");
  }

  if (BigInt(String(trade[5])) < BigInt(now)) {
    throw new Error("Trade deadline passed");
  }

  const existingHash = await client.readContract({
    address: TRADE_ESCROW_ADDRESS,
    abi: escrowAbi,
    functionName: "milestoneEvidence",
    args: [tradeId, milestone],
  }) as string;

  if (existingHash.toLowerCase() !== ZERO_HASH) {
    throw new Error("Evidence already submitted");
  }

  return {
    tradeId,
    milestone,
    seller: payload.seller,
    evidenceHash: payload.evidenceHash,
  };
}
