import { fileURLToPath } from "node:url";

export type DeploymentEnvironment = "dev" | "staging" | "prod";
export type DbDriver = "memory" | "postgres" | "mysql" | "sqlite";
export type StorageDriver = "local" | "s3" | "gcs" | "azureblob" | "minio";
export type LogLevel = "debug" | "info" | "warn" | "error";

export interface AppConfigWarning {
  code: string;
  message: string;
}

export interface AppConfig {
  env: {
    name: DeploymentEnvironment;
    nodeEnv: "development" | "production" | "test";
    serviceName: string;
  };
  network: {
    host: string;
    port: number;
    publicBaseUrl: string;
  };
  db: {
    driver: DbDriver;
    url: string | null;
    schema: string;
    ssl: boolean;
    poolMin: number;
    poolMax: number;
  };
  storage: {
    driver: StorageDriver;
    localDir: string;
    bucket: string | null;
    region: string | null;
    endpoint: string | null;
    forcePathStyle: boolean;
  };
  log: {
    level: LogLevel;
    json: boolean;
  };
}

export interface LoadAppConfigOptions {
  serviceName?: string;
  defaultPort?: number;
  portEnvKeys?: string[];
  defaultHost?: string;
}

export interface LoadAppConfigResult {
  config: AppConfig;
  warnings: AppConfigWarning[];
}

const DEFAULT_STORAGE_LOCAL_DIR = fileURLToPath(new URL("../../.runtime-storage", import.meta.url));
const DEFAULT_PORT_ENV_KEYS = ["PLATFORM_API_PORT", "PORT"];

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

function parseBoolean(value: unknown, fallback: boolean): boolean {
  const normalized = normalizeText(value).toLowerCase();
  if (!normalized) {
    return fallback;
  }
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

function parseInteger(value: unknown, fallback: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  const normalized = Math.trunc(numeric);
  return normalized > 0 ? normalized : fallback;
}

function parseDeploymentEnvironment(value: unknown): DeploymentEnvironment {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === "prod" || normalized === "production") {
    return "prod";
  }
  if (normalized === "staging" || normalized === "stage" || normalized === "preprod") {
    return "staging";
  }
  return "dev";
}

function parseDbDriver(value: unknown, fallback: DbDriver): DbDriver {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === "memory" || normalized === "postgres" || normalized === "mysql" || normalized === "sqlite") {
    return normalized;
  }
  return fallback;
}

function parseStorageDriver(value: unknown, fallback: StorageDriver): StorageDriver {
  const normalized = normalizeText(value).toLowerCase();
  if (
    normalized === "local" ||
    normalized === "s3" ||
    normalized === "gcs" ||
    normalized === "azureblob" ||
    normalized === "minio"
  ) {
    return normalized;
  }
  return fallback;
}

function parseLogLevel(value: unknown, fallback: LogLevel): LogLevel {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === "debug" || normalized === "info" || normalized === "warn" || normalized === "error") {
    return normalized;
  }
  return fallback;
}

function findFirstEnvValue(source: NodeJS.ProcessEnv, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return undefined;
}

function nodeEnvFromProfile(profile: DeploymentEnvironment): "development" | "production" | "test" {
  if (profile === "dev") {
    return "development";
  }
  return "production";
}

function redactDbUrl(url: string | null): string | null {
  if (!url) {
    return null;
  }
  try {
    const parsed = new URL(url);
    if (parsed.password) {
      parsed.password = "***";
    }
    if (parsed.username) {
      parsed.username = "***";
    }
    return parsed.toString();
  } catch {
    return "<configured>";
  }
}

export function redactAppConfig(config: AppConfig): AppConfig {
  return {
    ...config,
    db: {
      ...config.db,
      url: redactDbUrl(config.db.url),
    },
  };
}

