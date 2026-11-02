# Performance hints manual test packs

Opdev host parity for IdeFrontend/profiling-report#177 (`Summary.jsonl` `PerformanceHints` → Problems).

## Files

| File | Profile | What to check |
|------|---------|---------------|
| `compute-performance-hints.npu-rep` | compute (Summary.jsonl) | Aside **Performance analysis** / 性能分析 → Problems shows 3 Kernel diagnostics; Source Line / Instruction Address = **Not specified** |
| `multi-op-performance-hints.npu-rep` | compute nested | Default = opA (3 hints, includes `manual_test_op`); select opB → 2 hints containing `op_b only` |
| `../../profiling-report/data/gelu.npu-rep` | emulate (Hint* CSVs) | Regression: 53 joined hints still publish to Problems |

## Expected compute messages (`compute-performance-hints.npu-rep`)

- Inspect the Vector instruction sequence, redundant compute, conversions, and reductions.
- Average bytes per copy instruction is under 16 KiB. Check whether adjacent copies can merge.
- manual_test_op: scalar pipe busy — inspect address math and loop-invariant code.
