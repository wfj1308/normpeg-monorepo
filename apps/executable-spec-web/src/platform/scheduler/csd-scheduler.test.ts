import assert from "node:assert/strict";
import test from "node:test";

import {
  computeNextExecutableTasks,
  parseStation,
  scheduleProject,
  scheduleWithExplain,
  type CSDTaskStatus,
  type ProjectScheduleMessages,
  type SchedulerContainerInput,
  type SchedulerExplainMessages,
} from "./csd-scheduler.ts";

const ORDER = ["compaction", "thickness", "deflection"];

const TEST_MESSAGES: SchedulerExplainMessages = {
  summaryArchiveReady: "all complete archive-ready",
  summaryExecutable: "has executable task",
  summaryFailed: "has failed task",
  summaryBlocked: "has blocked task",
  summaryRunning: "has running task",
  summaryNoTask: "no executable task",
  reasonArchiveReady: "all specs passed",
  reasonExecutable: "dependencies satisfied",
  reasonFailed: "failed and needs rework",
  reasonBlocked: "blocked by dependency",
  reasonRunning: "running task exists",
  reasonNoTask: "no executable task",
  explainPass: (task) => `${task} done`,
  explainReady: () => "ready to execute",
  explainBlocked: (_task, blocker) => `wait for ${blocker}`,
  explainFailed: () => "failed and needs rework",
  explainRunning: () => "running",
};

const TEST_PROJECT_MESSAGES: ProjectScheduleMessages = {
  summaryProjectComplete: "project complete",
  summaryProjectBlocked: "project blocked",
  summaryProjectWait: "project waiting",
  summaryProjectExecute: (containerId, taskLabel) => `execute ${containerId} ${taskLabel}`,
  reasonProjectComplete: "all containers done",
  reasonProjectBlocked: "previous container unfinished",
  reasonProjectWaitRunning: (containerId) => `${containerId} is running`,
  reasonProjectExecute: "front containers done",
};

function createContainer(containerId: string, statuses: Array<{ spuId: string; status: CSDTaskStatus }>): SchedulerContainerInput {
  return {
    containerId,
    tasks: statuses,
    normRef: { order: ORDER },
  };
}

test("single-container explainability: all pass -> archive ready", () => {
  const result = scheduleWithExplain(
    createContainer("K19+070", [
      { spuId: "compaction", status: "pass" },
      { spuId: "thickness", status: "pass" },
      { spuId: "deflection", status: "pass" },
    ]),
    { messages: TEST_MESSAGES },
  );

  assert.equal(result.action, "ARCHIVE_READY");
  assert.equal(result.summary, "all complete archive-ready");
  assert.equal(result.nextTask, null);
  assert.deepEqual(result.details.map((item) => item.status), ["pass", "pass", "pass"]);
});

test("single-container explainability: failed has higher priority than ready", () => {
  const result = scheduleWithExplain(
    createContainer("K19+070", [
      { spuId: "compaction", status: "pass" },
      { spuId: "thickness", status: "failed" },
      { spuId: "deflection", status: "ready" },
    ]),
    { messages: TEST_MESSAGES },
  );

  assert.equal(result.action, "RETRY_FAILED");
  assert.equal(result.nextTask, "thickness");
  assert.equal(result.summary, "has failed task");
});

test("project scheduler case 1: running container has highest priority", () => {
  const result = scheduleProject(
    {
      containers: [
        createContainer("K19+060", [
          { spuId: "compaction", status: "pass" },
          { spuId: "thickness", status: "pass" },
          { spuId: "deflection", status: "pass" },
        ]),
        createContainer("K19+070", [
          { spuId: "compaction", status: "running" },
          { spuId: "thickness", status: "blocked" },
          { spuId: "deflection", status: "blocked" },
        ]),
        createContainer("K19+080", [
          { spuId: "compaction", status: "ready" },
          { spuId: "thickness", status: "blocked" },
          { spuId: "deflection", status: "blocked" },
        ]),
      ],
    },
    {
      messages: TEST_MESSAGES,
      projectMessages: TEST_PROJECT_MESSAGES,
      taskLabelResolver: (spuId) => spuId,
    },
  );

  assert.equal(result.action, "PROJECT_WAIT");
  assert.equal(result.nextContainer, "K19+070");
  assert.equal(result.nextTask, "compaction");
  assert.equal(result.reason, "K19+070 is running");
  assert.equal(result.containerDetails[0].containerId, "K19+060");
  assert.equal(result.containerDetails[1].containerId, "K19+070");
  assert.equal(result.containerDetails[2].containerId, "K19+080");
  assert.equal(result.containerDetails[1].selected, true);
});

