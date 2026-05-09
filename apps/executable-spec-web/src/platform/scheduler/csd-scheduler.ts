export type CSDTaskStatus = "ready" | "blocked" | "running" | "pass" | "fail" | "failed";
export type NormalizedTaskStatus = "ready" | "blocked" | "running" | "pass" | "failed";

export interface CSDSchedulerInput {
  container: {
    id: string;
    geo?: Record<string, unknown>;
  };
  tasks: Array<{
    spuId: string;
    status: CSDTaskStatus;
  }>;
  normRef: {
    order: string[];
  };
}

export interface SchedulerContainerInput {
  containerId: string;
  tasks: Array<{
    spuId: string;
    status: CSDTaskStatus;
  }>;
  normRef?: {
    order: string[];
  };
}

export type SchedulerAction = "EXECUTE" | "RETRY_FAILED" | "WAIT" | "ARCHIVE_READY";

export interface SchedulerDecisionDetail {
  spuId: string;
  status: NormalizedTaskStatus;
  blockedBy?: string;
  explain: string;
}

export interface SchedulerDecision {
  action: SchedulerAction;
  summary: string;
  nextTask: string | null;
  details: SchedulerDecisionDetail[];
  reason: string;
  blockedBy: string[] | null;
  parallelTasks?: string[];
  risk_score?: number | null;
  cost_score?: number | null;
}

export interface CSDNextExecutableTask {
  spuId: string;
  reason: string;
}

export interface CSDNextExecutableTaskResult {
  nextTasks: CSDNextExecutableTask[];
  decision: SchedulerDecision;
}

export interface SchedulerExplainMessages {
  summaryArchiveReady: string;
  summaryExecutable: string;
  summaryFailed: string;
  summaryBlocked: string;
  summaryRunning: string;
  summaryNoTask: string;
  reasonArchiveReady: string;
  reasonExecutable: string;
  reasonFailed: string;
  reasonBlocked: string;
  reasonRunning: string;
  reasonNoTask: string;
  explainPass: (taskLabel: string) => string;
  explainReady: (taskLabel: string) => string;
  explainBlocked: (taskLabel: string, blockerLabel: string) => string;
  explainFailed: (taskLabel: string) => string;
  explainRunning: (taskLabel: string) => string;
}

export interface SchedulerExplainOptions {
  parallel?: boolean;
  messages?: SchedulerExplainMessages;
  taskLabelResolver?: (spuId: string) => string;
}

export type ProjectContainerStatus = "running" | "ready" | "blocked" | "pass";
type NormalizedProjectContainerStatus = ProjectContainerStatus;

export interface ProjectSchedulerContainerInput extends SchedulerContainerInput {
  status?: ProjectContainerStatus;
}

export interface ProjectSchedulerInput {
  containers: ProjectSchedulerContainerInput[];
}

export interface ProjectContainerDetail {
  containerId: string;
  stationValue: number;
  orderIndex: number;
  selected: boolean;
  status: NormalizedProjectContainerStatus;
  summary: string;
  reason: string;
  nextTask: string | null;
  action: SchedulerAction;
}

export type ProjectAction = "PROJECT_EXECUTE" | "PROJECT_WAIT" | "PROJECT_BLOCKED" | "PROJECT_COMPLETE";

export interface ProjectScheduleDecision {
  action: ProjectAction;
  nextContainer: string | null;
  nextTask: string | null;
  summary: string;
  reason: string;
  containerDetails: ProjectContainerDetail[];
  taskDetails: SchedulerDecisionDetail[];
  blockedByContainer?: string;
}

export interface ProjectScheduleMessages {
  summaryProjectComplete: string;
  summaryProjectBlocked: string;
  summaryProjectWait: string;
  summaryProjectExecute: (containerId: string, taskLabel: string) => string;
  reasonProjectComplete: string;
  reasonProjectBlocked: string;
  reasonProjectWaitRunning: (containerId: string) => string;
  reasonProjectExecute: string;
}

