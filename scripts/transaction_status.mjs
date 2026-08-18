import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";

const hash = process.argv[2];
if (!hash) throw new Error("Usage: node scripts/transaction_status.mjs <transaction-hash>");
const client = createClient({ chain: studionet, endpoint: process.env.RS_RPC || "https://studio.genlayer.com/api" });
const transaction = await client.getTransaction({ hash });
console.log(JSON.stringify({
  hash: transaction.hash,
  status: transaction.statusName,
  result: transaction.result_name,
  rotations: transaction.rotation_count,
  createdAt: transaction.created_timestamp,
  call: transaction.data?.calldata?.readable,
}, null, 2));
