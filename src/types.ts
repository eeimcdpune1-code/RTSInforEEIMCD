export interface ApplicationCounts {
  total: number;
  approved: number;
  rejected: number;
  pending: number;
  sendback: number;
}

export interface ServiceRow {
  serviceName: string;
  offline: ApplicationCounts;
  online: ApplicationCounts;
}

export interface Office {
  id: number;
  name: string;
  role: "Admin" | "Corporation" | "Office";
  corporationId?: number;
}

export interface DashboardStat {
  officeId: number;
  officeName: string;
  offline: ApplicationCounts;
  online: ApplicationCounts;
  total: number;
  approved: number;
  rejected: number;
  pending: number;
  sendback: number;
}
