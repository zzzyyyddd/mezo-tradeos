import "dotenv/config";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  chmodSync,
} from "node:fs";
import {
  createPublicClient,
  createWalletClient,
  http,
  defineChain,
  parseUnits,
  parseEther,
  formatUnits,
  keccak256,
  stringToHex,
} from "viem";
import {
  privateKeyToAccount,
  generatePrivateKey,
} from "viem/accounts";

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

const escrow = deployment.escrow;
const musd = deployment.musd;

const tokenAbi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { type: "address" },
      { type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
];

const key = process.env.DEPLOYER_PRIVATE_KEY;

if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) {
  throw new Error("DEPLOYER_PRIVATE_KEY tidak valid");
}

const buyer = privateKeyToAccount(key);

const wallet = (account) => createWalletClient({
  account,
  chain,
  transport: http(rpc),
});

const buyerClient = wallet(buyer);

const walletFile = "deployments/demo-wallets.json";

mkdirSync("deployments", { recursive: true });

let keys;

if (existsSync(walletFile)) {
  keys = JSON.parse(readFileSync(walletFile, "utf8"));
} else {
  keys = {
    seller: generatePrivateKey(),
    resolver: generatePrivateKey(),
  };

  writeFileSync(
    walletFile,
    JSON.stringify(keys, null, 2),
    { mode: 0o600 }
  );

  chmodSync(walletFile, 0o600);
}

const seller = privateKeyToAccount(keys.seller);
const resolver = privateKeyToAccount(keys.resolver);
const sellerClient = wallet(seller);

const amount1 = parseUnits("0.4", 18);
const amount2 = parseUnits("0.6", 18);
const total = amount1 + amount2;

async function send(label, action) {
  const hash = await action();

  console.log(label, hash);

  const receipt = await publicClient.waitForTransactionReceipt({
    hash,
    timeout: 180000,
  });

  if (receipt.status !== "success") {
    throw new Error(`${label} reverted: ${hash}`);
  }

  return hash;
}

async function main() {
  const chainId = await publicClient.getChainId();

  if (chainId !== 31611 || deployment.chainId !== 31611) {
    throw new Error("Wrong chain");
  }

  const balance = await publicClient.readContract({
    address: musd,
    abi: tokenAbi,
    functionName: "balanceOf",
    args: [buyer.address],
  });

  console.log("Buyer:", buyer.address);
  console.log("Seller:", seller.address);
  console.log("Resolver:", resolver.address);
  console.log("Buyer MUSD:", formatUnits(balance, 18));

  if (balance < total) {
    throw new Error("Saldo MUSD kurang dari 1");
  }

  if (process.env.CONFIRM_TRADE !== "YES") {
    console.log("DRY RUN: belum mengirim transaksi.");
    console.log("Untuk menjalankan: CONFIRM_TRADE=YES node scripts/demo-trade.mjs");
    return;
  }

  const sellerGas = await publicClient.getBalance({
    address: seller.address,
  });

  if (sellerGas < parseEther("0.00001")) {
    await send("Fund seller gas:", () =>
      buyerClient.sendTransaction({
        to: seller.address,
        value: parseEther("0.00001") - sellerGas,
      })
    );
  }

  const block = await publicClient.getBlock();
  const deadline = block.timestamp + 7n * 86400n;

  const tradeId = await publicClient.readContract({
    address: escrow,
    abi: artifact.abi,
    functionName: "nextTradeId",
  });

  await send("Create trade:", () =>
    buyerClient.writeContract({
      address: escrow,
      abi: artifact.abi,
      functionName: "createTrade",
      args: [
        seller.address,
        resolver.address,
        [amount1, amount2],
        deadline,
      ],
    })
  );

  console.log("TRADE ID:", tradeId.toString());

  await send("Approve MUSD:", () =>
    buyerClient.writeContract({
      address: musd,
      abi: tokenAbi,
      functionName: "approve",
      args: [escrow, total],
    })
  );

  await send("Fund escrow:", () =>
    buyerClient.writeContract({
      address: escrow,
      abi: artifact.abi,
      functionName: "fundTrade",
      args: [tradeId],
    })
  );

  for (const [index, amount] of [amount1, amount2].entries()) {
    const evidence = keccak256(
      stringToHex(
        `Mezo TradeOS testnet trade ${tradeId} milestone ${index} delivery evidence`
      )
    );

    await send(`Submit evidence ${index}:`, () =>
      sellerClient.writeContract({
        address: escrow,
        abi: artifact.abi,
        functionName: "submitMilestone",
        args: [tradeId, evidence],
      })
    );

    await send(`Release milestone ${index}:`, () =>
      buyerClient.writeContract({
        address: escrow,
        abi: artifact.abi,
        functionName: "releaseMilestone",
        args: [tradeId],
      })
    );

    console.log(
      "Milestone released:",
      formatUnits(amount, 18),
      "MUSD"
    );
  }

  const sellerBalance = await publicClient.readContract({
    address: musd,
    abi: tokenAbi,
    functionName: "balanceOf",
    args: [seller.address],
  });

  const trade = await publicClient.readContract({
    address: escrow,
    abi: artifact.abi,
    functionName: "trades",
    args: [tradeId],
  });

  if (trade[8] !== 3 || sellerBalance < total) {
    throw new Error("Final settlement verification failed");
  }

  console.log("SELLER MUSD:", formatUnits(sellerBalance, 18));
  console.log("TRADE STATUS: COMPLETED");
  console.log("END-TO-END TEST PASSED");
}

main().catch((error) => {
  console.error("DEMO FAILED:", error.shortMessage || error.message);
  process.exitCode = 1;
});
