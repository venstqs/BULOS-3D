// Settings that depend on how the app is being built or published.
const PROJECT_ID = 'e9142e41-5c3c-4c62-9b1f-330733d52242';

module.exports = ({ config }) => {
  const next = {
    ...config,
    updates: { ...config.updates, url: `https://u.expo.dev/${PROJECT_ID}` },
    // Expo Go runs any update made for its own SDK runtime. Installed builds follow the app version.
    runtimeVersion: process.env.EXPO_GO_UPDATE === '1' ? `exposdk:${config.sdkVersion ?? '58.0.0'}` : { policy: 'appVersion' },
  };
  // The phone-browser build lives under /app on the public site
  if (process.env.EXPO_BASE_URL) next.experiments = { ...config.experiments, baseUrl: process.env.EXPO_BASE_URL };
  return next;
};