export interface ProjectScheduleOptions extends SchedulerExplainOptions {
  projectMessages?: ProjectScheduleMessages;
  containerLabelResolver?: (containerId: string) => string;
}

const DEFAULT_MESSAGES_ZH: SchedulerExplainMessages = {
  summaryArchiveReady: "全部规范已完成，可归档",
  summaryExecutable: "存在可执行工序",
  summaryFailed: "存在未通过项，需要整改",
  summaryBlocked: "存在阻塞任务",
  summaryRunning: "存在执行中任务",
  summaryNoTask: "无可执行项",
  reasonArchiveReady: "全部规范已完成，可归档",
  reasonExecutable: "满足执行条件，可开始检测",
  reasonFailed: "检测未通过，需要整改后重新执行",
  reasonBlocked: "存在前序阻塞",
  reasonRunning: "已有任务执行中，需等待完成",
  reasonNoTask: "无可执行项",
  explainPass: (taskLabel: string) => `${taskLabel}检测已完成`,
  explainReady: () => "满足执行条件，可开始检测",
  explainBlocked: (_taskLabel: string, blockerLabel: string) => `需等待${blockerLabel}检测完成`,
  explainFailed: () => "检测未通过，需要整改后重新执行",
  explainRunning: () => "正在执行中",
};

const DEFAULT_PROJECT_MESSAGES_ZH: ProjectScheduleMessages = {
  summaryProjectComplete: "全部施工完成",
  summaryProjectBlocked: "施工受阻",
  summaryProjectWait: "存在执行中容器",
  summaryProjectExecute: (containerId: string, taskLabel: string) => `推荐执行 ${containerId} ${taskLabel}工序`,
  reasonProjectComplete: "全部容器均已达到可归档状态",
  reasonProjectBlocked: "前序容器未完成",
  reasonProjectWaitRunning: (containerId: string) => `${containerId} 正在施工中，请先完成当前容器`,
  reasonProjectExecute: "当前容器已完成，选择下一个可执行容器",
};

function normalizeTaskStatus(status: CSDTaskStatus): NormalizedTaskStatus {
  if (status === "fail" || status === "failed") {
    return "failed";
  }
  return status;
}

function normalizeContainerStatus(status: string | null | undefined): NormalizedProjectContainerStatus {
  const value = String(status ?? "").trim().toLowerCase();
  if (value === "running") {
    return "running";
  }
  if (value === "ready") {
    return "ready";
  }
  if (value === "blocked") {
    return "blocked";
  }
  return "pass";
}

export function parseStation(containerId: string): number {
  const text = String(containerId ?? "").trim().toUpperCase();
  const matched = /^K(\d+)\+(\d+)$/.exec(text);
  if (matched) {
    return Number(matched[1]) * 1000 + Number(matched[2]);
  }
  const digits = text.replace(/[^0-9]/g, "");
  return digits ? Number(digits) : Number.MAX_SAFE_INTEGER;
}

function resolveOrder(input: SchedulerContainerInput): string[] {
  const explicitOrder = input.normRef?.order?.filter((item) => String(item).trim().length > 0) ?? [];
  if (explicitOrder.length > 0) {
    return [...explicitOrder];
  }
  return input.tasks.map((task) => task.spuId);
}

function buildStatusBySpuId(input: SchedulerContainerInput): Record<string, NormalizedTaskStatus | undefined> {
  return Object.fromEntries(
    input.tasks.map((task) => [task.spuId, normalizeTaskStatus(task.status)]),
  );
}

function dependenciesNotPassed(
  order: string[],
  statusBySpuId: Record<string, NormalizedTaskStatus | undefined>,
  spuId: string,
): string[] {
  const targetIndex = order.indexOf(spuId);
  if (targetIndex <= 0) {
    return [];
  }
  const blockers: string[] = [];
  for (let index = 0; index < targetIndex; index += 1) {
    const dependencySpuId = order[index];
    if (statusBySpuId[dependencySpuId] !== "pass") {
      blockers.push(dependencySpuId);
    }
  }
  return blockers;
}

