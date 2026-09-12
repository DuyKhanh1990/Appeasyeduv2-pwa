const fs = require("fs");
const path = require("path");

module.exports = ({ config }) => {
  const envGoogleServicesFile = process.env.GOOGLE_SERVICES_JSON;
  const localGoogleServicesFile = path.join(__dirname, "google-services.json");

  let googleServicesFile = undefined;
  if (envGoogleServicesFile && fs.existsSync(envGoogleServicesFile)) {
    googleServicesFile = envGoogleServicesFile;
  } else if (fs.existsSync(localGoogleServicesFile)) {
    googleServicesFile = "./google-services.json";
  }

  return {
    ...config,
    android: {
      ...config.android,
      googleServicesFile,
    },
  };
};
