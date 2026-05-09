import type { WorkItemWorkflowStep } from "../spu-types.ts";

export const workItemCatalog: Record<
  string,
  {
    workItemId: string;
    workItemName: string;
    catalogName: string;
    norm: string;
    clauseGroup?: string;
    spuIds: string[];
    workflow: WorkItemWorkflowStep[];
  }
> = {
  earthwork_subgrade: {
    workItemId: "earthwork_subgrade",
    workItemName: "土方路基",
    catalogName: "路基工程",
    norm: "JTG F80/1-2017",
    clauseGroup: "4.2",
    spuIds: [
      "highway.subgrade.compaction.4.2.1.soil@v1",
      "highway.subgrade.deflection.4.2.2@v1",
      "highway.subgrade.thickness.4.2.3@v1",
    ],
    workflow: [
      {
        spuId: "highway.subgrade.compaction.4.2.1.soil@v1",
        dependsOn: [],
      },
      {
        spuId: "highway.subgrade.deflection.4.2.2@v1",
        dependsOn: ["highway.subgrade.compaction.4.2.1.soil@v1"],
      },
      {
        spuId: "highway.subgrade.thickness.4.2.3@v1",
        dependsOn: ["highway.subgrade.deflection.4.2.2@v1"],
      },
    ],
  },
};
