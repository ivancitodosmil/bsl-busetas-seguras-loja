// Sustituto de los módulos nativos (ubicación, tareas) para ejecutar las pruebas en Node.
module.exports = new Proxy(
  { __esModule: true, defineTask() {}, Accuracy: {}, ActivityType: {} },
  { get: (t, k) => (k in t ? t[k] : () => {}) },
);
