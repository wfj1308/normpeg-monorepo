export type SchedulerTaskStatus = "pending" | "blocked" | "running" | "pass" | "fail";

export interface CSDTask {
  spuId: string;
  status: SchedulerTaskStatus;
  priority: number;
  durationEstimate?: number;
  constraints: {
    mustBefore: string[];
    mustAfter: string[];
  };
}

export interface ResourceItem {
  id: string;
  type: string;
  available: boolean;
  quantity?: number;
}

export interface NeighborContainer {
  containerId: string;
  activeTask?: string | null;
}

export interface SchedulerResourceConstraint {
  resourceType: "personnel" | "equipment" | "material";
  resourceCode?: string;
  maxUsage?: number;
  note?: string;
}

export interface SchedulerTimeWindowConstraint {
  type: "weather" | "season" | "environmental" | "work_hour";
  expression: string;
  note?: string;
}

export interface SchedulerSpaceConflictRule {
  ruleId: string;
  appliesTo: string[];
  condition: string;
  note?: string;
}

export interface CSDSchedulerInput {
  containerId: string;
  location: {
    station: string;
    coords: {
      X: number;
      Y: number;
      Z?: number;
    };
  };
  tasks: CSDTask[];
  resources: {
    personnel: ResourceItem[];
    equipment: ResourceItem[];
    materials?: ResourceItem[];
  };
  timeConstraints: {
    weather?: string;
    season?: string;
    currentTime?: string;
    workHours?: string[];
  };
  spaceConstraints: {
    neighborContainers: NeighborContainer[];
  };
  optimizationTargets: {
    duration: "min";
    cost: "min";
    quality: "max";
    risk: "min";
  };
  normConstraints?: {
    resourceConstraints?: SchedulerResourceConstraint[];
    timeWindowConstraints?: SchedulerTimeWindowConstraint[];
    spaceConflictRules?: SchedulerSpaceConflictRule[];
  };
}

export interface SchedulerResult {
  nextTask: string | null;
  reason: string[];
}
