// Solo en la versión web y en pantallas grandes (laptop o computadora):
// a la izquierda, la marca BSL con una animación de la ruta (la buseta avanza de la casa a la escuela
// y aparecen los avisos) y las cuentas de prueba; a la derecha, la app del ancho de un celular.
// En un celular real (menos de 600 px de ancho) no se muestra nada de esto.
//
// El body es el "celular": su transform hace que las hojas y la alarma (position: fixed) queden
// dentro de él. Por eso el panel de la izquierda va fuera del body, colgado del <html>.

const AZUL = '#1B4D89';
const MARINO = '#123A68';
const AMBAR = '#F5A524';
const VERDE = '#1E9E62';
const TINTA = '#0F1B2D';
const TINTA2 = '#3A4A60';

const DURACION = 9; // segundos de un recorrido completo de la animación
const RUTA = 'M 24 150 C 110 40, 190 40, 250 110 S 380 190, 456 70';
const PARADAS = [
  { f: 0, nombre: 'Tu casa' },
  { f: 0.36, nombre: 'Martín' },
  { f: 0.66, nombre: 'Sofi' },
  { f: 1, nombre: 'Escuela' },
];

const ICONO_BUS =
  '<path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/>' +
  '<path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/>' +
  '<circle cx="7" cy="18" r="2"/><path d="M9 18h5"/><circle cx="16" cy="18" r="2"/>';

