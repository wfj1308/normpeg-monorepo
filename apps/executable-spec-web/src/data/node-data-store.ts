export type NodeDataMetric = "compaction" | "thickness" | "deflection";

export type NodeDataStoreRecord = Partial<
  Record<
    NodeDataMetric,
    Record<string, number>
  >
>;

export const nodeDataStore: Record<string, NodeDataStoreRecord> = {
  "K15+200": {
    compaction: {
      massHoleSand: 1980,
      massSandCone: 500,
      volumeSand: 1000,
      moistureContent: 5,
      maxDryDensity: 1.95,
    },
    thickness: {
      measuredThickness: 210,
      designThickness: 200,
    },
    deflection: {
      measuredDeflection: 18,
      maxAllowedDeflection: 20,
    },
  },
  "K15+300": {
    compaction: {
      massHoleSand: 1800,
      massSandCone: 500,
      volumeSand: 1000,
      moistureContent: 6,
      maxDryDensity: 1.95,
    },
  },
};
