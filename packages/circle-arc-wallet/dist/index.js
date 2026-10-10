import { spawn } from "node:child_process";
import { encodeFunctionData, parseAbiItem } from "viem";
export const ARC_TESTNET = "ARC-TESTNET";
export const ARC_TESTNET_CHAIN_ID = 5_042_002;
const EIP712_DOMAIN_FIELDS = [
    ["name", "string"],
    ["version", "string"],
    ["chainId", "uint256"],
    ["verifyingContract", "address"],
    ["salt", "bytes32"],
];
function address(value) {
    if (!/^0x[0-9a-f]{40}$/i.test(value))
        throw new Error("Expected a 20-byte EVM address");
    return value.toLowerCase();
}
function amount(value) {
    if (!/^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$/.test(value)) {
        throw new Error("USDC amount must be a non-negative decimal with at most six decimals");
    }
    if (Number(value) <= 0)
        throw new Error("USDC amount must be positive");
    return value;
}
function nativeAmount(valueWei) {
    if (!/^(0|[1-9][0-9]*)$/.test(valueWei))
        throw new Error("Contract value must be decimal wei");
    const wei = BigInt(valueWei);
    const unit = 10n ** 18n;
    const whole = wei / unit;
    const fraction = (wei % unit).toString().padStart(18, "0").replace(/0+$/, "");
    return fraction ? `${whole}.${fraction}` : whole.toString();
}
function parseJsonOutput(stdout) {
    const trimmed = stdout.trim();
    if (!trimmed)
        throw new Error("Circle CLI returned no output");
    try {
        return JSON.parse(trimmed);
    }
    catch {
        throw new Error("Circle CLI did not return JSON output");
    }
}
function circleTypedData(typedData) {
    if (!typedData || typeof typedData !== "object" || Array.isArray(typedData)) {
        throw new Error("EIP-712 typed data must be an object");
    }
    const input = typedData;
    const domain = input.domain;
    const types = input.types;
    if (!domain || typeof domain !== "object" || Array.isArray(domain)
        || !types || typeof types !== "object" || Array.isArray(types)) {
        throw new Error("EIP-712 typed data requires domain and types objects");
    }
    const domainRecord = domain;
    return {
        ...input,
        types: {
            EIP712Domain: EIP712_DOMAIN_FIELDS
                .filter(([name]) => domainRecord[name] !== undefined)
                .map(([name, type]) => ({ name, type })),
            ...types,
        },
    };
}
function readString(record, keys) {
    if (!record || typeof record !== "object")
        return undefined;
    const value = record;
    for (const key of keys) {
        if (typeof value[key] === "string" && value[key])
            return value[key];
    }
    for (const nested of [value.data, value.transaction, value.result]) {
        const found = readString(nested, keys);
        if (found)
            return found;
    }
    return undefined;
}
function records(value) {
    if (Array.isArray(value))
        return value.filter((item) => Boolean(item) && typeof item === "object");
    if (!value || typeof value !== "object")
        return [];
    const record = value;
    for (const key of ["transactions", "items", "data", "result"]) {
        const nested = records(record[key]);
        if (nested.length)
            return nested;
    }
    return [record];
}
export function normalizeCircleTransferResult(raw) {
    const hash = readString(raw, ["transactionHash", "txHash", "tx_hash", "hash"]);
    if (hash && !/^0x[0-9a-f]{64}$/i.test(hash))
        throw new Error("Circle returned an invalid transaction hash");
    return {
        transactionId: readString(raw, ["transactionId", "transaction_id", "id"]),
        transactionHash: hash?.toLowerCase(),
        state: readString(raw, ["state", "status"]),
        raw,
    };
}
export const runCommand = (command, args) => new Promise((resolve, reject) => {
    const child = spawn(command, [...args], {
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => (stdout += chunk));
    child.stderr.setEncoding("utf8").on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) => {
        if (code === 0)
            resolve({ stdout, stderr });
        else
            reject(new Error(`Circle CLI exited ${code}: ${stderr.trim() || "unknown error"}`));
    });
});
export class CircleArcWallet {
    walletAddress;
    command;
    runner;
    constructor(options) {
        this.walletAddress = address(options.walletAddress);
        this.command = options.command ?? "circle";
        this.runner = options.runner ?? runCommand;
    }
    async gatewayPayer() {
        const { stdout } = await this.runner(this.command, [
            "gateway",
            "balance",
            "--address",
            this.walletAddress,
            "--chain",
            ARC_TESTNET,
            "--output",
            "json",
        ]);
        const payer = readString(parseJsonOutput(stdout), ["backingEOA", "backingEoa", "backing_eoa"]);
        if (!payer)
            throw new Error("Circle Gateway did not return the agent wallet backing EOA");
        return address(payer);
    }
    reviewTransfer(plan) {
        if (plan.chainId !== ARC_TESTNET_CHAIN_ID)
            throw new Error("Only Arc Testnet is supported");
        const recipient = address(plan.recipient);
        const amountUsdc = amount(plan.amountUsdc);
        if (!plan.invoiceId.trim())
            throw new Error("invoiceId is required");
        if (!/^[A-Za-z0-9._:-]{8,128}$/.test(plan.idempotencyKey)) {
            throw new Error("Use an explicit stable idempotency key");
        }
        const command = [
            "wallet",
            "transfer",
            recipient,
            "--amount",
            amountUsdc,
            "--address",
            this.walletAddress,
            "--chain",
            ARC_TESTNET,
            "--idempotency-key",
            plan.idempotencyKey,
            "--output",
            "json",
        ];
        return {
            title: `Pay ${plan.invoiceId}`,
            summary: `Send ${amountUsdc} native USDC on Arc Testnet to ${recipient}`,
            command,
            chainId: plan.chainId,
            walletAddress: this.walletAddress,
            recipient,
            amountUsdc,
            invoiceId: plan.invoiceId,
        };
    }
    async transfer(plan, confirm) {
        const review = this.reviewTransfer(plan);
        if (!(await confirm(review)))
            throw new Error("Circle wallet transfer rejected by the reviewer");
        const { stdout } = await this.runner(this.command, review.command);
        return normalizeCircleTransferResult(parseJsonOutput(stdout));
    }
    reviewContractCall(plan) {
        if (plan.chainId !== ARC_TESTNET_CHAIN_ID)
            throw new Error("Only Arc Testnet is supported");
        const to = address(plan.to);
        if (!/^0x(?:[0-9a-f]{2})*$/i.test(plan.data))
            throw new Error("Contract calldata must be hex bytes");
        const executionAmount = nativeAmount(plan.value);
        if (!/^[A-Za-z0-9._:-]{8,128}$/.test(plan.idempotencyKey))
            throw new Error("Use an explicit stable idempotency key");
        const item = parseAbiItem(`function ${plan.abiFunctionSignature}`);
        const encoded = encodeFunctionData({ abi: [item], args: plan.abiParameters });
        if (encoded.toLowerCase() !== plan.data.toLowerCase())
            throw new Error("ABI parameters do not reproduce the exact Aomi calldata");
        const command = [
            "wallet", "execute", plan.abiFunctionSignature, ...plan.abiParameters,
            "--contract", to,
            "--address", this.walletAddress,
            "--chain", ARC_TESTNET,
            "--amount", executionAmount,
            "--idempotency-key", plan.idempotencyKey,
            "--output", "json",
        ];
        return {
            title: plan.label,
            summary: `Execute exact ${plan.data.slice(0, 10)} call on ${to} with ${executionAmount} native token (${plan.value} wei)`,
            command,
            chainId: plan.chainId,
            walletAddress: this.walletAddress,
            to,
            data: plan.data.toLowerCase(),
            value: plan.value,
        };
    }
    async executeContractCall(plan, confirm) {
        const review = this.reviewContractCall(plan);
        if (!(await confirm(review)))
            throw new Error("Circle contract execution rejected by the reviewer");
        const { stdout } = await this.runner(this.command, review.command);
        return normalizeCircleTransferResult(parseJsonOutput(stdout));
    }
    async transaction(transactionId, operation) {
        const args = [
            "transaction", "list",
            "--address", this.walletAddress,
            "--chain", ARC_TESTNET,
        ];
        if (operation)
            args.push("--operation", operation);
        args.push("--output", "json");
        const { stdout } = await this.runner(this.command, [
            ...args,
        ]);
        const found = records(parseJsonOutput(stdout)).find((item) => readString(item, ["transactionId", "transaction_id", "id"]) === transactionId);
        return found ? normalizeCircleTransferResult(found) : undefined;
    }
    async waitForConfirmation(transactionId, options = {}) {
        const timeoutMs = options.timeoutMs ?? 120_000;
        const pollIntervalMs = options.pollIntervalMs ?? 2_000;
        const sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
        const deadline = Date.now() + timeoutMs;
        while (Date.now() <= deadline) {
            const transaction = await this.transaction(transactionId);
            const state = transaction?.state?.toLowerCase();
            if (transaction && ["confirmed", "complete", "cleared"].includes(state ?? "")) {
                if (!transaction.transactionHash)
                    throw new Error("Circle marked the transfer complete without an Arc transaction hash");
                return transaction;
            }
            if (transaction && ["failed", "cancelled", "denied", "stuck"].includes(state ?? "")) {
                throw new Error(`Circle transfer ended in terminal state ${transaction.state}`);
            }
            await sleep(pollIntervalMs);
        }
        throw new Error("Timed out waiting for Circle to confirm the Arc transfer; retain the idempotency key and reconcile the existing transaction");
    }
    async signTypedData(typedData, confirm) {
        const primaryType = typedData?.primaryType;
        const title = primaryType === "TaskAuthorization"
            ? "Authorize this exact Aomi Task request"
            : primaryType === "TransferWithAuthorization"
                ? "Authorize the Aomi Task service payment"
                : "Authorize typed data";
        if (!(await confirm({ title, typedData, walletAddress: this.walletAddress }))) {
            throw new Error("Circle wallet signature rejected by the reviewer");
        }
        const { stdout } = await this.runner(this.command, [
            "wallet",
            "sign",
            "typed-data",
            JSON.stringify(circleTypedData(typedData), (_, value) => (typeof value === "bigint" ? value.toString() : value)),
            "--address",
            this.walletAddress,
            "--chain",
            ARC_TESTNET,
            "--quiet",
        ]);
        const signature = stdout.trim();
        if (!/^0x(?:[0-9a-f]{2})+$/i.test(signature) || signature.length < 132 || signature.length > 32_770)
            throw new Error("Circle returned an invalid EIP-712 signature");
        return signature.toLowerCase();
    }
}
export async function verifyArcReceipt(transactionHash, rpcUrl, fetchImpl = fetch) {
    if (!/^0x[0-9a-f]{64}$/i.test(transactionHash))
        throw new Error("Invalid Arc transaction hash");
    if (!rpcUrl.startsWith("https://") && !rpcUrl.startsWith("http://127.0.0.1:") && !rpcUrl.startsWith("http://localhost:")) {
        throw new Error("Arc RPC must use HTTPS (loopback HTTP is allowed)");
    }
    const response = await fetchImpl(rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getTransactionReceipt", params: [transactionHash] }),
        signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok)
        throw new Error(`Arc RPC returned ${response.status}`);
    const body = await response.json();
    if (body.error || !body.result)
        throw new Error("Arc receipt is not confirmed yet");
    const hash = readString(body.result, ["transactionHash"]);
    const blockNumber = readString(body.result, ["blockNumber"]);
    const status = readString(body.result, ["status"]);
    if (hash?.toLowerCase() !== transactionHash.toLowerCase() || !/^0x[0-9a-f]+$/i.test(blockNumber ?? "") || status !== "0x1") {
        throw new Error("Arc receipt did not prove a successful transaction");
    }
    const rawLogs = body.result.logs;
    if (rawLogs !== undefined && (!Array.isArray(rawLogs) || !rawLogs.every((log) => Boolean(log) && typeof log === "object" && !Array.isArray(log)))) {
        throw new Error("Arc receipt contains malformed logs");
    }
    return {
        transactionHash: hash.toLowerCase(),
        blockNumber: blockNumber,
        status: "0x1",
        logs: rawLogs ?? [],
    };
}
export async function verifyArcTransferReceipt(transactionHash, rpcUrl, expected, fetchImpl = fetch) {
    const receipt = await verifyArcReceipt(transactionHash, rpcUrl, fetchImpl);
    const from = address(expected.from);
    const to = address(expected.to);
    if (!/^(0|[1-9][0-9]*)$/.test(expected.valueWei))
        throw new Error("Expected transfer value must be decimal wei");
    const value = `0x${BigInt(expected.valueWei).toString(16)}`;
    const response = await fetchImpl(rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "eth_getTransactionByHash", params: [transactionHash] }),
        signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok)
        throw new Error(`Arc RPC returned ${response.status}`);
    const body = await response.json();
    if (body.error || !body.result)
        throw new Error("Arc transaction is not available");
    const actualHash = readString(body.result, ["hash"]);
    const actualFrom = readString(body.result, ["from"]);
    const actualTo = readString(body.result, ["to"]);
    const actualValue = readString(body.result, ["value"]);
    const input = readString(body.result, ["input"]);
    if (actualHash?.toLowerCase() !== receipt.transactionHash ||
        actualFrom?.toLowerCase() !== from ||
        actualTo?.toLowerCase() !== to ||
        actualValue?.toLowerCase() !== value ||
        input !== "0x") {
        throw new Error("Arc transaction does not match the reviewed native transfer");
    }
    return { ...receipt, from, to, value, input: "0x" };
}
export async function verifyArcCallReceipt(transactionHash, rpcUrl, fetchImpl = fetch) {
    return verifyArcReceipt(transactionHash, rpcUrl, fetchImpl);
}
