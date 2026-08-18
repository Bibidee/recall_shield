import fs from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { Wallet } from "ethers";
import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { privateKeyToAccount } from "viem/accounts";

const address = process.env.RS_CONTRACT;
if (!address || !process.env.RS_KEYSTORE || !process.env.RS_WALLET_PASSWORD) throw new Error("RS_CONTRACT, RS_KEYSTORE and RS_WALLET_PASSWORD are required");
const wallet = await Wallet.fromEncryptedJson(await fs.readFile(process.env.RS_KEYSTORE, "utf8"), process.env.RS_WALLET_PASSWORD);
const client = createClient({ chain: studionet, endpoint: process.env.RS_RPC || "https://studio.genlayer.com/api", account: privateKeyToAccount(wallet.privateKey) });
const unit = 10n ** 18n;
const payout = unit / 10n;
const reserve = unit / 20n;
const bond = unit / 100n;
const allocation = payout + reserve;
const stamp = Date.now();
const transactions = [];
const json = value => JSON.stringify(value, (_, item) => typeof item === "bigint" ? item.toString() : item);

async function read(functionName, args = []) {
  return client.readContract({ address, functionName, args, transactionHashVariant: "latest-final" });
}
async function terminal(hash) {
  for (let attempt = 0; attempt < 180; attempt++) {
    await delay(5000);
    const tx = await client.getTransaction({ hash });
    if (["FINALIZED", "UNDETERMINED", "CANCELED"].includes(tx.statusName)) return tx;
  }
  throw new Error(`Transaction timeout: ${hash}`);
}
async function write(functionName, args, value = 0n) {
  const hash = await client.writeContract({ address, functionName, args, value, consensusMaxRotations: 5 });
  const tx = await terminal(hash);
  const validators = tx.consensus_data?.validators || [];
  const validator = validators.find(item => item.mode === "leader") || validators.find(item => Buffer.from(item.result || "", "base64").toString("utf8") !== "\u0002idle") || validators[0];
  const record = { functionName, hash, status: tx.statusName, result: tx.result_name, execution: validator?.execution_result, rotations: tx.rotation_count };
  transactions.push(record); console.log(json(record)); return record;
}
function accepted(record) {
  return record.status === "FINALIZED" && record.execution === "SUCCESS" && ["ACCEPTED", "MAJORITY_AGREE"].includes(record.result);
}
async function waitState(label, probe) {
  for (let attempt = 0; attempt < 90; attempt++) {
    try { const result = await probe(); if (result) return result; } catch {}
    await delay(4000);
  }
  throw new Error(`Canonical-state timeout: ${label}`);
}
async function mustWrite(functionName, args, value = 0n) {
  const record = await write(functionName, args, value);
  if (!accepted(record)) throw new Error(`${functionName} failed: ${json(record)}`);
  return record;
}
async function createAndSubmit(label, proof, image, statement) {
  const caseId = `rs-v21-live-${label}-case-${stamp}`;
  const claimId = `rs-v21-live-${label}-${stamp}`;
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 86400);
  await mustWrite("create_case", [caseId, `RecallShield v2.1 live ${label}`, "Samsung", "Samsung Galaxy Note 7", "https://en.wikipedia.org/wiki/Samsung_Galaxy_Note_7_recall", "https://en.wikipedia.org/wiki/Samsung_Galaxy_Note_7", "Assess product identity, recall applicability, and ownership independently.", payout, reserve, 1n, bond, deadline], allocation);
  await waitState(`${caseId} created`, async () => (await read("get_case", [caseId])).status === "open");
  await mustWrite("submit_claim", [claimId, caseId, proof, image, "", statement], bond);
  await waitState(`${claimId} submitted`, async () => (await read("get_claim", [claimId])).status === "submitted");
  return { caseId, claimId };
}
async function close(caseId) {
  await mustWrite("set_case_status", [caseId, "claims_closed"]);
  await waitState(`${caseId} intake closed`, async () => (await read("get_case", [caseId])).status === "claims_closed");
  const current = await read("get_case", [caseId]);
  if (BigInt(current.reclaimable_surplus) > 0n) await mustWrite("reclaim_surplus", [caseId]);
  await mustWrite("finalize_case", [caseId]);
  return waitState(`${caseId} finalized`, async () => {
    const value = await read("get_case", [caseId]); return value.status === "closed" ? value : null;
  });
}

