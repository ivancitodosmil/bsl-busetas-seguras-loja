// Solo para la versión web (npx expo export -p web): react-native-maps no existe en el navegador.
// Aquí se dibuja un mapa real con Leaflet y OpenStreetMap, con la misma interfaz que usa la app:
// MapView (initialRegion, onRegionChangeComplete, fitToCoordinates, animateCamera, animateToRegion),
// Marker (círculo con el color de su vista) y Polyline (con trazo punteado si lo pide).
// En Android e iOS no se usa: allí va el mapa nativo de Google.
const React = require('react');
const { View } = require('react-native');

const LEAFLET = 'https://unpkg.com/leaflet@1.9.4/dist/';
let cargando = null;
function cargarLeaflet() {
  if (typeof window === 'undefined') return Promise.reject(new Error('sin ventana'));
  if (window.L) return Promise.resolve(window.L);
  if (cargando) return cargando;
  cargando = new Promise((resolver, fallar) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = LEAFLET + 'leaflet.css';
    document.head.appendChild(css);
    const js = document.createElement('script');
    js.src = LEAFLET + 'leaflet.js';
    js.onload = () => resolver(window.L);
    js.onerror = fallar;
    document.head.appendChild(js);
  });
  return cargando;
}

const zoomDe = (delta) => Math.max(3, Math.min(18, Math.round(Math.log2(360 / Math.max(delta || 0.01, 0.0005)))));
const deltaDe = (mapa) => {
  const b = mapa.getBounds();
  return { latitudeDelta: Math.abs(b.getNorth() - b.getSouth()), longitudeDelta: Math.abs(b.getEast() - b.getWest()) };
};

function Marker() { return null; }
function Polyline() { return null; }
function Circle() { return null; }

// Recorre los hijos (arreglos, fragmentos, nulos) y devuelve los marcadores y líneas a dibujar.
function capas(children, salida = { marcadores: [], lineas: [] }) {
  React.Children.forEach(children, (h) => {
    if (!h || typeof h !== 'object') return;
    if (h.type === Marker) salida.marcadores.push(h.props);
    else if (h.type === Polyline) salida.lineas.push(h.props);
    else if (h.props && h.props.children) capas(h.props.children, salida);
  });
  return salida;
}

// Color y tamaño del marcador a partir de la vista que la app dibuja dentro de él.
function estiloMarcador(props) {
  let fondo = '#1B4D89', borde = '#FFFFFF', tam = 26;
  const hijo = React.Children.toArray(props.children)[0];
  const st = hijo && hijo.props && hijo.props.style;
  const plano = Array.isArray(st) ? Object.assign({}, ...st.filter(Boolean)) : st || {};
  if (plano.backgroundColor) fondo = plano.backgroundColor;
  if (plano.borderColor) borde = plano.borderColor;
  if (plano.width) tam = Math.min(Number(plano.width) || 26, 46);
  return { fondo, borde, tam };
}

