import { K19_070_NORM_REF } from "../k19-070-example.ts";
import type { SpaceContainer } from "../csd-models.ts";
import {
  scheduleContainers,
  type GlobalSchedulerResources,
  type GlobalTimeContext,
} from "./multi-container-scheduler.ts";

const CONTAINER_K19_060: SpaceContainer = {
  vAddress: "v:/cn.highway/dajin/subgrade/DB-01/container/K19+060",
  containerType: "space",
  geoReference: {
    station: "K19+060",
    chainage: 19060,
    coordSystem: "CGCS2000",
    coords: { X: 3845220.1, Y: 456770.4, Z: 284.21 },
  },
  normExecution: {
    applicableSpecs: [
      {
        spuId: "highway.subgrade.compaction.4.2.1@v1",
        status: "pending",
        attempts: 0,
        latestNode: null,
        dependsOn: [],
      },
      {
        spuId: "highway.subgrade.deflection.4.2.2@v1",
        status: "blocked",
        attempts: 0,
        latestNode: null,
        dependsOn: ["highway.subgrade.compaction.4.2.1@v1"],
      },
    ],
    currentState: "compaction_pending",
    gateStatus: "awaiting_lab",
    executionOrder: [
      "highway.subgrade.compaction.4.2.1@v1",
      "highway.subgrade.deflection.4.2.2@v1",
    ],
  },
  runtime: {
    activeSpec: null,
    activeForm: null,
    pendingActions: [],
    pendingSignatures: [],
    lastAction: null,
  },
  lifecycle: {
    state: "ACTIVE",
    createdAt: "2026-03-25T09:00:00Z",
    updatedAt: "2026-03-25T09:00:00Z",
  },
};

const CONTAINER_K19_070: SpaceContainer = {
  vAddress: "v:/cn.highway/dajin/subgrade/DB-01/container/K19+070",
  containerType: "space",
  geoReference: {
    station: "K19+070",
    chainage: 19070,
    coordSystem: "CGCS2000",
    coords: { X: 3845231.4, Y: 456789.1, Z: 284.52 },
  },
  normExecution: {
    applicableSpecs: [
      {
        spuId: "highway.subgrade.compaction.4.2.1@v1",
        status: "pending",
        attempts: 0,
        latestNode: null,
        dependsOn: [],
      },
      {
        spuId: "highway.subgrade.deflection.4.2.2@v1",
        status: "blocked",
        attempts: 0,
        latestNode: null,
        dependsOn: ["highway.subgrade.compaction.4.2.1@v1"],
      },
    ],
    currentState: "compaction_pending",
    gateStatus: "awaiting_lab",
    executionOrder: [
      "highway.subgrade.compaction.4.2.1@v1",
      "highway.subgrade.deflection.4.2.2@v1",
    ],
  },
  runtime: {
    activeSpec: null,
    activeForm: null,
    pendingActions: [],
    pendingSignatures: [],
    lastAction: null,
  },
  lifecycle: {
    state: "ACTIVE",
    createdAt: "2026-03-25T09:00:00Z",
    updatedAt: "2026-03-25T09:00:00Z",
  },
};

const CONTAINER_K19_080: SpaceContainer = {
  vAddress: "v:/cn.highway/dajin/subgrade/DB-01/container/K19+080",
  containerType: "space",
  geoReference: {
    station: "K19+080",
    chainage: 19080,
    coordSystem: "CGCS2000",
    coords: { X: 3845242.8, Y: 456807.6, Z: 284.69 },
  },
  normExecution: {
    applicableSpecs: [
      {
        spuId: "highway.subgrade.compaction.4.2.1@v1",
        status: "blocked",
        attempts: 0,
        latestNode: null,
        dependsOn: [],
      },
      {
        spuId: "highway.subgrade.deflection.4.2.2@v1",
        status: "blocked",
        attempts: 0,
        latestNode: null,
        dependsOn: ["highway.subgrade.compaction.4.2.1@v1"],
      },
    ],
    currentState: "deflection_blocked",
    gateStatus: "awaiting_compaction",
    executionOrder: [
      "highway.subgrade.compaction.4.2.1@v1",
      "highway.subgrade.deflection.4.2.2@v1",
    ],
  },
  runtime: {
    activeSpec: null,
    activeForm: null,
    pendingActions: [],
    pendingSignatures: [],
    lastAction: null,
  },
  lifecycle: {
    state: "ACTIVE",
    createdAt: "2026-03-25T09:00:00Z",
    updatedAt: "2026-03-25T09:00:00Z",
  },
};

const GLOBAL_RESOURCES: GlobalSchedulerResources = {
  lab: [{ id: "lab_01", available: true }],
  equipment: [{ id: "roller_01", type: "compactor", available: true }],
};

const GLOBAL_TIME_CONTEXT: GlobalTimeContext = {
  currentTime: "2026-03-25T09:00:00Z",
  weather: "clear",
};

export const MULTI_CONTAINER_INPUT = {
  containers: [CONTAINER_K19_060, CONTAINER_K19_070, CONTAINER_K19_080],
  normRef: K19_070_NORM_REF,
  resources: GLOBAL_RESOURCES,
  timeContext: GLOBAL_TIME_CONTEXT,
};

export const MULTI_CONTAINER_OUTPUT = scheduleContainers(
  MULTI_CONTAINER_INPUT.containers,
  MULTI_CONTAINER_INPUT.normRef,
  MULTI_CONTAINER_INPUT.resources,
  MULTI_CONTAINER_INPUT.timeContext,
);