function firstReadyCandidate(
  order: string[],
  statusBySpuId: Record<string, NormalizedTaskStatus | undefined>,
): string | null {
  for (const spuId of order) {
    if (statusBySpuId[spuId] !== "ready") {
      continue;
    }
    if (dependenciesNotPassed(order, statusBySpuId, spuId).length === 0) {
      return spuId;
    }
  }
  return null;
}

function buildDecisionDetails(
  order: string[],
  statusBySpuId: Record<string, NormalizedTaskStatus | undefined>,
  taskLabelResolver: (spuId: string) => string,
  messages: SchedulerExplainMessages,
): SchedulerDecisionDetail[] {
  return order.map((spuId) => {
    const status = statusBySpuId[spuId] ?? "blocked";
    const blockers = dependenciesNotPassed(order, statusBySpuId, spuId);
    const taskLabel = taskLabelResolver(spuId);

    if (status === "pass") {
      return {
        spuId,
        status,
        explain: messages.explainPass(taskLabel),
      };
    }
    if (status === "ready") {
      return {
        spuId,
        status,
        explain: messages.explainReady(taskLabel),
      };
    }
    if (status === "running") {
      return {
        spuId,
        status,
        explain: messages.explainRunning(taskLabel),
      };
    }
    if (status === "failed") {
      return {
        spuId,
        status,
        explain: messages.explainFailed(taskLabel),
      };
    }
    const blockedBy = blockers[0];
    return {
      spuId,
      status: "blocked",
      blockedBy,
      explain: blockedBy
        ? messages.explainBlocked(taskLabel, taskLabelResolver(blockedBy))
        : messages.reasonBlocked,
    };
  });
}

function buildDecision(
  input: {
    action: SchedulerAction;
    summary: string;
    nextTask: string | null;
    reason: string;
    blockedBy: string[] | null;
    parallelTasks?: string[];
  },
  details: SchedulerDecisionDetail[],
): SchedulerDecision {
  return {
    action: input.action,
    summary: input.summary,
    nextTask: input.nextTask,
    details,
    reason: input.reason,
    blockedBy: input.blockedBy,
    parallelTasks: input.parallelTasks,
    risk_score: null,
    cost_score: null,
  };
}

function resolveTaskLabelResolver(options: SchedulerExplainOptions | undefined): (spuId: string) => string {
  return options?.taskLabelResolver ?? ((spuId: string) => spuId);
}

function deriveContainerStatusFromDecision(decision: SchedulerDecision): NormalizedProjectContainerStatus {
  if (decision.action === "ARCHIVE_READY") {
    return "pass";
  }
  if (decision.details.some((item) => item.status === "running")) {
    return "running";
  }
  if (decision.details.some((item) => item.status === "failed" || item.status === "ready")) {
    return "ready";
  }
  if (decision.details.some((item) => item.status === "blocked")) {
    return "blocked";
  }
  return "pass";
}

function resolveRunningTask(decision: SchedulerDecision): string | null {
  const runningTask = decision.details.find((item) => item.status === "running");
  return runningTask?.spuId ?? decision.nextTask;
}

