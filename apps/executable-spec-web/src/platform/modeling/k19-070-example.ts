import type {
  CSDSchedulerInput,
  NormRef,
  ResourcePool,
  SpaceContainer,
  SpaceContext,
  TimeContext,
} from "./csd-models.ts";
import { buildCSDSchedulerInput } from "./csd-models.ts";

export const K19_070_NORM_REF: NormRef = {
  normRefId: "normref.highway.subgrade.jtgf80_1_2017.v1",
  name: "路基工程验收约束库",
  domain: "highway",
  category: "subgrade",
  version: "v1",
  specCatalog: [
    {
      spuId: "highway.subgrade.compaction.4.2.1@v1",
      workItem: "土方路基",
      measuredItem: "压实度",
      required: true,
      priority: 10,
    },
    {
      spuId: "highway.subgrade.deflection.4.2.2@v1",
      workItem: "土方路基",
      measuredItem: "弯沉",
      required: true,
      priority: 8,
    },
  ],
  optimizationTargets: {
    duration: "min",
    cost: "min",
    quality: "max",
    risk: "min",
  },
  constraints: {
    orderRules: [
      {
        before: "highway.subgrade.compaction.4.2.1@v1",
        after: "highway.subgrade.deflection.4.2.2@v1",
        reason: "先压实后弯沉",
      },
    ],
    resourceConstraints: [
      {
        resourceType: "equipment",
        resourceCode: "roller_01",
        maxUsage: 1,
        note: "同一时段压路机仅可服务一个检测任务",
      },
      {
        resourceType: "personnel",
        resourceCode: "lab_team_a",
        maxUsage: 1,
      },
    ],
    timeWindowConstraints: [
      {
        type: "work_hour",
        expression: "08:00-18:00",
      },
      {
        type: "weather",
        expression: "weather != heavy_rain",
      },
    ],
    spaceConflictRules: [
      {
        ruleId: "SPACE-CONFLICT-SUBGRADE-001",
        appliesTo: [
          "highway.subgrade.compaction.4.2.1@v1",
          "highway.subgrade.deflection.4.2.2@v1",
        ],
        condition: "adjacent_container.active_task != current_task",
        note: "同段落相邻容器不同时执行同类高干扰工序",
      },
    ],
  },
  metadata: {
    source: "JTG F80/1-2017 + project constraints",
    createdAt: "2026-04-21T09:00:00Z",
    updatedAt: "2026-04-21T09:00:00Z",
  },
};

export const K19_070_SPACE_CONTAINER: SpaceContainer = {
  vAddress: "v:/cn.highway/dajin/subgrade/DB-01/container/K19+070",
  containerType: "space",
  geoReference: {
    station: "K19+070",
    chainage: 19070,
    coordSystem: "CGCS2000",
    coords: {
      X: 3845231.456,
      Y: 456789.123,
      Z: 284.523,
    },
    gps: {
      lat: 34.123456,
      lng: 108.654321,
    },
    alignment: "主线右幅",
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
    activeSpec: "highway.subgrade.compaction.4.2.1@v1",
    activeForm: "SUBGRADE_COMPACTION_FORM",
    pendingActions: ["fill_form", "submit_test", "lab_sign"],
    pendingSignatures: ["lab"],
    lastAction: "2026-04-21T09:30:15Z",
  },
  lifecycle: {
    state: "ACTIVE",
    createdAt: "2026-04-21T09:00:00Z",
    updatedAt: "2026-04-21T09:30:15Z",
  },
};

export const K19_070_RESOURCES: ResourcePool = {
  personnel: [
    { id: "lab_01", type: "lab", available: true, quantity: 1 },
    { id: "supervision_01", type: "supervision", available: true, quantity: 1 },
  ],
  equipment: [
    { id: "roller_01", type: "compactor", available: true, quantity: 1 },
    { id: "deflectometer_01", type: "deflectometer", available: true, quantity: 1 },
  ],
  materials: [{ id: "sand_01", type: "standard_sand", available: true, quantity: 1 }],
};

export const K19_070_TIME_CONTEXT: TimeContext = {
  weather: "clear",
  season: "normal",
  workHours: ["08:00-18:00"],
};

export const K19_070_SPACE_CONTEXT: SpaceContext = {
  neighborContainers: [
    {
      containerId: "K19+060",
      activeTask: "compaction",
    },
  ],
};

export const K19_070_CSD_INPUT: CSDSchedulerInput = buildCSDSchedulerInput(
  K19_070_SPACE_CONTAINER,
  K19_070_NORM_REF,
  K19_070_RESOURCES,
  K19_070_TIME_CONTEXT,
  K19_070_SPACE_CONTEXT,
);