await mustWrite("set_paused", [false]);
const pauseExit = await createAndSubmit("pause-exit", "https://en.wikipedia.org/wiki/Product_recall", "https://upload.wikimedia.org/wikipedia/commons/3/3f/Fronalpstock_big.jpg", "Controlled submitted claim for emergency-pause liveness.");
const beforePause = await read("get_case", [pauseExit.caseId]);
await mustWrite("set_paused", [true]);
const blocked = await write("evaluate_claim", [pauseExit.claimId]);
if (accepted(blocked)) throw new Error("Paused evaluation unexpectedly succeeded");
const unchangedClaim = await read("get_claim", [pauseExit.claimId]);
const unchangedCase = await read("get_case", [pauseExit.caseId]);
if (unchangedClaim.status !== "submitted" || BigInt(unchangedClaim.evaluated_at) !== 0n || BigInt(unchangedCase.outstanding_liability) !== BigInt(beforePause.outstanding_liability) || unchangedCase.claims_terminal !== beforePause.claims_terminal) throw new Error("Paused rejection mutated canonical state");
await mustWrite("withdraw_claim", [pauseExit.claimId]);
const pausedExitClaim = await waitState("paused withdrawal", async () => {
  const value = await read("get_claim", [pauseExit.claimId]); return value.status === "settled" ? value : null;
});
if (BigInt(pausedExitClaim.claimant_payout) !== bond || BigInt(pausedExitClaim.owner_release) !== allocation || pausedExitClaim.verdict !== "withdrawn") throw new Error("Paused exit settlement amounts are unsafe");
await mustWrite("set_paused", [false]);
const pauseFinal = await close(pauseExit.caseId);

const manualExit = await createAndSubmit("manual-exit", "https://example.org", "https://upload.wikimedia.org/wikipedia/commons/4/4e/Samsung_Galaxy_Note_7_rear.jpg", "Product may match, but claimant ownership evidence is intentionally absent.");
const evaluation = await write("evaluate_claim", [manualExit.claimId]);
let manualClaim = await read("get_claim", [manualExit.claimId]);
if (accepted(evaluation) && manualClaim.status === "needs_manual_review") {
  await mustWrite("set_paused", [true]);
  await mustWrite("withdraw_claim", [manualExit.claimId]);
  manualClaim = await waitState("manual withdrawal", async () => {
    const value = await read("get_claim", [manualExit.claimId]); return value.status === "settled" ? value : null;
  });
  if (manualClaim.verdict !== "withdrawn" || BigInt(manualClaim.claimant_payout) !== bond || BigInt(manualClaim.owner_release) !== allocation) throw new Error("Manual-review exit did not return bond only");
  await mustWrite("set_paused", [false]);
} else if (!accepted(evaluation) && manualClaim.status === "submitted" && BigInt(manualClaim.evaluated_at) === 0n) {
  await mustWrite("withdraw_claim", [manualExit.claimId]);
} else {
  throw new Error(`Manual-exit scenario did not reach a safe withdrawable state: ${json({ evaluation, manualClaim })}`);
}
const manualFinal = await close(manualExit.caseId);
for (const value of [pauseFinal, manualFinal]) {
  if (value.status !== "closed" || BigInt(value.funds_held) !== 0n || BigInt(value.outstanding_liability) !== 0n || value.claims_submitted !== value.claims_terminal || !value.liability_invariant) throw new Error("Final liveness case accounting is unsafe");
}
console.log(json({ contract: address, pauseExit: { claim: pausedExitClaim, finalCase: pauseFinal }, manualExit: { claim: manualClaim, finalCase: manualFinal }, transactions }));
