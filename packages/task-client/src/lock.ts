import { constants } from "node:fs";
import { lstat, mkdir, open } from "node:fs/promises";
import path from "node:path";
import fsExt from "fs-ext";

/** Local POSIX advisory lock. Keep its inode forever: unlinking it permits two owners. */
export async function withStateLock<T>(directory: string, name: string, operation: () => Promise<T>): Promise<T> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const info = await lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o077) !== 0) {
    throw new Error("State directory must be private (0700) and not a symlink");
  }
  const file = path.join(directory, name);
  // O_NOFOLLOW/O_NONBLOCK refuse symlinks and avoid blocking on an ambiguous FIFO.
  // Legacy directory locks deliberately fail closed: their active owner is unknowable.
  const handle = await open(file, constants.O_RDWR | constants.O_CREAT | constants.O_NOFOLLOW | constants.O_NONBLOCK, 0o600);
  try {
    const owner = await handle.stat();
    if (!owner.isFile() || owner.nlink !== 1 || (owner.mode & 0o077) !== 0) {
      throw new Error("Lock must be a private regular file with one link; do not delete an ambiguous lock");
    }
    await new Promise<void>((resolve, reject) => {
      fsExt.flock(handle.fd, "exnb", (error) => {
        if (error) reject(new Error("State is locked or locking is unsupported; retain journals and retry after its owner exits", { cause: error }));
        else resolve();
      });
    });
    const current = await lstat(file);
    if (current.dev !== owner.dev || current.ino !== owner.ino || current.isSymbolicLink()) {
      throw new Error("Lock path changed during acquisition; refuse unsafe ownership");
    }
    return await operation();
  } finally {
    // Closing (including SIGKILL/process exit) releases the kernel lock. No PID,
    // timestamps, stale takeover, owner metadata, or payment journal changes.
    await handle.close();
  }
}
