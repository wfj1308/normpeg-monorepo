import { APP_MODULES, DEFAULT_APP_MODULE, isAppModule, type AppModule } from "../modules/module-config.ts";

const MODULE_QUERY_KEY = "module";
const MODULE_PATH_SEPARATOR = "/";

function normalizeSubPath(subPath: string | null | undefined): string {
  return (subPath ?? "")
    .trim()
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
}

function readModuleParam(search: string): string | null {
  const params = new URLSearchParams(search);
  return (params.get(MODULE_QUERY_KEY) ?? "").trim() || null;
}

function readModuleFromPathname(pathname: string): AppModule | null {
  const firstSegment = pathname
    .split(MODULE_PATH_SEPARATOR)
    .filter(Boolean)[0]
    ?.trim()
    .toLowerCase() ?? "";
  if (isAppModule(firstSegment)) {
    return firstSegment;
  }
  const alias = APP_MODULES.find((item) => item.routePath.replace(/^\/+/, "").toLowerCase() === firstSegment);
  if (alias) {
    return alias.key;
  }
  return null;
}

export function readModuleFromLocation(locationLike: Pick<Location, "pathname" | "search">): AppModule {
  const moduleFromPath = readModuleFromPathname(locationLike.pathname);
  if (moduleFromPath) {
    return moduleFromPath;
  }

  const raw = readModuleParam(locationLike.search);
  if (!raw || !isAppModule(raw)) {
    return DEFAULT_APP_MODULE;
  }
  return raw;
}

export function toModuleUrl(module: AppModule, locationLike: Pick<Location, "pathname" | "search" | "hash">): string {
  const segments = locationLike.pathname
    .split(MODULE_PATH_SEPARATOR)
    .filter(Boolean)
    .map((segment) => segment.trim().toLowerCase())
    .filter(Boolean);
  const keepSubPath = segments[0] === module && segments.length > 1;
  const subPath = keepSubPath ? segments.slice(1).join(MODULE_PATH_SEPARATOR) : "";
  return toModuleSubPathUrl(module, subPath, locationLike);
}

export function toModuleSubPathUrl(
  module: AppModule,
  subPath: string | null | undefined,
  locationLike: Pick<Location, "search" | "hash">,
): string {
  const params = new URLSearchParams(locationLike.search);
  // Keep backward compatibility with old query routes by removing module query when path route is used.
  params.delete(MODULE_QUERY_KEY);
  const query = params.toString();
  const normalizedSubPath = normalizeSubPath(subPath);
  const routeRoot = APP_MODULES.find((item) => item.key === module)?.routePath || `/${module}`;
  const normalizedRoot = `${MODULE_PATH_SEPARATOR}${routeRoot.replace(/^\/+/, "").replace(/\/+$/, "")}`;
  const nextPath = `${normalizedRoot}${normalizedSubPath ? `${MODULE_PATH_SEPARATOR}${normalizedSubPath}` : ""}`;
  return `${nextPath}${query ? `?${query}` : ""}${locationLike.hash ?? ""}`;
}

export function writeModuleToLocation(module: AppModule, replace = false): void {
  writeModuleSubPathToLocation(module, null, replace);
}

export function writeModuleSubPathToLocation(
  module: AppModule,
  subPath: string | null | undefined,
  replace = false,
): void {
  if (typeof window === "undefined") {
    return;
  }
  const nextUrl = toModuleSubPathUrl(module, subPath, window.location);
  if (replace) {
    window.history.replaceState({}, "", nextUrl);
    return;
  }
  window.history.pushState({}, "", nextUrl);
}