export function loadAppConfig(
  source: NodeJS.ProcessEnv = process.env,
  options: LoadAppConfigOptions = {},
): LoadAppConfigResult {
  const profile = parseDeploymentEnvironment(
    source.NORMPEG_ENV ?? source.APP_ENV ?? source.NODE_ENV ?? "dev",
  );
  const nodeEnv = nodeEnvFromProfile(profile);
  const serviceName = normalizeText(source.NORMPEG_SERVICE_NAME) || options.serviceName || "platform-api";
  const host = normalizeText(source.NORMPEG_HOST) || options.defaultHost || "0.0.0.0";
  const port = parseInteger(
    findFirstEnvValue(source, options.portEnvKeys ?? DEFAULT_PORT_ENV_KEYS),
    options.defaultPort ?? 8790,
  );
  const publicBaseUrl = normalizeText(source.NORMPEG_PUBLIC_BASE_URL) || `http://localhost:${port}`;

  const dbDriverDefault: DbDriver = profile === "dev" ? "memory" : "postgres";
  const dbDriver = parseDbDriver(source.NORMPEG_DB_DRIVER, dbDriverDefault);
  const dbPoolMinDefault = profile === "prod" ? 2 : 1;
  const dbPoolMaxDefault = profile === "prod" ? 20 : 10;
  const storageDriverDefault: StorageDriver = profile === "prod" ? "s3" : "local";
  const storageDriver = parseStorageDriver(source.NORMPEG_STORAGE_DRIVER, storageDriverDefault);
  const logLevelDefault: LogLevel = profile === "dev" ? "debug" : "info";
  const logLevel = parseLogLevel(source.NORMPEG_LOG_LEVEL, logLevelDefault);

  const config: AppConfig = {
    env: {
      name: profile,
      nodeEnv,
      serviceName,
    },
    network: {
      host,
      port,
      publicBaseUrl,
    },
    db: {
      driver: dbDriver,
      url: normalizeText(source.NORMPEG_DB_URL) || null,
      schema: normalizeText(source.NORMPEG_DB_SCHEMA) || "public",
      ssl: parseBoolean(source.NORMPEG_DB_SSL, profile === "prod"),
      poolMin: parseInteger(source.NORMPEG_DB_POOL_MIN, dbPoolMinDefault),
      poolMax: parseInteger(source.NORMPEG_DB_POOL_MAX, dbPoolMaxDefault),
    },
    storage: {
      driver: storageDriver,
      localDir: normalizeText(source.NORMPEG_STORAGE_LOCAL_DIR) || DEFAULT_STORAGE_LOCAL_DIR,
      bucket: normalizeText(source.NORMPEG_STORAGE_BUCKET) || null,
      region: normalizeText(source.NORMPEG_STORAGE_REGION) || null,
      endpoint: normalizeText(source.NORMPEG_STORAGE_ENDPOINT) || null,
      forcePathStyle: parseBoolean(source.NORMPEG_STORAGE_FORCE_PATH_STYLE, false),
    },
    log: {
      level: logLevel,
      json: parseBoolean(source.NORMPEG_LOG_JSON, profile !== "dev"),
    },
  };

  const warnings: AppConfigWarning[] = [];
  if (config.db.driver !== "memory" && !config.db.url) {
    warnings.push({
      code: "DB_URL_MISSING",
      message: "NORMPEG_DB_URL is not set while DB driver is not memory",
    });
  }
  if (config.storage.driver !== "local" && !config.storage.bucket) {
    warnings.push({
      code: "STORAGE_BUCKET_MISSING",
      message: "NORMPEG_STORAGE_BUCKET is not set while storage driver is not local",
    });
  }
  if (config.env.name === "prod" && config.log.level === "debug") {
    warnings.push({
      code: "LOG_LEVEL_DEBUG_IN_PROD",
      message: "debug log level is enabled in prod profile",
    });
  }
  if (config.db.poolMax < config.db.poolMin) {
    warnings.push({
      code: "DB_POOL_RANGE_INVALID",
      message: "NORMPEG_DB_POOL_MAX is lower than NORMPEG_DB_POOL_MIN; values should be adjusted",
    });
  }

  return {
    config,
    warnings,
  };
}

