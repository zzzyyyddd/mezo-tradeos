import "dotenv/config";
import { readFileSync } from "node:fs";
import {
  createPublicClient,
  createWalletClient,
  http,
  defineChain,
  keccak256,
  stringToHex,
  formatUnits,
  parseAbi,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const chain = defineChain({
  id: 31611,
  name: "Mezo Testnet",
  nativeCurrency: {
    name: "Bitcoin",
    symbol: "BTC",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ["https://rpc.test.mezo.org"],
    },
  },
});

const rpc = process.env.MEZO_RPC_URL ||
  "https://rpc.test.mezo.org";

const publicClient = createPublicClient({
  chain,
  transport: http(rpc),
});

const deployment = JSON.parse(
  readFileSync("deployments/mezo-testnet.json", "utf8")
);

const artifact = JSON.parse(
  readFileSync(
    "artifacts/contracts/TradeEscrow.sol/TradeEscrow.json",
    "utf8"
  )
);

const keys = JSON.parse(
  readFileSync("deployments/demo-wallets.json", "utf8")
);

const buyer = privateKeyToAccount(
  process.env.DEPLOYER_PRIVATE_KEY
);

const seller = privateKeyToAccount(keys.seller);

const buyerClient = createWalletClient({
  account: buyer,
  chain,
  transport: http(rpc),
});

const sellerClient = createWalletClient({
  account: seller,
  chain,
  transport: http(rpc),
});

const escrow = deployment.escrow;
const tradeId = 0n;

async function send(label, client, functionName, args) {
  const { request } = await publicClient.simulateContract({
    address: escrow,
    abi: artifact.abi,
    functionName,
    args,
    account: client.account,
  });

  const hash = await client.writeContract(request);
  console.log(label, hash);

  const receipt = await publicClient.waitForTransactionReceipt({
    hash,
    timeout: 180000,
  });

  if (receipt.status !== "success") {
    throw new Error(`${label} reverted: ${hash}`);
  }
}

async function main() {
  const chainId = await publicClient.getChainId();

  if (chainId !== 31611) {
    throw new Error("Wrong network");
  }

  const trade = await publicClient.readContract({
    address: escrow,
    abi: artifact.abi,
    functionName: "trades",
    args: [tradeId],
  });

  console.log("Trade ID:", tradeId.toString());
  console.log("Buyer:", trade[0]);
  console.log("Seller:", trade[1]);
  console.log("Total MUSD:", formatUnits(trade[3], 18));
  console.log("Released MUSD:", formatUnits(trade[4], 18));
  console.log("Status:", trade[8]);

  if (trade[0].toLowerCase() !== buyer.address.toLowerCase()) {
    throw new Error("Buyer mismatch");
  }

  if (trade[1].toLowerCase() !== seller.address.toLowerCase()) {
    throw new Error("Seller mismatch");
  }

  if (trade[8] === 3) {
    console.log("Trade already completed.");
    return;
  }

  if (trade[8] !== 1) {
    throw new Error("Trade is not in Funded status");
  }

  for (;;) {
    const current = await publicClient.readContract({
      address: escrow,
      abi: artifact.abi,
      functionName: "trades",
      args: [tradeId],
    });

    const nextMilestone = current[7];
    const milestoneCount = current[6];

    if (nextMilestone >= milestoneCount) {
      break;
    }

    const existingEvidence = await publicClient.readContract({
      address: escrow,
      abi: artifact.abi,
      functionName: "milestoneEvidence",
      args: [tradeId, nextMilestone],
    });

    if (existingEvidence === `0x${"00".repeat(32)}`) {
      const evidence = keccak256(
        stringToHex(
          `Mezo TradeOS testnet trade ${tradeId} milestone ${nextMilestone} delivery evidence`
        )
      );

      console.log("Evidence:", evidence);

      await send(
        `Submit evidence ${nextMilestone}:`,
        sellerClient,
        "submitMilestone",
        [tradeId, evidence]
      );
    }

    await send(
      `Release milestone ${nextMilestone}:`,
      buyerClient,
      "releaseMilestone",
      [tradeId]
    );
  }

  const finalTrade = await publicClient.readContract({
    address: escrow,
    abi: artifact.abi,
    functionName: "trades",
    args: [tradeId],
  });

  const musdAbi = parseAbi([
    "function balanceOf(address) view returns (uint256)"
  ]);

  const sellerBalance = await publicClient.readContract({
    address: deployment.musd,
    abi: musdAbi,
    functionName: "balanceOf",
    args: [seller.address],
  });

  console.log("Final status:", finalTrade[8]);
  console.log("Seller MUSD:", formatUnits(sellerBalance, 18));

  if (finalTrade[8] !== 3) {
    throw new Error("Trade not completed");
  }

  console.log("END-TO-END TEST PASSED");
}

main().catch((error) => {
  console.error("FAILED:", error.shortMessage || error.message);
  process.exitCode = 1;
});
