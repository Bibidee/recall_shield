import fs from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { Wallet } from "ethers";
import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { privateKeyToAccount } from "viem/accounts";

const CONTRACT = process.env.RS_CONTRACT;
const RPC = process.env.RS_RPC || "https://studio.genlayer.com/api";
const KEYSTORE = process.env.RS_KEYSTORE;
if (!CONTRACT) throw new Error("RS_CONTRACT is required (deploy v2.1 first)");
if (!process.env.RS_WALLET_PASSWORD) throw new Error("RS_WALLET_PASSWORD is required");
if (!KEYSTORE) throw new Error("RS_KEYSTORE is required; keep signer material outside generated artifacts");
const wallet = await Wallet.fromEncryptedJson(await fs.readFile(KEYSTORE, "utf8"), process.env.RS_WALLET_PASSWORD);
const client = createClient({ chain: studionet, endpoint: RPC, account: privateKeyToAccount(wallet.privateKey) });
const address = CONTRACT;
const unit = 10n ** 18n;
const payout = unit / 5n;
const reserve = unit / 10n;
const bond = unit / 50n;
const stamp = Date.now();
const txLog = [];
const finalCases = [];
const json = value => JSON.stringify(value, (_, item) => typeof item === "bigint" ? item.toString() : item);

const scenarios = [
  { label: "matching", proof: "https://en.wikipedia.org/wiki/Receipt", image: "https://upload.wikimedia.org/wikipedia/commons/7/7c/Samsung_Galaxy_Note_7.png", purchase: "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0b/ReceiptSwiss.jpg/330px-ReceiptSwiss.jpg", statement: "A Note 7 product image and purchase record are supplied for the configured recall.", forbiddenVerdicts: [] },
  { label: "mismatch", proof: "https://en.wikipedia.org/wiki/Product_recall", image: "https://upload.wikimedia.org/wikipedia/commons/3/3f/Fronalpstock_big.jpg", purchase: "", statement: "The deliberately unrelated mountain image should fail product identity.", forbiddenVerdicts: ["eligible"] },
  { label: "ambiguous", proof: "https://example.org", image: "https://upload.wikimedia.org/wikipedia/commons/4/4e/Samsung_Galaxy_Note_7_rear.jpg", purchase: "", statement: "The product may match, but reliable claimant ownership evidence is intentionally absent.", forbiddenVerdicts: ["eligible"] },
];

async function read(functionName, args = []) {
  return client.readContract({ address, functionName, args, transactionHashVariant: "latest-final" });
}
async function transaction(hash) {
  for (let attempt = 0; attempt < 180; attempt++) {
    await delay(5000);
    const tx = await client.getTransaction({ hash });
    if (["FINALIZED", "UNDETERMINED", "CANCELED"].includes(tx.statusName)) return tx;
  }
  throw new Error(`Transaction timeout: ${hash}`);
}
async function write(functionName, args, value = 0n) {
  const hash = await client.writeContract({ address, functionName, args, value, consensusMaxRotations: 5 });
  const tx = await transaction(hash);
  const validators = tx.consensus_data?.validators || [];
  const validator = validators.find(item => item.mode === "leader") || validators.find(item => Buffer.from(item.result || "", "base64").toString("utf8") !== "\u0002idle") || validators[0];
  const execution = validator?.execution_result;
  const record = { functionName, hash, status: tx.statusName, result: tx.result_name, execution, rotations: tx.rotation_count };
  txLog.push(record); console.log(json(record));
  return record;
}
async function waitState(label, probe) {
  for (let attempt = 0; attempt < 90; attempt++) {
    try { const value = await probe(); if (value) return value; } catch {}
    await delay(4000);
  }
  throw new Error(`Canonical-state timeout: ${label}`);
}
function accepted(record) { return record.status === "FINALIZED" && record.execution === "SUCCESS" && ["ACCEPTED", "MAJORITY_AGREE"].includes(record.result); }

