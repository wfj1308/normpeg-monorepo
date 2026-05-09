import { nodeDataStore, type NodeDataMetric } from "../data/node-data-store.ts";

export type NodeInputDataError = "MISSING_STAKE" | "DATA_NOT_FOUND" | "INVALID_DATA";

export type FetchNodeInputDataInput = {
  spuId: string;
  stake?: string;
};

export type FetchNodeInputDataResult =
  | {
      metric: NodeDataMetric;
      formData: Record<string, number>;
    }
  | {
      metric: NodeDataMetric;
      error: NodeInputDataError;
    };

const REQUIRED_STORE_FIELDS: Record<NodeDataMetric, string[]> = {
  compaction: ["massHoleSand", "volumeSand", "moistureContent", "maxDryDensity"],
  thickness: ["measuredThickness", "designThickness"],
  deflection: ["measuredDeflection", "maxAllowedDeflection"],
};

export function getMetricFromSpuId(spuId: string): NodeDataMetric {
  if (spuId.includes(".compaction.")) {
    return "compaction";
  }
  if (spuId.includes(".thickness.")) {
    return "thickness";
  }
  if (spuId.includes(".deflection.")) {
    return "deflection";
  }

  throw new Error(`Unsupported SPU metric for input lookup: ${spuId}`);
}

function hasAllRequiredFields(metric: NodeDataMetric, data: Record<string, number>): boolean {
  return REQUIRED_STORE_FIELDS[metric].every((field) => typeof data[field] === "number" && !Number.isNaN(data[field]));
}

function mapStoreDataToFormData(metric: NodeDataMetric, data: Record<string, number>): Record<string, number> {
  switch (metric) {
    case "compaction":
      return {
        massHoleSand: data.massHoleSand,
        volumeSand: data.volumeSand,
        moistureContent: data.moistureContent,
        maxDryDensity: data.maxDryDensity,
      };
    case "thickness":
      return {
        measuredThickness: data.measuredThickness,
        designThickness: data.designThickness,
      };
    case "deflection":
      return {
        measuredDeflection: data.measuredDeflection,
        allowableDeflection: data.maxAllowedDeflection,
      };
    default:
      throw new Error(`Unsupported metric for formData mapping: ${metric satisfies never}`);
  }
}

export function fetchNodeInputData(input: FetchNodeInputDataInput): FetchNodeInputDataResult {
  const metric = getMetricFromSpuId(input.spuId);
  if (!input.stake) {
    return {
      metric,
      error: "MISSING_STAKE",
    };
  }

  const rawData = nodeDataStore[input.stake]?.[metric];
  if (!rawData) {
    return {
      metric,
      error: "DATA_NOT_FOUND",
    };
  }

  if (!hasAllRequiredFields(metric, rawData)) {
    return {
      metric,
      error: "INVALID_DATA",
    };
  }

  return {
    metric,
    formData: mapStoreDataToFormData(metric, rawData),
  };
}
