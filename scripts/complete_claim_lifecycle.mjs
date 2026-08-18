import fs from "node:fs/promises";
import { Wallet } from "ethers";
import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { privateKeyToAccount } from "viem/accounts";

const CONTRACT = process.env.RS_CONTRACT || "0x56914572783B7f88C4257993eCBA6b185cD65205";
const RPC = process.env.RS_RPC || "https://studio.genlayer.com/api";
const caseId = process.argv[2];
const claimId = process.argv[3];
if (!caseId || !claimId) throw new Error("Usage: node scripts/complete_claim_lifecycle.mjs <case-id> <claim-id>");
if (!process.env.RS_WALLET_PASSWORD) throw new Error("RS_WALLET_PASSWORD is required");

const encrypted = await fs.readFile(process.env.RS_KEYSTORE || "artifacts/recallshield-studio-test.keystore.json", "utf8");
const wallet = await Wallet.fromEncryptedJson(encrypted, process.env.RS_WALLET_PASSWORD);
const client = createClient({ chain: studionet, endpoint: RPC, account: privateKeyToAccount(wallet.privateKey) });
const json = (value) => JSON.stringify(value, (_, item) => typeof item === "bigint" ? item.toString() : item);

async function read(functionName, args = []) {
  const value = await client.readContract({ address: CONTRACT, functionName, args });
  console.log(`${functionName}: ${json(value)}`);
  return value;
}

async function write(functionName, args) {
  const hash = await client.writeContract({ address: CONTRACT, functionName, args, consensusMaxRotations: 5 });
  console.log(`${functionName}: ${hash}`);
  return hash;
}

const claim = await read("get_claim", [claimId]);
if (claim.status === "evaluated") {
  if (claim.verdict === "needs_manual_review") {
    await write("settle_manual_claim", [claimId, 5000n, "QA split settlement for uncertain public evidence.", new Date().toISOString()]);
  } else {
    await write("settle_auto_claim", [claimId, new Date().toISOString()]);
  }
} else {
  console.log(`Settlement skipped while claim status is ${claim.status}`);
}

await read("get_case", [caseId]);
await read("list_case_claims", [caseId, 0n, 10n]);
await read("get_info");
