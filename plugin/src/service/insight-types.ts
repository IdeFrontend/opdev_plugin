export interface InsightVersionMapping {
  minPluginVersion: string;
  insightVersion: string;
  downloadUrl: string;
}

export interface InsightVersionRecord {
  version: string;
  createTime: string;
}

export interface InsightVersionHistory extends InsightVersionRecord {
  updateTime: string;
}

export interface InsightVersionJson {
  version: string;
  createTime: string;
  historyVersion: InsightVersionHistory[];
}