const CSS = `
  @media (min-width: 600px) {
    html { background: #DCE3EC; }
    body {
      max-width: 430px; height: min(100vh, 932px); margin: 0 auto; position: relative;
      top: max(0px, calc((100vh - 932px) / 2));
      transform: translateZ(0); overflow: hidden; background: #F3F6FA;
      box-shadow: 0 30px 80px rgba(18, 58, 104, 0.28), 0 0 0 1px rgba(18, 58, 104, 0.08);
      border-radius: 28px;
    }
    #root { height: 100%; }
  }
  @media (min-width: 600px) and (max-height: 940px) { body { border-radius: 0; } }

  #bsl-escaparate { display: none; }
  @media (min-width: 1100px) {
    html {
      background:
        radial-gradient(1200px 700px at 15% 20%, #E8EFF8 0%, transparent 60%),
        #DCE3EC;
    }
    body { margin: 0 0 0 calc(max(32px, (100vw - 1060px) / 2) + 630px); }
    #bsl-escaparate {
      display: flex; flex-direction: column; justify-content: center; gap: 28px;
      position: fixed; top: 0; bottom: 0; left: max(32px, calc((100vw - 1060px) / 2)); width: 520px;
      font-family: Inter_400Regular, system-ui, sans-serif; color: ${TINTA};
    }
  }
  #bsl-escaparate .marca { display: flex; align-items: center; gap: 14px; }
  #bsl-escaparate .logo {
    width: 64px; height: 64px; border-radius: 18px; background: ${MARINO};
    display: grid; place-items: center; box-shadow: 0 10px 24px rgba(18, 58, 104, 0.3);
  }
  #bsl-escaparate .nombre { font-family: Manrope_800ExtraBold, system-ui; font-size: 28px; line-height: 1; letter-spacing: -0.5px; }
  #bsl-escaparate .bajada { font-size: 15px; color: ${TINTA2}; margin-top: 4px; }
  #bsl-escaparate h1 {
    margin: 0; font-family: Manrope_800ExtraBold, system-ui; font-weight: 800;
    font-size: 46px; line-height: 1.08; letter-spacing: -1.4px; color: ${TINTA}; max-width: 500px;
  }
  #bsl-escaparate .lienzo {
    position: relative; width: 480px; height: 272px; border-radius: 24px; background: #FFFFFF;
    box-shadow: 0 14px 40px rgba(18, 58, 104, 0.12);
  }
  #bsl-escaparate .lienzo svg { position: absolute; left: 0; top: 46px; }
  #bsl-escaparate .aviso {
    position: absolute; display: flex; align-items: center; gap: 10px;
    padding: 10px 14px; border-radius: 14px; background: ${TINTA}; color: #FFFFFF;
    font-family: Inter_600SemiBold, system-ui; font-size: 14px; white-space: nowrap;
    box-shadow: 0 10px 24px rgba(15, 27, 45, 0.25); opacity: 0; transform: translateY(8px);
  }
  #bsl-escaparate .aviso i { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
  #bsl-escaparate .a1 { left: 18px; top: 14px; animation: bsl-a1 ${DURACION}s ease-in-out infinite; }
  #bsl-escaparate .a2 { left: 18px; top: 14px; animation: bsl-a2 ${DURACION}s ease-in-out infinite; }
  #bsl-escaparate .a3 { left: 18px; top: 14px; animation: bsl-a3 ${DURACION}s ease-in-out infinite; }
  @keyframes bsl-a1 { 0%,14% { opacity: 0; transform: translateY(8px); } 18%,30% { opacity: 1; transform: none; } 34%,100% { opacity: 0; transform: translateY(-6px); } }
  @keyframes bsl-a2 { 0%,36% { opacity: 0; transform: translateY(8px); } 40%,58% { opacity: 1; transform: none; } 62%,100% { opacity: 0; transform: translateY(-6px); } }
  @keyframes bsl-a3 { 0%,88% { opacity: 0; transform: translateY(8px); } 92%,98% { opacity: 1; transform: none; } 100% { opacity: 0; } }
  #bsl-escaparate ul { margin: 0; padding: 0; list-style: none; display: grid; gap: 12px; }
  #bsl-escaparate li { display: flex; align-items: center; gap: 12px; font-size: 16px; color: ${TINTA2}; }
  #bsl-escaparate li b { color: ${TINTA}; font-family: Inter_600SemiBold, system-ui; font-weight: 600; }
  #bsl-escaparate .punto { width: 28px; height: 28px; border-radius: 9px; display: grid; place-items: center; flex: none; }
  #bsl-escaparate .prueba {
    border-radius: 16px; background: rgba(255, 255, 255, 0.7); border: 1px solid #C9D5E4;
    padding: 14px 16px; font-size: 14px; color: ${TINTA2}; display: grid; gap: 4px; max-width: 480px;
  }
  #bsl-escaparate .prueba b { color: ${TINTA}; font-family: Inter_600SemiBold, system-ui; font-weight: 600; }
  #bsl-escaparate .prueba code { font-family: ui-monospace, Menlo, monospace; font-size: 13px; color: ${AZUL}; }
  #bsl-escaparate > * { flex-shrink: 0; }
  @media (min-width: 1100px) and (max-height: 840px) {
    #bsl-escaparate { gap: 18px; }
    #bsl-escaparate h1 { font-size: 36px; }
    #bsl-escaparate ul { display: none; }
  }
  @media (min-width: 1100px) and (max-height: 640px) {
    #bsl-escaparate .prueba { display: none; }
  }
  @media (prefers-reduced-motion: reduce) {
    #bsl-escaparate .aviso { animation: none; opacity: 1; transform: none; }
    #bsl-escaparate .a1, #bsl-escaparate .a2 { display: none; }
  }
`;

