import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";

export async function lockProcess(directory: string, name = "lock") {
  const child = spawn(process.execPath, ["--import", "tsx", fileURLToPath(new URL("./lock-worker.ts", import.meta.url)), directory, name]);
  const exited = once(child, "exit");
  const output = await new Promise<string>((resolve, reject) => {
    child.stdout.once("data", (data) => resolve(data.toString().trim()));
    child.once("error", reject);
    child.once("exit", () => reject(new Error("Lock worker exited before reporting ownership")));
  });
  return { child, output, exited };
}

