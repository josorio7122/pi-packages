export interface SearchConfig {
  roles: string[];
  stack: string[];
  location: string[];
  newOnly: boolean;
  limit: number;
}

export interface RawDiscovery {
  url: string;
  strategy: "ats" | "funded" | "general";
  role: string;
  snippet?: string;
}

export interface Job {
  id: string;
  url: string;
  title: string;
  company: string;
  location: string;
  remote: string | null;
  salary: string | null;
  jobType: string | null;
  description: string;
  requirements: string[];
  techStack: string[];
  applyUrl: string | null;
  strategy: "ats" | "funded" | "general";
  role: string;
  discoveredAt: string;
}

export interface TrackedJob extends Job {
  status: "new" | "saved" | "applied" | "rejected" | "offer" | "archived";
  seenAt: string;
  updatedAt: string;
  notes: string;
}

export interface Store {
  version: 1;
  jobs: Record<string, TrackedJob>;
}
