import assert from "node:assert/strict";
import test from "node:test";

import { loadAppConfig, redactAppConfig } from "./app-config.ts";

test("app-config: defaults should resolve to dev profile", () => {
  const { config, warnings } = loadAppConfig(
    {},
    {
      serviceName: "platform-api",
      defaultPort: 8790,
    },
  );
  assert.equal(config.env.name, "dev");
  assert.equal(config.network.port, 8790);
  assert.equal(config.db.driver, "memory");
  assert.equal(config.storage.driver, "local");
  assert.equal(config.log.level, "debug");
  assert.equal(warnings.length, 0);
});

test("app-config: staging/prod env vars should be parsed", () => {
  const { config, warnings } = loadAppConfig(
    {
      NORMPEG_ENV: "prod",
      PLATFORM_API_PORT: "9000",
      NORMPEG_DB_DRIVER: "postgres",
      NORMPEG_DB_URL: "postgres://user:pass@db.example.com:5432/normpeg",
      NORMPEG_STORAGE_DRIVER: "s3",
      NORMPEG_STORAGE_BUCKET: "normpeg-prod",
      NORMPEG_LOG_LEVEL: "info",
      NORMPEG_LOG_JSON: "true",
    },
    {
      serviceName: "platform-api",
      defaultPort: 8790,
    },
  );
  assert.equal(config.env.name, "prod");
  assert.equal(config.network.port, 9000);
  assert.equal(config.db.driver, "postgres");
  assert.equal(config.storage.driver, "s3");
  assert.equal(config.log.level, "info");
  assert.equal(config.log.json, true);
  assert.equal(warnings.some((item) => item.code === "DB_URL_MISSING"), false);
  assert.equal(warnings.some((item) => item.code === "STORAGE_BUCKET_MISSING"), false);

  const redacted = redactAppConfig(config);
  assert.equal(redacted.db.url?.includes("***"), true);
});

