export type AppView = "capture" | "archive" | "catalogue" | "builds" | "scanner" | "about";

export const appViews: Array<{ id: AppView; index: string; label: string; title: string }> = [
  { id: "capture", index: "01", label: "ACQUISITION", title: "数据录入" },
  { id: "archive", index: "02", label: "MANAGEMENT", title: "数据管理" },
  { id: "catalogue", index: "03", label: "CATALOGUE", title: "套装图鉴" },
  { id: "builds", index: "04", label: "BUILD MANAGEMENT", title: "毕业管理" },
  { id: "scanner", index: "05", label: "INVENTORY SCAN", title: "背包扫描" },
  { id: "about", index: "06", label: "ABOUT PROJECT", title: "关于" },
];
