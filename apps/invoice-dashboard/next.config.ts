import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@arc-canteen/circle-arc-wallet", "@arc-canteen/invoice-workflow"],
};

export default config;