function svgRuta(): string {
  const reducido = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const anim = (atributos: string) => (reducido ? '' : atributos);
  // Las paradas se ubican sobre la curva después de montarla (getPointAtLength).
  const paradas = PARADAS.map((p, i) => {
    const escuela = i === PARADAS.length - 1;
    const relleno = escuela ? AZUL : '#FFFFFF';
    const pintar = escuela || p.f === 0
      ? ''
      : anim(`<animate attributeName="fill" values="#FFFFFF;#FFFFFF;${VERDE};${VERDE}" keyTimes="0;${p.f};${p.f + 0.01};1" dur="${DURACION}s" repeatCount="indefinite"/>`);
    return `<g class="parada" data-f="${p.f}">
      ${p.f === 0 ? anim(`<circle r="10" fill="${AMBAR}" opacity="0.35"><animate attributeName="r" values="10;22;10" dur="1.8s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.4;0;0.4" dur="1.8s" repeatCount="indefinite"/></circle>`) : ''}
      <circle r="${escuela ? 11 : 9}" fill="${p.f === 0 ? AMBAR : relleno}" stroke="${escuela ? '#FFFFFF' : AZUL}" stroke-width="3">${pintar}</circle>
      <text y="${p.f === 0 || escuela ? 30 : -18}" text-anchor="middle" font-family="Inter_600SemiBold, system-ui" font-size="12" fill="${TINTA2}">${p.nombre}</text>
    </g>`;
  }).join('');
  return `<svg viewBox="0 0 480 220" width="480" height="220" aria-hidden="true">
    <path d="${RUTA}" fill="none" stroke="#E3ECF8" stroke-width="10" stroke-linecap="round"/>
    <path d="${RUTA}" fill="none" stroke="${AZUL}" stroke-width="6" stroke-linecap="round" pathLength="100"
      stroke-dasharray="100" stroke-dashoffset="${reducido ? 34 : 100}">
      ${anim(`<animate attributeName="stroke-dashoffset" values="100;0;0" keyTimes="0;0.86;1" dur="${DURACION}s" repeatCount="indefinite"/>`)}
    </path>
    ${paradas}
    <g class="buseta">
      ${anim(`<animateMotion dur="${DURACION}s" repeatCount="indefinite" path="${RUTA}" keyPoints="0;1;1" keyTimes="0;0.86;1" calcMode="linear"/>`)}
      <circle r="20" fill="${AMBAR}" stroke="#FFFFFF" stroke-width="4"/>
      <g transform="translate(-12 -12)" fill="none" stroke="${TINTA}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONO_BUS}</g>
    </g>
  </svg>`;
}

const icono = (color: string, trazo: string) =>
  `<span class="punto" style="background:${color}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${trazo}</svg></span>`;

export function montarEscaparate() {
  if (typeof document === 'undefined' || document.getElementById('bsl-escaparate')) return;
  const estilo = document.createElement('style');
  estilo.textContent = CSS;
  document.head.appendChild(estilo);

  const panel = document.createElement('aside');
  panel.id = 'bsl-escaparate';
  panel.setAttribute('aria-label', 'BSL, Busetas Seguras Loja');
  panel.innerHTML = `
    <div class="marca">
      <div class="logo"><svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="${AMBAR}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONO_BUS}</svg></div>
      <div><div class="nombre">BSL</div><div class="bajada">Busetas Seguras Loja</div></div>
    </div>
    <h1>Sigue la buseta de tus hijos parada por parada.</h1>
    <div class="lienzo">
      ${svgRuta()}
      <div class="aviso a1"><i style="background:${AMBAR}"></i>La buseta está a 1 km de tu casa</div>
      <div class="aviso a2"><i style="background:${VERDE}"></i>Martín subió a las 06:42</div>
      <div class="aviso a3"><i style="background:${AZUL}"></i>Llegaron a la escuela</div>
    </div>
    <ul>
      <li>${icono(AMBAR, '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>')}<span><b>Aviso a 1 km y a 500 m</b> de tu casa, con el GPS real</span></li>
      <li>${icono(VERDE, '<path d="M20 6 9 17l-5-5"/>')}<span><b>Confirmación</b> cuando tu hijo sube y llega</span></li>
      <li>${icono(AZUL, '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/>')}<span><b>Ausencias</b> sin llamar al chofer</span></li>
    </ul>
    <div class="prueba">
      <b>Prueba la app aquí al lado</b>
      <span>Representante: <code>monica@bsl.app</code></span>
      <span>Chofer: <code>rodrigo@bsl.app</code></span>
      <span>Contraseña: <code>Bsl2026demo</code></span>
    </div>`;
  document.documentElement.appendChild(panel);

  // Coloca las paradas sobre la curva.
  const curva = panel.querySelector('.lienzo svg path') as SVGPathElement | null;
  if (curva) {
    const largo = curva.getTotalLength();
    panel.querySelectorAll<SVGGElement>('g.parada').forEach((g) => {
      const p = curva.getPointAtLength(largo * Number(g.dataset.f));
      g.setAttribute('transform', `translate(${p.x} ${p.y})`);
    });
    const buseta = panel.querySelector('g.buseta') as SVGGElement | null;
    if (buseta && !buseta.querySelector('animateMotion')) {
      const p = curva.getPointAtLength(largo * 0.66);
      buseta.setAttribute('transform', `translate(${p.x} ${p.y})`);
    }
  }
}
