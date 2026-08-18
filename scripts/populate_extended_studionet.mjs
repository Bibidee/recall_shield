import fs from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { Wallet } from "ethers";
import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { privateKeyToAccount } from "viem/accounts";

const CONTRACT = process.env.RS_CONTRACT || "0x56914572783B7f88C4257993eCBA6b185cD65205";
const RPC = process.env.RS_RPC || "https://studio.genlayer.com/api";
const ONE = 10n ** 18n;
if (!process.env.RS_WALLET_PASSWORD) throw new Error("RS_WALLET_PASSWORD is required");
const encrypted = await fs.readFile(process.env.RS_KEYSTORE || "artifacts/recallshield-studio-test.keystore.json", "utf8");
const wallet = await Wallet.fromEncryptedJson(encrypted, process.env.RS_WALLET_PASSWORD);
const client = createClient({ chain: studionet, endpoint: RPC, account: privateKeyToAccount(wallet.privateKey) });
const suffix = Date.now().toString();
const now = () => new Date().toISOString();

async function waitFinal(hash) {
  for (let attempt = 0; attempt < 80; attempt++) {
    await delay(6000);
    const tx = await client.getTransaction({ hash });
    if (tx.statusName === "FINALIZED") {
      console.log(`finalized: ${hash} (${tx.result_name})`);
      return tx;
    }
  }
  throw new Error(`Timed out waiting for ${hash}`);
}

async function write(functionName, args, value = 0n) {
  const hash = await client.writeContract({ address: CONTRACT, functionName, args, value, consensusMaxRotations: 5 });
  console.log(`${functionName}: ${hash}`);
  const tx = await waitFinal(hash);
  if (!["ACCEPTED", "MAJORITY_AGREE"].includes(tx.result_name)) throw new Error(`${functionName} finalized as ${tx.result_name}`);
  return hash;
}

const operationsCase = `rs-extended-ops-${suffix}`;
await write("create_case", [operationsCase, "Extended operations coverage", "RecallShield QA", "Escrow top-up, pause, reopen, and cancellation", "https://example.com/recall", "https://example.com/product", "Exercise every non-claim owner flow.", ONE, 0n, 2n, "2099-12-31T00:00:00Z"], 2n * ONE);
await write("top_up_case", [operationsCase], ONE);
await write("set_case_status", [operationsCase, "paused", now()]);
await write("set_case_status", [operationsCase, "open", now()]);
await write("cancel_unused_case", [operationsCase, now()]);

const secondCase = `rs-second-cycle-${suffix}`;
await write("create_case", [secondCase, "Second cancellation cycle", "RecallShield QA", "Independent case creation and refund coverage", "https://example.com/recall", "https://example.com/product", "Verify repeatable cancellation without retained escrow.", ONE, 0n, 1n, "2099-12-31T00:00:00Z"], ONE);
await write("cancel_unused_case", [secondCase, now()]);
console.log(JSON.stringify({ operationsCase, secondCase }, null, 2));
