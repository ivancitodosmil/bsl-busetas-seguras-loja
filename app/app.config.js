// Extiende app.json e inyecta la clave de Google Maps desde .env (que no se sube a git).
// EXPO_BASE_URL (opcional): ruta donde se publica la versión web, p. ej. /bsl-busetas-seguras-loja en GitHub Pages.
module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    config: { ...config.android?.config, googleMaps: { apiKey: process.env.GOOGLE_MAPS_API_KEY } },
  },
  experiments: {
    ...config.experiments,
    ...(process.env.EXPO_BASE_URL ? { baseUrl: process.env.EXPO_BASE_URL } : {}),
  },
});
