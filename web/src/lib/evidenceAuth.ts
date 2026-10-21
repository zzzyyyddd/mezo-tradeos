export type EvidenceAuthPayload = {
  domain: string;
  chainId: number;
  contract: string;
  tradeId: string;
  milestone: string;
  seller: string;
  evidenceHash: string;
  nonce: string;
  expiresAt: number;
};

export function evidenceAuthMessage(
  payload: EvidenceAuthPayload
): string {
  return [
    "Mezo TradeOS Evidence Upload",
    `Domain: ${payload.domain}`,
    `Chain ID: ${payload.chainId}`,
    `Contract: ${payload.contract}`,
    `Trade ID: ${payload.tradeId}`,
    `Milestone: ${payload.milestone}`,
    `Seller: ${payload.seller}`,
    `Evidence Hash: ${payload.evidenceHash}`,
    `Nonce: ${payload.nonce}`,
    `Expires At: ${payload.expiresAt}`,
  ].join("\n");
}
