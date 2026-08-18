import fs from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { Wallet } from "ethers";
import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { privateKeyToAccount } from "viem/accounts";

const caseId = process.argv[2];
if (!caseId || !process.env.RS_WALLET_PASSWORD) throw new Error("Usage: RS_WALLET_PASSWORD=... node scripts/complete_operations_case.mjs <case-id>");
const encrypted = await fs.readFile(process.env.RS_KEYSTORE || "artifacts/recallshield-studio-test.keystore.json", "utf8");
const wallet = await Wallet.fromEncryptedJson(encrypted, process.env.RS_WALLET_PASSWORD);
const client = createClient({ chain: studionet, endpoint: "https://studio.genlayer.com/api", account: privateKeyToAccount(wallet.privateKey) });
const address = "0x56914572783B7f88C4257993eCBA6b185cD65205";

async function write(functionName, args, value = 0n) {
  const hash = await client.writeContract({ address, functionName, args, value, consensusMaxRotations: 5 });
  console.log(`${functionName}: ${hash}`);
  for (;;) {
    await delay(6000);
    const tx = await client.getTransaction({ hash });
    if (tx.statusName === "FINALIZED") {
      if (!["ACCEPTED", "MAJORITY_AGREE"].includes(tx.result_name)) throw new Error(`${functionName}: ${tx.result_name}`);
      return;
    }
  }
}

await write("top_up_case", [caseId], 10n ** 18n);
await write("set_case_status", [caseId, "paused", new Date().toISOString()]);
await write("set_case_status", [caseId, "open", new Date().toISOString()]);
await write("cancel_unused_case", [caseId, new Date().toISOString()]);
console.log(JSON.stringify(await client.readContract({ address, functionName: "get_case", args: [caseId] }), (_, value) => typeof value === "bigint" ? value.toString() : value));
