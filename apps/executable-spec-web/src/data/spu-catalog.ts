export const spuCatalogMap: Record<
  string,
  {
    normName: string;
    clause: string;
    category: string;
    workItem: string;
    measuredItem: string;
    pathLabel: string;
  }
> = {
  "highway.subgrade.compaction.4.2.1.soil@v1": {
    normName: "JTG F80/1-2017",
    clause: "4.2.1",
    category: "路基工程",
    workItem: "土方路基",
    measuredItem: "压实度（土质）",
    pathLabel: "路基工程 / 土方路基 / 压实度（土质）",
  },
  "highway.subgrade.deflection.4.2.2@v1": {
    normName: "JTG F80/1-2017",
    clause: "4.2.2",
    category: "路基工程",
    workItem: "土方路基",
    measuredItem: "弯沉",
    pathLabel: "路基工程 / 土方路基 / 弯沉",
  },
  "highway.subgrade.thickness.4.2.3@v1": {
    normName: "JTG F80/1-2017",
    clause: "4.2.3",
    category: "路基工程",
    workItem: "土方路基",
    measuredItem: "厚度",
    pathLabel: "路基工程 / 土方路基 / 厚度",
  },
  "highway.bridge.pile.strength.quality@v1": {
    normName: "JTG/T 3650-2020",
    clause: "6.3.4",
    category: "桥梁工程",
    workItem: "钻孔灌注桩",
    measuredItem: "桩基强度",
    pathLabel: "桥梁工程 / 钻孔灌注桩 / 桩基强度",
  },
  "highway.pavement.flatness.4.2.9@v1": {
    normName: "JTG F80/1-2017",
    clause: "4.2.9",
    category: "路面工程",
    workItem: "面层",
    measuredItem: "平整度",
    pathLabel: "路面工程 / 面层 / 平整度",
  },
};