test("project scheduler case 2: pick first ready container when no running container", () => {
  const result = scheduleProject(
    {
      containers: [
        createContainer("K19+060", [
          { spuId: "compaction", status: "pass" },
          { spuId: "thickness", status: "pass" },
          { spuId: "deflection", status: "pass" },
        ]),
        createContainer("K19+070", [
          { spuId: "compaction", status: "pass" },
          { spuId: "thickness", status: "pass" },
          { spuId: "deflection", status: "pass" },
        ]),
        createContainer("K19+080", [
          { spuId: "compaction", status: "ready" },
          { spuId: "thickness", status: "blocked" },
          { spuId: "deflection", status: "blocked" },
        ]),
      ],
    },
    {
      messages: TEST_MESSAGES,
      projectMessages: TEST_PROJECT_MESSAGES,
    },
  );

  assert.equal(result.action, "PROJECT_EXECUTE");
  assert.equal(result.nextContainer, "K19+080");
  assert.equal(result.nextTask, "compaction");
  assert.equal(result.reason, "front containers done");
});

test("project scheduler case 3: project complete when all containers are pass", () => {
  const result = scheduleProject(
    {
      containers: [
        createContainer("K19+060", [
          { spuId: "compaction", status: "pass" },
          { spuId: "thickness", status: "pass" },
          { spuId: "deflection", status: "pass" },
        ]),
        createContainer("K19+070", [
          { spuId: "compaction", status: "pass" },
          { spuId: "thickness", status: "pass" },
          { spuId: "deflection", status: "pass" },
        ]),
        createContainer("K19+080", [
          { spuId: "compaction", status: "pass" },
          { spuId: "thickness", status: "pass" },
          { spuId: "deflection", status: "pass" },
        ]),
      ],
    },
    {
      messages: TEST_MESSAGES,
      projectMessages: TEST_PROJECT_MESSAGES,
    },
  );

  assert.equal(result.action, "PROJECT_COMPLETE");
  assert.equal(result.nextContainer, null);
  assert.equal(result.nextTask, null);
  assert.equal(result.summary, "project complete");
});

test("project scheduler: blocked containers are skipped when choosing next container", () => {
  const result = scheduleProject(
    {
      containers: [
        createContainer("K19+060", [
          { spuId: "compaction", status: "pass" },
          { spuId: "thickness", status: "pass" },
          { spuId: "deflection", status: "pass" },
        ]),
        createContainer("K19+070", [
          { spuId: "compaction", status: "blocked" },
          { spuId: "thickness", status: "blocked" },
          { spuId: "deflection", status: "blocked" },
        ]),
        createContainer("K19+080", [
          { spuId: "compaction", status: "blocked" },
          { spuId: "thickness", status: "blocked" },
          { spuId: "deflection", status: "blocked" },
        ]),
      ],
    },
    {
      messages: TEST_MESSAGES,
      projectMessages: TEST_PROJECT_MESSAGES,
    },
  );

  assert.equal(result.action, "PROJECT_BLOCKED");
  assert.equal(result.nextContainer, null);
  assert.equal(result.blockedByContainer, "K19+070");
  assert.ok(result.containerDetails.every((item) => item.selected === false));
});

test("parseStation: station order is sortable", () => {
  assert.equal(parseStation("K19+060"), 19060);
  assert.equal(parseStation("K19+070"), 19070);
  assert.equal(parseStation("K19+080"), 19080);
  assert.ok(parseStation("K19+060") < parseStation("K19+070"));
});

test("compatibility: computeNextExecutableTasks remains available", () => {
  const result = computeNextExecutableTasks({
    container: { id: "K19+070" },
    tasks: [
      { spuId: "compaction", status: "pass" },
      { spuId: "thickness", status: "ready" },
      { spuId: "deflection", status: "blocked" },
    ],
    normRef: { order: ORDER },
  });
  assert.equal(result.nextTasks[0]?.spuId, "thickness");
  assert.equal(result.decision.action, "EXECUTE");
});
