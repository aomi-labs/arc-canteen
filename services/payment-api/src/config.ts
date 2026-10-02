import {
  ARC_TESTNET_USDC,
  isHexAddress,
  type ArcChain,
  type HexAddress,
} from "@arc-canteen/payment-core";

export type ServiceConfig = {
  host: string;
  port: number;
  bearerToken: string;
  databaseUrl?: string;
  circleWallet: HexAddress;
  circleCliHome?: string;
  circleCliBin?: string;
  chain: ArcChain;
  usdcToken: HexAddress;
  maxAmountUsdcMicros: bigint;
  arcscanBaseUrl: string;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServiceConfig {
  const bearerToken =
    env.PAYMENT_API_BEARER_TOKEN ?? env.ARC_PAYMENT_API_BEARER_TOKEN;
  if (!bearerToken) {
    throw new Error(
      "PAYMENT_API_BEARER_TOKEN or ARC_PAYMENT_API_BEARER_TOKEN is required",
    );
  }

  const wallet = env.CIRCLE_WALLET_ADDRESS;
  if (!wallet || !isHexAddress(wallet)) {
    throw new Error("CIRCLE_WALLET_ADDRESS must be a 20-byte hex address");
  }

  const chain = (env.ARC_CHAIN ?? "ARC-TESTNET") as ArcChain;
  if (chain !== "ARC-TESTNET" && chain !== "ARC") {
    throw new Error("ARC_CHAIN must be ARC-TESTNET or ARC");
  }

  const token = env.ARC_TESTNET_USDC ?? ARC_TESTNET_USDC;
  if (!isHexAddress(token)) {
    throw new Error("ARC_TESTNET_USDC must be a 20-byte hex address");
  }

  const maxAmountUsdcMicros = BigInt(env.MAX_AMOUNT_USDC_MICROS ?? "10000000");
  if (maxAmountUsdcMicros <= 0n) {
    throw new Error("MAX_AMOUNT_USDC_MICROS must be positive");
  }

  return {
    host: env.HOST ?? "0.0.0.0",
    port: Number(env.PORT ?? 10000),
    bearerToken,
    databaseUrl: env.DATABASE_URL,
    circleWallet: wallet,
    circleCliHome: env.CIRCLE_CLI_HOME,
    circleCliBin: env.CIRCLE_CLI_BIN,
    chain,
    usdcToken: token,
    maxAmountUsdcMicros,
    arcscanBaseUrl: (env.ARCSCAN_BASE_URL ?? "https://testnet.arcscan.app").replace(
      /\/$/,
      "",
    ),
  };
}

export function arcscanUrl(baseUrl: string, txHash: string) {
  return `${baseUrl}/tx/${txHash}`;
}
