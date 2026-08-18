import fs from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { Wallet } from "ethers";
import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { privateKeyToAccount } from "viem/accounts";

if (!process.env.RS_WALLET_PASSWORD) throw new Error("RS_WALLET_PASSWORD is required");
if (!process.env.RS_KEYSTORE) throw new Error("RS_KEYSTORE is required; keep signer material outside generated artifacts");
const wallet = await Wallet.fromEncryptedJson(await fs.readFile(process.env.RS_KEYSTORE, "utf8"), process.env.RS_WALLET_PASSWORD);
const client = createClient({ chain: studionet, endpoint: process.env.RS_RPC || "https://studio.genlayer.com/api", account: privateKeyToAccount(wallet.privateKey) });
const code = await fs.readFile("contracts/recall_shield.py", "utf8");
const hash = await client.deployContract({ code, args: [wallet.address], consensusMaxRotations: 5 });
console.log(JSON.stringify({ deploymentTransaction: hash, source: "contracts/recall_shield.py", owner: wallet.address }, null, 2));
for (let attempt = 0; attempt < 180; attempt++) {
  await delay(5000);
  const transaction = await client.getTransaction({ hash });
  if (!["FINALIZED", "UNDETERMINED"].includes(transaction.statusName)) continue;
  const contractAddress = transaction.data?.calldata?.contractAddress || transaction.recipient || transaction.to;
  const validators = transaction.consensus_data?.validators || [];
  const validator = validators.find(item => item.mode === "leader") || validators.find(item => Buffer.from(item.result || "", "base64").toString("utf8") !== "\u0002idle") || validators[0];
  const execution = validator?.execution_result;
  console.log(JSON.stringify({
    deploymentTransaction: hash,
    status: transaction.statusName,
    result: transaction.result_name,
    execution,
    rotations: transaction.rotation_count,
    contractAddress,
    explorer: contractAddress ? `https://explorer-studio.genlayer.com/address/${contractAddress}` : undefined,
  }, null, 2));
  if (transaction.statusName !== "FINALIZED" || execution !== "SUCCESS" || !contractAddress) process.exitCode = 1;
  process.exit();
}
throw new Error(`Deployment timeout: ${hash}`);