export function scheduleWithExplain(
  container: SchedulerContainerInput,
  options?: SchedulerExplainOptions,
): SchedulerDecision {
  const messages = options?.messages ?? DEFAULT_MESSAGES_ZH;
  const taskLabelResolver = resolveTaskLabelResolver(options);
  const order = resolveOrder(container);

  if (order.length === 0) {
    return buildDecision(
      {
        action: "WAIT",
        summary: messages.summaryNoTask,
        nextTask: null,
        reason: messages.reasonNoTask,
        blockedBy: null,
      },
      [],
    );
  }

  const statusBySpuId = buildStatusBySpuId(container);
  const details = buildDecisionDetails(order, statusBySpuId, taskLabelResolver, messages);

  const hasRunning = order.some((spuId) => statusBySpuId[spuId] === "running");
  if (hasRunning) {
    const runningTask = order.find((spuId) => statusBySpuId[spuId] === "running") ?? null;
    return buildDecision(
      {
        action: "WAIT",
        summary: messages.summaryRunning,
        nextTask: null,
        reason: messages.reasonRunning,
        blockedBy: runningTask ? [runningTask] : null,
      },
      details,
    );
  }

  // Priority 1: failed
  const failedTask = order.find((spuId) => statusBySpuId[spuId] === "failed") ?? null;
  if (failedTask) {
    return buildDecision(
      {
        action: "RETRY_FAILED",
        summary: messages.summaryFailed,
        nextTask: failedTask,
        reason: messages.reasonFailed,
        blockedBy: null,
        parallelTasks: options?.parallel ? [failedTask] : undefined,
      },
      details,
    );
  }

  // Priority 2: ready
  const readyTask = firstReadyCandidate(order, statusBySpuId);
  if (readyTask) {
    const readyCandidates = options?.parallel
      ? order.filter((spuId) => statusBySpuId[spuId] === "ready" && dependenciesNotPassed(order, statusBySpuId, spuId).length === 0)
      : undefined;
    return buildDecision(
      {
        action: "EXECUTE",
        summary: messages.summaryExecutable,
        nextTask: readyTask,
        reason: messages.reasonExecutable,
        blockedBy: null,
        parallelTasks: readyCandidates,
      },
      details,
    );
  }

  // Priority 3: blocked
  const blockedTasks = details.filter((item) => item.status === "blocked");
  if (blockedTasks.length > 0) {
    return buildDecision(
      {
        action: "WAIT",
        summary: messages.summaryBlocked,
        nextTask: null,
        reason: messages.reasonBlocked,
        blockedBy: blockedTasks.map((item) => item.spuId),
      },
      details,
    );
  }

  // Priority 4: pass -> archive ready
  const allPass = order.every((spuId) => statusBySpuId[spuId] === "pass");
  if (allPass) {
    return buildDecision(
      {
        action: "ARCHIVE_READY",
        summary: messages.summaryArchiveReady,
        nextTask: null,
        reason: messages.reasonArchiveReady,
        blockedBy: null,
      },
      details,
    );
  }

  return buildDecision(
    {
      action: "WAIT",
      summary: messages.summaryNoTask,
      nextTask: null,
      reason: messages.reasonNoTask,
      blockedBy: null,
    },
    details,
  );
}

export function scheduleNextTask(container: SchedulerContainerInput, options?: SchedulerExplainOptions): SchedulerDecision {
  return scheduleWithExplain(container, options);
}

