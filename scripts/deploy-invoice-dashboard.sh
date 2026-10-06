#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
source_commit="$(git -C "$repo_root" rev-parse HEAD)"
deploy_dir="$(mktemp -d /tmp/arc-invoice-agent.XXXXXX)"

cleanup() {
  case "$deploy_dir" in
    /tmp/arc-invoice-agent.*) rm -rf -- "$deploy_dir" ;;
  esac
}
trap cleanup EXIT

git -C "$repo_root" archive "$source_commit" | tar -x -C "$deploy_dir"
cp "$deploy_dir/vercel.invoice-dashboard.json" "$deploy_dir/vercel.json"

vercel deploy "$deploy_dir" \
  --prod \
  --yes \
  --scope aomi-labs \
  --project arc-invoice-agent \
  --meta "sourceCommit=$source_commit"
