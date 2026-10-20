import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { existsSync, writeFileSync, chmodSync } from "node:fs";

if (existsSync(".env")) {
  console.error(".env sudah ada. Tidak membuat wallet baru agar tidak menimpa data.");
  process.exit(1);
}

const privateKey = generatePrivateKey();
const account = privateKeyToAccount(privateKey);

writeFileSync(
  ".env",
  `DEPLOYER_PRIVATE_KEY=${privateKey}\nMEZO_RPC_URL=https://rpc.test.mezo.org\n`,
  { mode: 0o600 }
);

chmodSync(".env", 0o600);

console.log("Wallet deployment berhasil dibuat.");
console.log("ADDRESS:", account.address);
console.log("Private key tersimpan di .env (tidak ditampilkan).");
