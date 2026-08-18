import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";

const hash = process.argv[2];
if (!hash) throw new Error("Usage: node scripts/transaction_status.mjs <transaction-hash>");
const client = createClient({ chain: studionet, endpoint: process.env.RS_RPC || "https://studio.genlayer.com/api" });
const transaction = await client.getTransaction({ hash });
const validators = transaction.consensus_data?.validators || [];
const validator = validators.find(item => item.mode === "leader") || validators.find(item => Buffer.from(item.result || "", "base64").toString("utf8") !== "\u0002idle") || validators[0];
console.log(JSON.stringify({
  hash: transaction.hash,
  nonce: transaction.nonce,
  slot: transaction.tx_slot,
  status: transaction.statusName,
  result: transaction.result_name,
  executionResult: validator?.execution_result || transaction.execution_result,
  executionMessage: validator?.result ? Buffer.from(validator.result, "base64").toString("utf8") : undefined,
  executions: validators.map(item => ({ mode: item.mode, vote: item.vote, execution: item.execution_result, message: item.result ? Buffer.from(item.result, "base64").toString("utf8").slice(0, 160) : undefined })),
  rotations: transaction.rotation_count,
  createdAt: transaction.created_timestamp,
  to: transaction.to,
  recipient: transaction.recipient,
  contractAddress: transaction.data?.calldata?.contractAddress,
  inputType: transaction.data?.calldata?.type,
  call: transaction.data?.calldata?.readable,
}, null, 2));