async function closeCase(caseId) {
  let current = await read("get_case", [caseId]);
  let record;
  if (["open", "paused"].includes(current.status)) {
    record = await write("set_case_status", [caseId, "claims_closed"]);
    if (!accepted(record)) throw new Error(`Unable to close intake: ${caseId}`);
    current = await waitState(`${caseId} intake closed`, async () => {
      const value = await read("get_case", [caseId]); return value.status === "claims_closed" ? value : null;
    });
  }
  if (current.status === "closed") return current;
  if (current.status !== "claims_closed") throw new Error(`Unexpected case state during cleanup: ${current.status}`);
  const beforeFinal = current;
  if (BigInt(beforeFinal.reclaimable_surplus) > 0n) {
    record = await write("reclaim_surplus", [caseId]);
    if (!accepted(record)) throw new Error(`Unable to reclaim surplus: ${caseId}`);
  }
  record = await write("finalize_case", [caseId]);
  if (!accepted(record)) throw new Error(`Unable to finalize case: ${caseId}`);
  const finalCase = await waitState(`${caseId} finalized`, async () => {
    const value = await read("get_case", [caseId]); return value.status === "closed" ? value : null;
  });
  if (BigInt(finalCase.funds_held) > 0n) {
    record = await write("reclaim_closed_case", [caseId]);
    if (!accepted(record)) throw new Error(`Unable to reclaim closed-case funds: ${caseId}`);
  }
  return read("get_case", [caseId]);
}

if (process.env.RS_CLEANUP_CASE) {
  if (process.env.RS_RECOVER_CLAIM) {
    const claim = await read("get_claim", [process.env.RS_RECOVER_CLAIM]);
    if (["submitted", "needs_manual_review"].includes(claim.status)) {
      const withdrawal = await write("withdraw_claim", [process.env.RS_RECOVER_CLAIM]);
      if (!accepted(withdrawal)) throw new Error(`Recovery withdrawal failed: ${json(withdrawal)}`);
    }
  }
  const cleaned = await closeCase(process.env.RS_CLEANUP_CASE);
  console.log(json({ cleanedCase: cleaned }));
  if (process.env.RS_CLEANUP_ONLY === "1") process.exit(0);
}

const deadline = BigInt(Math.floor(Date.now() / 1000) + 86400);
for (const scenario of scenarios) {
  const caseId = `rs-v21-${scenario.label}-case-${stamp}`;
  const claimId = `rs-v21-${scenario.label}-${stamp}`;
  let record = await write("create_case", [caseId, `RecallShield v2.1 ${scenario.label} scenario`, "Samsung", "Samsung Galaxy Note 7", "https://en.wikipedia.org/wiki/Samsung_Galaxy_Note_7_recall", "https://en.wikipedia.org/wiki/Samsung_Galaxy_Note_7", "Assess product identity, recall applicability, and ownership independently.", payout, reserve, 1n, bond, deadline], payout + reserve);
  if (!accepted(record)) throw new Error(`Case creation failed: ${json(record)}`);
  await waitState(`${caseId} created`, async () => (await read("get_case", [caseId])).status === "open");
  record = await write("submit_claim", [claimId, caseId, scenario.proof, scenario.image, scenario.purchase, scenario.statement], bond);
  if (!accepted(record)) throw new Error(`Claim submission failed: ${json(record)}`);
  await waitState(`${claimId} submitted`, async () => (await read("get_claim", [claimId])).status === "submitted");
  record = await write("evaluate_claim", [claimId]);
  if (!accepted(record)) {
    const unchanged = await read("get_claim", [claimId]);
    console.log(json({ scenario: scenario.label, outcome: "NO_VERDICT", transaction: record, state: unchanged }));
    if (unchanged.status !== "submitted" || BigInt(unchanged.evaluated_at) !== 0n) throw new Error("Failed evaluation mutated claim state");
    const withdrawal = await write("withdraw_claim", [claimId]);
    if (!accepted(withdrawal)) throw new Error(`Withdrawal failed: ${json(withdrawal)}`);
  } else {
    const claim = await waitState(`${claimId} evaluated`, async () => {
      const value = await read("get_claim", [claimId]);
      return value.status !== "submitted" ? value : null;
    });
    console.log(json({ scenario: scenario.label, outcome: claim.verdict, state: claim }));
    if (scenario.forbiddenVerdicts.includes(claim.verdict)) {
      throw new Error(`Semantic safety assertion failed: ${scenario.label} produced forbidden verdict ${claim.verdict}`);
    }
    if (claim.status === "needs_manual_review") record = await write("settle_manual_claim", [claimId, 5000n, "Studionet QA split for successfully evaluated ambiguous evidence."]);
    else record = await write("settle_auto_claim", [claimId]);
    if (!accepted(record)) throw new Error(`Settlement failed: ${json(record)}`);
    await waitState(`${claimId} settled`, async () => (await read("get_claim", [claimId])).status === "settled");
  }
  finalCases.push(await closeCase(caseId));
}
console.log(json({ contract: address, finalCases, transactions: txLog }));
