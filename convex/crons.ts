import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();
const digestsApi = internal.digests as any;
const xBookmarksApi = (internal as any).xBookmarks;

crons.interval("sync-x-bookmarks", { hours: 12 }, xBookmarksApi.runScheduledSync, {});

crons.interval(
  "generate-daily-digest",
  { hours: 24 },
  digestsApi.generateDigest,
  { period: "daily" }
);

crons.interval(
  "generate-weekly-digest",
  { hours: 168 },
  digestsApi.generateDigest,
  { period: "weekly" }
);

export default crons;
