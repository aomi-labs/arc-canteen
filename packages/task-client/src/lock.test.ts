import assert from "node:assert/strict";
import { type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdtemp, mkdir, rm, symlink, writeFile, link, lstat, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { withStateLock } from "./lock.ts";
import { lockProcess } from "../test/lock-process.ts";


async function stop(child: ChildProcessWithoutNullStreams, exited: Promise<unknown[]>) {
  child.kill("SIGKILL");
  await exited;
}

for (const name of ["lock", "execution-lock"]) {
  test(`${name}: normal release, exception and orphan inode reuse`, async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "task-lock-"));
    try {
      assert.equal(await withStateLock(directory, name, async () => 42), 42);
      const before = await lstat(path.join(directory, name));
      await assert.rejects(withStateLock(directory, name, async () => { throw new Error("operation failed"); }), /operation failed/);
      await withStateLock(directory, name, async () => {});
      assert.equal((await lstat(path.join(directory, name))).ino, before.ino);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  test(`${name}: real process termination releases ownership; active lock cannot be stolen`, async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "task-lock-crash-"));
    const owner = await lockProcess(directory, name);
    try {
      assert.equal(owner.output, "acquired");
      await assert.rejects(withStateLock(directory, name, async () => assert.fail("stolen active lock")), /State is locked/);
      const competitor = await lockProcess(directory, name);
      assert.equal(competitor.output, "refused");
      await competitor.exited;
      await stop(owner.child, owner.exited);
      await withStateLock(directory, name, async () => {});
    } finally {
      if (owner.child.exitCode === null && owner.child.signalCode === null) await stop(owner.child, owner.exited);
      await rm(directory, { recursive: true, force: true });
    }
  });
}

test("simultaneous processes cannot both acquire a crash-released lock", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "task-lock-race-"));
  const seed = await lockProcess(directory);
  await stop(seed.child, seed.exited);
  const contenders = await Promise.all([lockProcess(directory), lockProcess(directory), lockProcess(directory)]);
  try {
    assert.equal(contenders.filter((item) => item.output === "acquired").length, 1);
    assert.equal(contenders.filter((item) => item.output === "refused").length, 2);
  } finally {
    await Promise.all(contenders.map(async ({ child, exited }) => {
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
      await exited;
    }));
    await rm(directory, { recursive: true, force: true });
  }
});

test("refuses ambiguous legacy directories, symlinks, public files and hard links without cleanup", async () => {
  for (const kind of ["legacy", "symlink", "public", "hardlink"]) {
    const directory = await mkdtemp(path.join(os.tmpdir(), "task-lock-unsafe-"));
    const lock = path.join(directory, "lock");
    try {
      if (kind === "legacy") await mkdir(lock, { mode: 0o700 });
      else {
        await writeFile(path.join(directory, "target"), "retain this", { mode: 0o600 });
        if (kind === "symlink") await symlink("target", lock);
        else if (kind === "hardlink") await link(path.join(directory, "target"), lock);
        else await writeFile(lock, "ambiguous", { mode: 0o644 });
      }
      const before = await lstat(lock);
      await assert.rejects(withStateLock(directory, "lock", async () => assert.fail("unsafe takeover")));
      assert.equal((await lstat(lock)).ino, before.ino);
      if (kind !== "legacy") assert.equal(await readFile(path.join(directory, "target"), "utf8"), "retain this");
    } finally { await rm(directory, { recursive: true, force: true }); }
  }
});