export function scheduleProject(input: ProjectSchedulerInput, options?: ProjectScheduleOptions): ProjectScheduleDecision {
  const projectMessages = options?.projectMessages ?? DEFAULT_PROJECT_MESSAGES_ZH;
  const taskLabelResolver = resolveTaskLabelResolver(options);
  const containerLabelResolver = options?.containerLabelResolver ?? ((containerId: string) => containerId);

  const evaluated = input.containers
    .map((container) => {
      const decision = scheduleWithExplain(container, options);
      const derivedStatus = deriveContainerStatusFromDecision(decision);
      const status = normalizeContainerStatus(container.status ?? derivedStatus);
      return {
        container,
        decision,
        status,
        stationValue: parseStation(container.containerId),
      };
    })
    .sort((a, b) => a.stationValue - b.stationValue);

  if (evaluated.length === 0) {
    return {
      action: "PROJECT_COMPLETE",
      nextContainer: null,
      nextTask: null,
      summary: projectMessages.summaryProjectComplete,
      reason: projectMessages.reasonProjectComplete,
      containerDetails: [],
      taskDetails: [],
    };
  }

  const runningContainer = evaluated.find((item) => item.status === "running") ?? null;
  const readyContainer = evaluated.find((item) => item.status === "ready") ?? null;
  const blockedContainer = evaluated.find((item) => item.status === "blocked") ?? null;
  // Project-level selection only chooses running/ready containers.
  const target = runningContainer ?? readyContainer ?? null;
  const selectedContainerId = target?.container.containerId ?? null;

  const containerDetails: ProjectContainerDetail[] = evaluated.map((item, index) => ({
    containerId: item.container.containerId,
    stationValue: item.stationValue,
    orderIndex: index + 1,
    selected: selectedContainerId === item.container.containerId,
    status: item.status,
    summary: item.decision.summary,
    reason: item.decision.reason,
    nextTask: item.decision.nextTask,
    action: item.decision.action,
  }));

  const allPass = evaluated.every((item) => item.status === "pass" || item.decision.action === "ARCHIVE_READY");
  if (allPass) {
    return {
      action: "PROJECT_COMPLETE",
      nextContainer: null,
      nextTask: null,
      summary: projectMessages.summaryProjectComplete,
      reason: projectMessages.reasonProjectComplete,
      containerDetails,
      taskDetails: [],
    };
  }

  if (!target) {
    const blockedByContainer = blockedContainer?.container.containerId;
    const blockedTaskDetails = blockedContainer?.decision.details ?? [];
    return {
      action: "PROJECT_BLOCKED",
      nextContainer: null,
      nextTask: null,
      summary: projectMessages.summaryProjectBlocked,
      reason: projectMessages.reasonProjectBlocked,
      blockedByContainer,
      containerDetails,
      taskDetails: blockedTaskDetails,
    };
  }

  if (target.status === "running") {
    return {
      action: "PROJECT_WAIT",
      nextContainer: target.container.containerId,
      nextTask: resolveRunningTask(target.decision),
      summary: projectMessages.summaryProjectWait,
      reason: projectMessages.reasonProjectWaitRunning(containerLabelResolver(target.container.containerId)),
      containerDetails,
      taskDetails: target.decision.details,
    };
  }

  if (target.status === "ready" && target.decision.nextTask) {
    return {
      action: "PROJECT_EXECUTE",
      nextContainer: target.container.containerId,
      nextTask: target.decision.nextTask,
      summary: projectMessages.summaryProjectExecute(
        containerLabelResolver(target.container.containerId),
        taskLabelResolver(target.decision.nextTask),
      ),
      reason: projectMessages.reasonProjectExecute,
      containerDetails,
      taskDetails: target.decision.details,
    };
  }

  const blockedByContainer = blockedContainer?.container.containerId;
  const blockedTaskDetails = blockedContainer?.decision.details ?? [];

  return {
    action: "PROJECT_BLOCKED",
    nextContainer: null,
    nextTask: null,
    summary: projectMessages.summaryProjectBlocked,
    reason: projectMessages.reasonProjectBlocked,
    blockedByContainer,
    containerDetails,
    taskDetails: blockedTaskDetails,
  };
}

export function computeNextExecutableTasks(input: CSDSchedulerInput): CSDNextExecutableTaskResult {
  const decision = scheduleWithExplain({
    containerId: input.container.id,
    tasks: input.tasks,
    normRef: {
      order: input.normRef.order,
    },
  });

  if (!decision.nextTask) {
    return {
      nextTasks: [],
      decision,
    };
  }

  const nextTasks = decision.parallelTasks && decision.parallelTasks.length > 0
    ? decision.parallelTasks.map((spuId) => ({ spuId, reason: decision.reason }))
    : [{ spuId: decision.nextTask, reason: decision.reason }];

  return {
    nextTasks,
    decision,
  };
}


