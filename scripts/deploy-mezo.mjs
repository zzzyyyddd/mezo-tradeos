import "dotenv/config";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import {
  createPublicClient,
  createWalletClient,
  http,
  defineChain,
  formatEther,
  encodeDeployData,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const mezo = defineChain({
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

const MUSD = "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503";
const rpc = process.env.MEZO_RPC_URL || "https://rpc.test.mezo.org";
const key = process.env.DEPLOYER_PRIVATE_KEY;

if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) {
  throw new Error("DEPLOYER_PRIVATE_KEY tidak valid");
}

const account = privateKeyToAccount(key);

const publicClient = createPublicClient({
  chain: mezo,
  transport: http(rpc),
});

const walletClient = createWalletClient({
  account,
  chain: mezo,
  transport: http(rpc),
});

const artifact = JSON.parse(
  readFileSync(
    "artifacts/contracts/TradeEscrow.sol/TradeEscrow.json",
    "utf8"
  )
);

const balance = await publicClient.getBalance({
  address: account.address,
});

console.log("Deployer:", account.address);
console.log("BTC balance:", formatEther(balance));

if (balance === 0n) {
  throw new Error("Saldo gas kosong. Isi faucet dahulu.");
}

const deployment = {
  abi: artifact.abi,
  bytecode: artifact.bytecode,
  args: [MUSD],
  account,
};

const deployData = encodeDeployData({
  abi: artifact.abi,
  bytecode: artifact.bytecode,
  args: [MUSD],
});

const gas = await publicClient.estimateGas({
  account: account.address,
  data: deployData,
});

const gasPrice = await publicClient.getGasPrice();
const estimatedCost = gas * gasPrice;

console.log("Estimated gas:", gas.toString());
console.log("Estimated cost BTC:", formatEther(estimatedCost));

if (balance < estimatedCost * 2n) {
  throw new Error("Saldo terlalu rendah untuk buffer deployment 2x.");
}

if (process.env.CONFIRM_DEPLOY !== "YES") {
  console.log("Simulasi berhasil. Belum ada transaksi dikirim.");
  console.log("Untuk deploy: CONFIRM_DEPLOY=YES node scripts/deploy-mezo.mjs");
  process.exit(0);
}

const hash = await walletClient.deployContract(deployment);

console.log("Deployment transaction:", hash);

const receipt = await publicClient.waitForTransactionReceipt({
  hash,
  timeout: 180000,
});

if (receipt.status !== "success" || !receipt.contractAddress) {
  throw new Error("Deployment gagal atau alamat kontrak tidak ditemukan.");
}

const address = receipt.contractAddress;

console.log("TRADE ESCROW DEPLOYED:", address);

mkdirSync("deployments", { recursive: true });

writeFileSync(
  "deployments/mezo-testnet.json",
  JSON.stringify({
    chainId: 31611,
    musd: MUSD,
    escrow: address,
    transactionHash: hash,
    blockNumber: receipt.blockNumber.toString(),
  }, null, 2)
);

console.log("Deployment tersimpan di deployments/mezo-testnet.json");
