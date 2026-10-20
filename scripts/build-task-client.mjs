import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const walletSource = path.join(root, "packages/circle-arc-wallet/src/index.ts");
const options = {
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  packages: "external",
  alias: { "@arc-canteen/circle-arc-wallet": walletSource },
};

await build({ ...options, entryPoints: [walletSource],
  outfile: path.join(root, "packages/circle-arc-wallet/dist/index.js") });
await build({ ...options,
  entryPoints: {
    index: path.join(root, "packages/task-client/src/index.ts"),
    "two-stage": path.join(root, "packages/task-client/src/two-stage.ts"),
  },
  outdir: path.join(root, "packages/task-client/dist"),
});
