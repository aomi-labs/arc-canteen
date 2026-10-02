import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  formatUsdc,
  isHexHash,
  sameAddress,
  type ApprovedPaymentIntent,
  type HexAddress,
  type SettlementAdapter,
  type SettlementReceipt,
} from "./domain";

export type CommandResult = {
  stdout: string;
  stderr: string;
};

export interface CommandRunner {
  run(executable: string, args: readonly string[]): Promise<CommandResult>;
}

const execFileAsync = promisify(execFile);

export class NodeCommandRunner implements CommandRunner {
  async run(executable: string, args: readonly string[]) {
    const { stdout, stderr } = await execFileAsync(executable, [...args], {
      encoding: "utf8",
      timeout: 135_000,
    });
    return { stdout: String(stdout), stderr: String(stderr) };
  }
}

type CircleTransferResult = {
  data?: {
    id?: string;
    state?: string;
    txHash?: string;
  };
};

export class CircleCliSettlementAdapter implements SettlementAdapter {
  constructor(
    private readonly wallet: HexAddress,
    private readonly runner: CommandRunner,
  ) {}

  async settle(
    intent: ApprovedPaymentIntent,
  ): Promise<SettlementReceipt> {
    if (!sameAddress(intent.source, this.wallet)) {
      throw new Error("Approved source does not match the Circle agent wallet");
    }

    const result = await this.runner.run("circle", [
      "wallet",
      "transfer",
      intent.recipient,
      "--amount",
      formatUsdc(intent.amountUsdcMicros),
      "--address",
      this.wallet,
      "--chain",
      intent.chain,
      "--idempotency-key",
      intent.id,
      "--output",
      "json",
    ]);

    const parsed = JSON.parse(result.stdout) as CircleTransferResult;
    const state = parsed.data?.state?.toUpperCase();
    const txHash = parsed.data?.txHash;

    const settled = state === "CONFIRMED" || state === "COMPLETE";
    if (!settled || !txHash || !isHexHash(txHash)) {
      return {
        intentId: intent.id,
        provider: "circle-agent-wallet",
        providerId: parsed.data?.id,
        status: "unresolved",
      };
    }

    return {
      intentId: intent.id,
      provider: "circle-agent-wallet",
      providerId: parsed.data?.id,
      status: "confirmed",
      txHash,
    };
  }
}
