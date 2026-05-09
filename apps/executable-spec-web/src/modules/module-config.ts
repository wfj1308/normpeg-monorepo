export type AppModule = "builder" | "executor" | "runtime" | "debug";

export interface AppModuleConfig {
  key: AppModule;
  title: string;
  description: string;
  routePath: string;
  internal?: boolean;
}

export const DEFAULT_APP_MODULE: AppModule = "executor";

export const APP_MODULES: AppModuleConfig[] = [
  {
    key: "builder",
    title: "SpecBot",
    description: "Spec build workspace",
    routePath: "/specbot",
  },
  {
    key: "executor",
    title: "Executor",
    description: "Spec execution workspace",
    routePath: "/executor",
  },
  {
    key: "runtime",
    title: "Rule Store",
    description: "NormDoc repository and version workspace",
    routePath: "/rule-store",
  },
  {
    key: "debug",
    title: "Debug",
    description: "Internal API integration zone",
    routePath: "/debug",
    internal: true,
  },
];

export function isAppModule(value: string | null | undefined): value is AppModule {
  return value === "builder" || value === "executor" || value === "runtime" || value === "debug";
}

export function getModuleConfig(module: AppModule): AppModuleConfig {
  return APP_MODULES.find((item) => item.key === module) ?? APP_MODULES[0];
}
