import { defineCliConfig } from 'sanity/cli';

export default defineCliConfig({
  api: {
    projectId: process.env.SANITY_STUDIO_PROJECT_ID,
    dataset: process.env.SANITY_STUDIO_DATASET,
  },
  studioHost: process.env.SANITY_STUDIO_HOSTNAME || undefined,
  deployment: {
    appId: process.env.SANITY_STUDIO_APP_ID || undefined,
    autoUpdates: true,
  },
});
