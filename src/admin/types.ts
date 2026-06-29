export type ApiResult<T = Record<string, unknown>> = T & { success?: boolean; message?: string };

export interface UserItem {
  id: string;
  name: string;
  position?: string;
  musicId?: string;
  musicName?: string;
  sortOrder?: number;
  avatar?: string;
  photo?: string;
  fullPhoto?: string;
  loginUsername?: string;
  hasLogin?: boolean;
  createdAt?: string;
}

export interface MusicItem {
  id: string;
  name: string;
  description?: string;
  filename?: string;
  originalname?: string;
  originalName?: string;
  lrcFilename?: string;
  isSound?: boolean;
  uploadDate?: string;
  uploadedAt?: string;
  size?: number;
}

export interface PlatformTarget {
  id?: string;
  name: string;
  target: number;
  current?: number;
  enabled?: boolean;
  percentage?: number;
}

export interface CelebrationMessage {
  id: string;
  message: string;
  createdAt?: string;
}

export interface PageSettings {
  mainTitle: string;
  subTitle: string;
  inquiryTitle: string;
  dealTitle: string;
  progressTitle: string;
  teamTitle: string;
  activityTitle: string;
  updatedAt?: string;
}

export interface DashboardData {
  inquiryCount: number;
  dealAmount: number;
  latestInquiry?: any;
  latestDeal?: any;
}
