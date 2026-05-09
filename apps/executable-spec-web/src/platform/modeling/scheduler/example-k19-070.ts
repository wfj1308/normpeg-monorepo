import type { CSDSchedulerInput } from "../types/CSDSchedulerInput.ts";
import { scheduleNextTask } from "./scheduler.ts";

export const K19_070_SCHEDULER_INPUT: CSDSchedulerInput = {
  containerId: "v:/cn.highway/dajin/subgrade/DB-01/container/K19+070",
  location: {
    station: "K19+070",
    coords: {
      X: 3845231.456,
      Y: 456789.123,
      Z: 284.523,
    },
  },
  tasks: [
    {
      spuId: "highway.subgrade.compaction.4.2.1@v1",
      status: "pending",
      priority: 10,
      durationEstimate: 2.5,
      constraints: {
        mustBefore: ["highway.subgrade.deflection.4.2.2@v1"],
        mustAfter: [],
      },
    },
    {
      spuId: "highway.subgrade.thickness.4.2.3@v1",
      status: "blocked",
      priority: 9,
      durationEstimate: 1.2,
      constraints: {
        mustBefore: [],
        mustAfter: ["highway.subgrade.compaction.4.2.1@v1"],
      },
    },
    {
      spuId: "highway.subgrade.deflection.4.2.2@v1",
      status: "blocked",
      priority: 8,
      durationEstimate: 1.5,
      constraints: {
        mustBefore: [],
        mustAfter: ["highway.subgrade.compaction.4.2.1@v1"],
      },
    },
  ],
  resources: {
    personnel: [{ id: "lab_01", type: "lab", available: true }],
    equipment: [{ id: "roller_01", type: "compactor", available: true }],
    materials: [{ id: "sand_01", type: "standard_sand", available: true }],
  },
  timeConstraints: {
    weather: "clear",
    season: "normal",
    workHours: ["08:00-18:00"],
  },
  spaceConstraints: {
    neighborContainers: [{ containerId: "K19+060", activeTask: "deflection" }],
  },
  optimizationTargets: {
    duration: "min",
    cost: "min",
    quality: "max",
    risk: "min",
  },
};

export const K19_070_SCHEDULER_OUTPUT = scheduleNextTask(K19_070_SCHEDULER_INPUT);