const MapView = React.forwardRef(function MapView(props, ref) {
  const { style, initialRegion, region, onRegionChangeComplete, onPress, scrollEnabled = true, zoomEnabled = true, children } = props;
  const caja = React.useRef(null);
  const mapa = React.useRef(null);
  const grupo = React.useRef(null);
  const alMover = React.useRef(onRegionChangeComplete);
  alMover.current = onRegionChangeComplete;
  const alTocar = React.useRef(onPress);
  alTocar.current = onPress;
  const [listo, setListo] = React.useState(false);

  React.useImperativeHandle(ref, () => ({
    fitToCoordinates(puntos, opciones) {
      const m = mapa.current;
      if (!m || !window.L || !puntos || puntos.length === 0) return;
      const p = (opciones && opciones.edgePadding) || {};
      m.fitBounds(window.L.latLngBounds(puntos.map((c) => [c.latitude, c.longitude])), {
        paddingTopLeft: [p.left || 30, p.top || 30], paddingBottomRight: [p.right || 30, p.bottom || 30], maxZoom: 17,
      });
    },
    animateCamera(cam) { if (mapa.current && cam && cam.center) mapa.current.panTo([cam.center.latitude, cam.center.longitude]); },
    animateToRegion(r) { if (mapa.current && r) mapa.current.setView([r.latitude, r.longitude], zoomDe(r.latitudeDelta)); },
    getCamera: async () => {
      const c = mapa.current ? mapa.current.getCenter() : { lat: -3.99, lng: -79.2 };
      return { center: { latitude: c.lat, longitude: c.lng } };
    },
  }));

  React.useEffect(() => {
    let vivo = true;
    cargarLeaflet().then((L) => {
      if (!vivo || !caja.current || mapa.current) return;
      const r = region || initialRegion || { latitude: -3.99, longitude: -79.2, latitudeDelta: 0.05 };
      const m = L.map(caja.current, { zoomControl: zoomEnabled, dragging: scrollEnabled, scrollWheelZoom: zoomEnabled, doubleClickZoom: zoomEnabled, touchZoom: zoomEnabled, attributionControl: true })
        .setView([r.latitude, r.longitude], zoomDe(r.latitudeDelta));
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(m);
      let porGesto = false;
      m.on('dragstart zoomstart', () => { porGesto = true; });
      m.on('moveend', () => {
        const c = m.getCenter();
        if (alMover.current) alMover.current({ latitude: c.lat, longitude: c.lng, ...deltaDe(m) }, { isGesture: porGesto });
        porGesto = false;
      });
      // Tocar el mapa entrega la coordenada como en react-native-maps (nativeEvent.coordinate).
      m.on('click', (e) => {
        if (alTocar.current) alTocar.current({ nativeEvent: { coordinate: { latitude: e.latlng.lat, longitude: e.latlng.lng } } });
      });
      grupo.current = L.layerGroup().addTo(m);
      mapa.current = m;
      // El contenedor puede medir 0 al montar: se recalcula el tamaño cuando ya se pintó.
      setTimeout(() => m.invalidateSize(), 200);
      setListo(true);
    }).catch(() => {});
    return () => { vivo = false; if (mapa.current) { mapa.current.remove(); mapa.current = null; } };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Redibuja marcadores y líneas en cada render.
  React.useEffect(() => {
    const L = window.L;
    if (!listo || !L || !grupo.current) return;
    grupo.current.clearLayers();
    const { marcadores, lineas } = capas(children);
    for (const l of lineas) {
      if (!l.coordinates || l.coordinates.length < 2) continue;
      L.polyline(l.coordinates.map((c) => [c.latitude, c.longitude]), {
        color: l.strokeColor || '#1B4D89', weight: l.strokeWidth || 5, lineCap: 'round', lineJoin: 'round',
        dashArray: l.lineDashPattern ? l.lineDashPattern.join(' ') : null,
      }).addTo(grupo.current);
    }
    for (const mk of marcadores) {
      if (!mk.coordinate) continue;
      const { fondo, borde, tam } = estiloMarcador(mk);
      const icono = L.divIcon({
        className: '',
        iconSize: [tam, tam],
        iconAnchor: [tam / 2, tam / 2],
        html: `<div style="width:${tam}px;height:${tam}px;border-radius:50%;background:${fondo};border:3px solid ${borde};box-sizing:border-box;box-shadow:0 1px 4px rgba(15,27,45,.35)"></div>`,
      });
      const marca = L.marker([mk.coordinate.latitude, mk.coordinate.longitude], { icon: icono, zIndexOffset: mk.zIndex ? mk.zIndex * 100 : 0 });
      if (mk.title) marca.bindTooltip(mk.title);
      marca.addTo(grupo.current);
    }
  });

  return React.createElement(
    View,
    { style: [{ backgroundColor: '#DCE6F0', overflow: 'hidden' }, style] },
    // zIndex 0 encierra las capas de Leaflet (z-index 400+) para que no tapen el pin ni los botones de la app.
    React.createElement('div', { ref: caja, style: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 0 } }),
  );
});

module.exports = MapView;
module.exports.default = MapView;
module.exports.Marker = Marker;
module.exports.Polyline = Polyline;
module.exports.Circle = Circle;
module.exports.PROVIDER_GOOGLE = 'google';
