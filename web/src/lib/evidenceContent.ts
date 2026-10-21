import { keccak256, stringToHex } from "viem";

export type EvidenceDocument = {
  app: "Mezo TradeOS";
  version: 1;
  tradeId: string;
  milestone: string;
  description: string;
};

export function serializeEvidence(
  document: EvidenceDocument
): string {
  if (
    document.app !== "Mezo TradeOS" ||
    document.version !== 1 ||
    !/^\d+$/.test(document.tradeId) ||
    !/^\d+$/.test(document.milestone)
  ) {
    throw new Error("Invalid evidence metadata");
  }

  const description = document.description.trim();

  if (description.length < 10 || description.length > 2000) {
    throw new Error("Evidence description must be 10–2000 characters");
  }

  return JSON.stringify({
    app: "Mezo TradeOS",
    version: 1,
    tradeId: document.tradeId,
    milestone: document.milestone,
    description,
  });
}

export function hashEvidence(
  serializedDocument: string
): `0x${string}` {
  return keccak256(stringToHex(serializedDocument));
}
