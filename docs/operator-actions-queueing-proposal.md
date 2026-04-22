# Proposal: Queue Operator Actions for Strict Serial Execution

## 1) Problem Statement

Operators frequently need to run multiple actions in a known order. Triggering actions one-by-one is slow and error-prone, and users can lose context while waiting between steps.

This proposal introduces a queue so users can select several supported operator actions once, then let the system execute them automatically in series.

## 2) Scope

Only the following action types are queueable:

- `sanitizer`
- `on-board analysis`
- `simulation analysis`
- `ut test`
- `dump tensor`

All other actions are out of scope and must be rejected by queue APIs/UI.

## 3) Product Goals

- Enable batch submission of the supported actions.
- Guarantee strict serial execution (never parallel).
- Show all in-queue items as `currently executed` in Operator View.
- Allow per-item cancellation from Operator Actions via the `Stop` icon.
- Keep behavior deterministic and testable under failures and stop timeouts.

## 4) Non-Goals

- Parallel execution.
- Queueing unsupported action types.
- Cross-project or global queues.
- Durable queue persistence across reload/restart (v1 uses in-memory queue only).

## 5) Definitions

- **Queue item**: one requested action instance with a unique id.
- **Active item**: queue item currently running.
- **Queued item**: queue item accepted but not started.
- **Cancellable item**: item that can receive `Stop` (`queued`, `running`, or `cancel_failed` while process is alive).
- **Terminal state**: `success`, `failed`, `cancelled`.

## 6) Functional Requirements (Normative)

### 6.1 Queue Ownership

- Queue scope is **per operator within current workspace/project**.
- Different operators maintain independent queues.
- Switching visible operator/project context must not migrate, merge, or reorder existing queues.

### 6.2 Queue Creation and Append

- Users may enqueue one or many supported actions in one request.
- Submitted order must be preserved (FIFO).
- If no active item exists, queue processing starts immediately.
- If an active item exists, new items are appended to tail and wait.
- At most one non-terminal item per `actionType` is allowed in the same operator queue.
- A new item is considered duplicate and must be rejected when an item with the same `actionType` already exists in `queued`, `running`, or `cancel_failed` (while process alive).
- Duplicate validation applies both:
  - within the incoming enqueue request payload, and
  - against already existing non-terminal items in the target operator queue.

### 6.3 Execution Model

- Exactly one item may run at a time per operator queue.
- Next item starts only after current item reaches terminal state.
- Failure of one item does not block subsequent queued items.
- No automatic retries in this proposal.

### 6.4 Required Operator View Behavior

- Every item currently in queue (active + waiting) must display status text `currently executed`.
- Active item must also display a running indicator.
- Waiting items must display a waiting indicator (label text may be `queued`).
- Every cancellable item must show a `Stop` icon.

### 6.5 Stop Behavior

- **Stop on waiting item (`queued`)**:
  - Remove item from queue immediately.
  - Mark item `cancelled`.
  - Item must never be executed afterward.

- **Stop on active item (`running`)**:
  - Send cancel request to executor.
  - On confirmed cancellation, mark `cancelled`.
  - Scheduler immediately starts next queued item (if any).

### 6.6 Stop Timeout and Escalation

- Running cancellation has timeout (default `10s`; implementation may make it configurable).
- If cancellation is not confirmed before timeout:
  - Set state to `cancel_failed` (or `running` + equivalent flag if state enum cannot change).
  - Show user error notification that stop did not complete.
  - Keep `Stop` available for retry while process is alive.
  - Do not start next item while current process is still alive.
- When process finally exits:
  - If executor confirms cancellation -> final state `cancelled`.
  - Otherwise -> final state `failed` (or existing equivalent non-success terminal state).
  - Then scheduler may continue with next queued item.

### 6.7 Reload/Restart Behavior

- Queue is in-memory for v1.
- On extension/window reload, all queues are cleared.
- Cleared items are not resumed automatically.

## 7) State Machine

Implementation-facing states:

- `queued`
- `running`
- `cancel_failed` (non-terminal only while process alive)
- `success`
- `failed`
- `cancelled`

Allowed transitions:

- `queued` -> `running`
- `queued` -> `cancelled` (stop before start)
- `running` -> `success` | `failed` | `cancelled` | `cancel_failed`
- `cancel_failed` -> `cancelled` | `failed` (on eventual process exit)

Scheduler rule:

- Advance queue only when current item is in terminal state (`success`, `failed`, `cancelled`).

## 8) API Contract (High-Level)

Required capabilities:

- Enqueue ordered list of queueable actions.
- Query/subscribe queue item list for Operator View rendering.
- Cancel queue item by `id`.

Recommended queue item fields:

- `id`
- `operatorId`
- `actionType`
- `internalState`
- `displayStatus`
- `position`
- `isProcessAlive`
- `createdAt`
- `startedAt`
- `finishedAt`
- `lastError` (optional)

Validation:

- Reject unsupported action type with explicit error.
- Preserve accepted request order.
- Reject duplicate `actionType` according to the one-per-type rule and return explicit per-item rejection reason.

## 9) Observability

Event logs:

- `queue_enqueued`
- `queue_started`
- `queue_completed`
- `queue_failed`
- `queue_cancel_requested`
- `queue_cancelled`
- `queue_cancel_timeout`
- `queue_cancel_failed`
- `queue_dequeued`

Metrics:

- queue depth
- wait time before start
- execution duration by action type
- cancellation request count
- cancellation success rate
- cancel-timeout count

## 10) Acceptance Criteria

- **AC-01** User can enqueue any combination of the 5 supported actions in one request.
- **AC-02** Execution is strictly serial; no runtime overlap between items in the same operator queue.
- **AC-03** Enqueue during active run appends to queue tail and does not start immediately.
- **AC-04** All active and waiting items display `currently executed` in Operator View.
- **AC-05** Active item shows running indicator; waiting items show waiting indicator.
- **AC-06** Every cancellable item shows `Stop`.
- **AC-07** Stop on waiting item removes it immediately and it never executes.
- **AC-08** Stop on active item cancels it (when confirmed) and immediately advances queue.
- **AC-09** On cancel timeout, item becomes `cancel_failed` (or equivalent flag), user is notified, and queue does not advance while process is alive.
- **AC-10** On eventual exit after cancel timeout, item ends as `cancelled` (if cancel confirmed) or `failed`, then queue continues.
- **AC-11** Queue isolation is per operator within current project; switching context does not merge/migrate queues.
- **AC-12** Reload/restart clears in-memory queue and does not auto-resume.
- **AC-13** One-per-type rule is enforced: no operator queue can contain more than one non-terminal item for the same `actionType`.
- **AC-14** Unsupported actions are rejected from queueing.
- **AC-15** FIFO order is preserved for all non-cancelled items.

## 11) Verification Matrix

- Submit all 5 supported actions and verify strict FIFO execution.
- Submit duplicate action types in one request and verify later duplicates are rejected with explicit reason.
- With a type already queued/running, submit same type again and verify rejection with explicit reason.
- While one item is running, enqueue more and verify append-only behavior.
- Stop a waiting item and verify immediate dequeue + no execution.
- Stop a running item and verify cancellation + immediate advancement.
- Force cancel-timeout path and verify `cancel_failed`, retryable `Stop`, and blocked advancement while alive.
- Verify final transition from `cancel_failed` on eventual process exit.
- Switch operator/project context and verify queue isolation.
- Reload extension/window and verify queue clear + no auto-resume.
- Attempt unsupported action enqueue and verify validation error.

