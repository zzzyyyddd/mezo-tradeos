import {
  createPublicClient,
  http,
  formatUnits,
} from "viem";

const RPC = "https://rpc.test.mezo.org";

const MUSD =
  "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503";

const client = createPublicClient({
  transport: http(RPC, {
    timeout: 20000,
    retryCount: 2,
  }),
});

const abi = [
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
  {
    type: "function",
    name: "totalSupply",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
];

async function main() {
  console.log("Checking Mezo Testnet...");

  const chainId = await client.getChainId();
  const blockNumber = await client.getBlockNumber();
  const code = await client.getCode({ address: MUSD });

  console.log("Chain ID:", chainId);
  console.log("Latest block:", blockNumber.toString());
  console.log("MUSD contract deployed:", Boolean(code && code !== "0x"));

  if (chainId !== 31611) {
    throw new Error("Wrong network!");
  }

  if (!code || code === "0x") {
    throw new Error("MUSD contract not found!");
  }

  const [symbol, decimals, supply] = await Promise.all([
    client.readContract({
      address: MUSD,
      abi,
      functionName: "symbol",
    }),
    client.readContract({
      address: MUSD,
      abi,
      functionName: "decimals",
    }),
    client.readContract({
      address: MUSD,
      abi,
      functionName: "totalSupply",
    }),
  ]);

  console.log("Token symbol:", symbol);
  console.log("Token decimals:", decimals);
  console.log("Total supply:", formatUnits(supply, decimals));

  if (symbol !== "MUSD" || decimals !== 18) {
    throw new Error("Unexpected token metadata!");
  }

  console.log("MEZO TESTNET CHECK PASSED");
}

main().catch((error) => {
  console.error("CHECK FAILED:", error.message);
  process.exitCode = 1;
});
