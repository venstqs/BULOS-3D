// The hosted phone-browser build lives under /app on the public site
module.exports = ({ config }) => (process.env.EXPO_BASE_URL
  ? { ...config, experiments: { ...config.experiments, baseUrl: process.env.EXPO_BASE_URL } }
  : config);
