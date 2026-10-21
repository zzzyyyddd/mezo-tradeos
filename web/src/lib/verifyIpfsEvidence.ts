import { keccak256, stringToHex } from "viem";
import { serializeEvidence } from "@/lib/evidenceContent";

export async function verifyIpfsEvidence(
  cid: string,
  tradeId: string,
  milestone: string
): Promise<`0x${string}`> {
  const cleanCid = cid.trim();

  if (!/^[a-zA-Z0-9]{40,100}$/.test(cleanCid)) {
    throw new Error("Invalid IPFS CID");
  }

  if (!/^\d+$/.test(tradeId) || !/^\d+$/.test(milestone)) {
    throw new Error("Invalid trade or milestone");
  }

  const response = await fetch(
    `https://gateway.pinata.cloud/ipfs/${cleanCid}`
  );

  if (!response.ok) {
    throw new Error("Unable to retrieve IPFS evidence");
  }

  const raw = await response.text();

  if (new TextEncoder().encode(raw).length > 4096) {
    throw new Error("Evidence document too large");
  }

  const document = JSON.parse(raw);

  if (
    document.tradeId !== tradeId ||
    document.milestone !== milestone
  ) {
    throw new Error("Evidence belongs to another trade or milestone");
  }

  if (serializeEvidence(document) !== raw) {
    throw new Error("Invalid evidence document format");
  }

  return keccak256(stringToHex(raw));
}
