import "dotenv/config";
import {
  createPublicClient,
  http,
  formatEther,
  formatUnits,
  parseAbi,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const privateKey = process.env.DEPLOYER_PRIVATE_KEY;

if (!privateKey || !/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
  throw new Error("DEPLOYER_PRIVATE_KEY tidak valid");
}

const account = privateKeyToAccount(privateKey);

const client = createPublicClient({
  transport: http(process.env.MEZO_RPC_URL),
});

const musd = "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503";

const [gasBalance, musdBalance, gasPrice] = await Promise.all([
  client.getBalance({ address: account.address }),
  client.readContract({
    address: musd,
    abi: parseAbi([
      "function balanceOf(address) view returns (uint256)",
    ]),
    functionName: "balanceOf",
    args: [account.address],
  }),
  client.getGasPrice(),
]);

console.log("Wallet:", account.address);
console.log("BTC gas balance:", formatEther(gasBalance));
console.log("MUSD balance:", formatUnits(musdBalance, 18));
console.log("Gas price (gwei):", formatUnits(gasPrice, 9));
console.log("Wallet check completed");
