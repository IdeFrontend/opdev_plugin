---
title: 'Add Performance Results refresh action'
type: 'bugfix'
created: '2026-07-17'
status: 'done'
route: 'one-shot'
---

# Add Performance Results refresh action

## Intent

**Problem:** Performance Results could already reload reports from disk, but users had no visible control to trigger that refresh after artifacts were changed or deleted externally.

**Approach:** Expose the existing refresh command in the Performance Results title bar with the native refresh icon, document the action, and lock the manifest contract with a focused regression test.

## Suggested Review Order

**Visible refresh action**

- Bind the existing disk-rescan command to the Performance Results title bar.
  [`package.json:1493`](../../package.json#L1493)

- Reuse the localized command with VS Code's native refresh icon.
  [`package.json:681`](../../package.json#L681)

**Supporting contract**

- Keep the documented title actions aligned with the extension manifest.
  [`performance.md:256`](../../docs/performance.md#L256)

- Lock the command icon, target view, and title-bar ordering.
  [`performance-results-refresh-contribution.spec.ts:27`](../../plugin/src/__tests__/unit/performance-results-refresh-contribution.spec.ts#L27)
