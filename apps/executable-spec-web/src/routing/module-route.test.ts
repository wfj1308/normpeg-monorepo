import assert from "node:assert/strict";
import test from "node:test";

import { readModuleFromLocation, toModuleUrl } from "./module-route.ts";

test("readModuleFromLocation should read module from pathname first", () => {
  const module = readModuleFromLocation({
    pathname: "/runtime",
    search: "",
  } as Pick<Location, "pathname" | "search">);

  assert.equal(module, "runtime");
});

test("readModuleFromLocation should fallback to query module for backward compatibility", () => {
  const module = readModuleFromLocation({
    pathname: "/",
    search: "?module=debug",
  } as Pick<Location, "pathname" | "search">);

  assert.equal(module, "debug");
});

test("readModuleFromLocation should fallback to executor for invalid module", () => {
  const module = readModuleFromLocation({
    pathname: "/unknown",
    search: "?module=unknown",
  } as Pick<Location, "pathname" | "search">);

  assert.equal(module, "executor");
});

test("toModuleUrl should switch to path route and preserve unrelated query/hash", () => {
  const nextUrl = toModuleUrl("executor", {
    pathname: "/runtime",
    search: "?module=runtime&containerId=c-001",
    hash: "#anchor",
  } as Pick<Location, "pathname" | "search" | "hash">);

  assert.equal(nextUrl, "/executor?containerId=c-001#anchor");
});
