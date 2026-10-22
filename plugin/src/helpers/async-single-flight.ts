/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
/**
 * Coalesces concurrent async work into one shared promise (single-flight).
 * Callers pass one lambda: `flight.run(() => work())`.
 */
export class AsyncSingleFlight<T = void> {
  private inFlight?: Promise<T>;

  run(task: ()=> Promise<T>): Promise<T> {
    if (!this.inFlight) {
      this.inFlight = task()
        .finally(() => {
          this.inFlight = undefined;
        });
    }

    return this.inFlight;
  }

  get pending(): Promise<T> | undefined {
    return this.inFlight;
  }

  /** @internal */
  reset(): void {
    this.inFlight = undefined;
  }
}
