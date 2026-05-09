function delay(ms: number): Promise<void> {
  if (!Number.isFinite(ms) || ms <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizePositiveInt(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value) || Number(value) <= 0) {
    return fallback;
  }
  return Math.max(1, Math.floor(Number(value)));
}

export interface WorkerPoolTaskOptions {
  timeoutMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  shouldRetry?: (error: unknown, attempt: number, maxAttempts: number) => boolean;
}

export interface WorkerPoolTaskSuccess<T> {
  value: T;
  attempts: number;
  latencyMs: number;
}

export class WorkerPoolTimeoutError extends Error {
  constructor(public readonly timeoutMs: number) {
    super(`worker task timeout after ${timeoutMs}ms`);
  }
}

export class WorkerPoolTaskExecutionError extends Error {
  constructor(
    message: string,
    public readonly causeError: unknown,
    public readonly attempts: number,
    public readonly latencyMs: number,
    public readonly timedOut: boolean,
  ) {
    super(message);
  }
}

export interface WorkerPoolStats {
  poolSize: number;
  activeWorkers: number;
  queuedTasks: number;
  peakQueueSize: number;
  submittedTasks: number;
  completedTasks: number;
}

export class AsyncExecutionWorkerPool {
  private readonly poolSize: number;
  private activeWorkers = 0;
  private readonly queue: Array<() => void> = [];
  private peakQueueSize = 0;
  private submittedTasks = 0;
  private completedTasks = 0;

  constructor(poolSize: number) {
    this.poolSize = normalizePositiveInt(poolSize, 1);
  }

  async execute<T>(
    task: () => Promise<T> | T,
    options: WorkerPoolTaskOptions = {},
  ): Promise<WorkerPoolTaskSuccess<T>> {
    this.submittedTasks += 1;
    await this.acquireSlot();
    try {
      const result = await this.executeWithRetry(task, options);
      this.completedTasks += 1;
      return result;
    } finally {
      this.releaseSlot();
    }
  }

  getStats(): WorkerPoolStats {
    return {
      poolSize: this.poolSize,
      activeWorkers: this.activeWorkers,
      queuedTasks: this.queue.length,
      peakQueueSize: this.peakQueueSize,
      submittedTasks: this.submittedTasks,
      completedTasks: this.completedTasks,
    };
  }

  private acquireSlot(): Promise<void> {
    if (this.activeWorkers < this.poolSize) {
      this.activeWorkers += 1;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.queue.push(() => {
        this.activeWorkers += 1;
        resolve();
      });
      this.peakQueueSize = Math.max(this.peakQueueSize, this.queue.length);
    });
  }

  private releaseSlot(): void {
    this.activeWorkers = Math.max(0, this.activeWorkers - 1);
    const next = this.queue.shift();
    if (next) {
      next();
    }
  }

  private async executeWithRetry<T>(
    task: () => Promise<T> | T,
    options: WorkerPoolTaskOptions,
  ): Promise<WorkerPoolTaskSuccess<T>> {
    const timeoutMs = Number.isFinite(options.timeoutMs) ? Number(options.timeoutMs) : 0;
    const maxRetries = normalizePositiveInt((options.maxRetries ?? 0) + 1, 1);
    const retryDelayMs = Number.isFinite(options.retryDelayMs) ? Number(options.retryDelayMs) : 0;
    const startedAt = Date.now();

    let attempt = 0;
    while (attempt < maxRetries) {
      attempt += 1;
      try {
        const value = await this.runSingleTask(task, timeoutMs);
        return {
          value,
          attempts: attempt,
          latencyMs: Date.now() - startedAt,
        };
      } catch (reason) {
        const timedOut = reason instanceof WorkerPoolTimeoutError;
        const canRetry = attempt < maxRetries && (
          typeof options.shouldRetry === "function"
            ? options.shouldRetry(reason, attempt, maxRetries)
            : true
        );
        if (!canRetry) {
          throw new WorkerPoolTaskExecutionError(
            reason instanceof Error ? reason.message : String(reason),
            reason,
            attempt,
            Date.now() - startedAt,
            timedOut,
          );
        }
        await delay(retryDelayMs);
      }
    }

    throw new WorkerPoolTaskExecutionError(
      "worker task failed after retries",
      new Error("unknown worker failure"),
      maxRetries,
      Date.now() - startedAt,
      false,
    );
  }

  private async runSingleTask<T>(task: () => Promise<T> | T, timeoutMs: number): Promise<T> {
    const taskPromise = Promise.resolve().then(() => task());
    if (!timeoutMs || timeoutMs <= 0) {
      return taskPromise;
    }
    let timer: ReturnType<typeof setTimeout> | null = null;
    try {
      return await Promise.race([
        taskPromise,
        new Promise<T>((_, reject) => {
          timer = setTimeout(() => reject(new WorkerPoolTimeoutError(timeoutMs)), timeoutMs);
        }),
      ]);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }
}
