/** Spawn env for Triton msSanitizer runs (Phase 1: all required vars always enabled). */
export const TRITON_SANITIZER_SPAWN_ENV: Readonly<Record<string, string>> = {
  TRITON_ENABLE_SANITIZER: '1',
  TRITON_ALWAYS_COMPILE: '1',
  PYTORCH_NO_NPU_MEMORY_CACHING: '1',
};
