import { withStateLock } from "../src/lock.ts";
try {
  await withStateLock(process.argv[2], process.argv[3], async () => {
    process.stdout.write("acquired\n");
    await new Promise<void>((resolve) => {
      process.stdin.resume();
      process.stdin.once("end", resolve);
    });
  });
} catch {
  process.stdout.write("refused\n");
  process.exitCode = 2;
}
