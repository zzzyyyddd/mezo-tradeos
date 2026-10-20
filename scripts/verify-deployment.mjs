import "dotenv/config";
import { readFileSync } from "node:fs";
import {
  createPublicClient,
  http,
  getAddress,
  parseAbi
} from "viem";

const deployment = JSON.parse(
  readFileSync("deployments/mezo-testnet.json", "utf8")
);

const client = createPublicClient({
  transport: http(
    process.env.MEZO_RPC_URL || "https://rpc.test.mezo.org"
  )
});

const abi = parseAbi([
  "function musd() view returns (address)",
  "function nextTradeId() view returns (uint256)",
  "function DISPUTE_GRACE_PERIOD() view returns (uint256)"
]);

const chainId = await client.getChainId();

if (chainId !== 31611) {
  throw new Error("Wrong network");
}

const code = await client.getCode({
  address: deployment.escrow
});

if (!code || code === "0x") {
  throw new Error("Escrow contract not found");
}

const [musd, nextTradeId, gracePeriod] = await Promise.all([
  client.readContract({
    address: deployment.escrow,
    abi,
    functionName: "musd"
  }),
  client.readContract({
    address: deployment.escrow,
    abi,
    functionName: "nextTradeId"
  }),
  client.readContract({
    address: deployment.escrow,
    abi,
    functionName: "DISPUTE_GRACE_PERIOD"
  })
]);

console.log("Chain ID:", chainId);
console.log("Escrow:", deployment.escrow);
console.log("MUSD:", musd);
console.log("Next trade ID:", nextTradeId.toString());
console.log("Grace period:", gracePeriod.toString(), "seconds");

if (getAddress(musd) !== getAddress(deployment.musd)) {
  throw new Error("MUSD address mismatch");
}

if (gracePeriod !== 86400n) {
  throw new Error("Unexpected grace period");
}

console.log("ON-CHAIN VERIFICATION PASSED");
