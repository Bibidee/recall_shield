import fs from "node:fs/promises";
import { Wallet } from "ethers";
import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { privateKeyToAccount } from "viem/accounts";

const CONTRACT = "0x56914572783B7f88C4257993eCBA6b185cD65205";
const RPC = "https://studio.genlayer.com/api";
const ONE_GEN = 10n ** 18n;
const password = process.env.RS_WALLET_PASSWORD;
const keystorePath = process.env.RS_KEYSTORE || "artifacts/recallshield-studio-test.keystore.json";
if (!password) throw new Error("RS_WALLET_PASSWORD is required");

const wallet = await Wallet.fromEncryptedJson(await fs.readFile(keystorePath, "utf8"), password);
const client = createClient({ chain: studionet, endpoint: RPC, account: privateKeyToAccount(wallet.privateKey) });
const stamp = Date.now().toString();
const events = [];

async function write(functionName, args, value = 0n) {
  const hash = await client.writeContract({ address: CONTRACT, functionName, args, value, consensusMaxRotations: 5 });
  console.log(`${functionName}: ${hash}`);
  const receipt = await client.waitForTransactionReceipt({ hash, interval: 7000, retries: 60 });
  events.push({ functionName, hash, status: receipt.status_name || receipt.status });
  return receipt;
}

async function read(functionName, args = []) {
  const result = await client.readContract({ address: CONTRACT, functionName, args });
  console.log(`${functionName}: ${JSON.stringify(result, (_, v) => typeof v === "bigint" ? v.toString() : v)}`);
  return result;
}

const cancelCase = `rs-ops-${stamp}`;
await write("create_case", [cancelCase, "Operations lifecycle", "RecallShield QA", "Unused escrow cancellation test", "https://www.cpsc.gov/Recalls", "https://www.usa.gov/product-safety-recalls", "Unused cases must refund all escrow.", ONE_GEN, 0n, 1n, "2099-12-31T00:00:00Z"], ONE_GEN);
await write("set_case_status", [cancelCase, "paused", new Date().toISOString()]);
await write("set_case_status", [cancelCase, "open", new Date().toISOString()]);
await write("cancel_unused_case", [cancelCase, new Date().toISOString()]);
await read("get_case", [cancelCase]);

const claimCase = `rs-claim-${stamp}`;
const claimId = `rs-claim-id-${stamp}`;
await write("create_case", [claimCase, "Public recall evidence lifecycle", "Consumer Product Safety Commission", "Consumer product listed in a public recall database", "https://www.cpsc.gov/Recalls", "https://www.usa.gov/product-safety-recalls", "Require product, recall scope, and ownership evidence.", ONE_GEN, ONE_GEN, 1n, "2099-12-31T00:00:00Z"], 2n * ONE_GEN);
await write("submit_claim", [claimId, claimCase, "https://www.iana.org/help/example-domains", "https://www.iana.org/domains/reserved", "", "Independent lifecycle test. Public pages do not establish ownership; uncertain evidence must route to manual review.", new Date().toISOString()]);
await write("evaluate_claim", [claimId, new Date().toISOString()]);
const claim = await read("get_claim", [claimId]);
if (claim.verdict === "needs_manual_review") {
  await write("settle_manual_claim", [claimId, 5000n, "QA split settlement for uncertain public evidence.", new Date().toISOString()]);
} else if (claim.status === "evaluated") {
  await write("settle_auto_claim", [claimId, new Date().toISOString()]);
}
await write("set_case_status", [claimCase, "closed", new Date().toISOString()]);
const closed = await read("get_case", [claimCase]);
if (BigInt(closed.funds_deposited) > 0n) await write("reclaim_closed_case", [claimCase, new Date().toISOString()]);
await read("get_claim", [claimId]);
await read("list_case_claims", [claimCase, 0, 10]);
await read("get_info");
console.log(JSON.stringify({ cancelCase, claimCase, claimId, events }, null, 2));
