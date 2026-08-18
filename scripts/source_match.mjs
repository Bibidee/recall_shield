import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";

const address = process.env.RS_CONTRACT;
if (!address) throw new Error("RS_CONTRACT is required");
const client = createClient({ chain: studionet, endpoint: process.env.RS_RPC || "https://studio.genlayer.com/api" });
const local = await fs.readFile("contracts/recall_shield.py", "utf8");
const remoteValue = await client.getContractCode(address);
const remote = typeof remoteValue === "string" ? remoteValue : new TextDecoder().decode(remoteValue);
const digest = value => createHash("sha256").update(value, "utf8").digest("hex");
const result = { address, localSha256: digest(local), deployedSha256: digest(remote), exactMatch: local === remote };
console.log(JSON.stringify(result, null, 2));
if (!result.exactMatch) process.exitCode = 1;
