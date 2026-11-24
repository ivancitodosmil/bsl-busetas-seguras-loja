// 54 · Resumen del recorrido, con "Compartir como PDF".
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { CircleCheck, FileText, MessageSquare } from 'lucide-react-native';
import { BannerAlerta, Boton, EsqueletoLista, EstadoError, Pantalla, PillEstado, Tarjeta, Texto, useToast } from '../../ui';
import { esp, useTema } from '../../tema';
import { chofer as servChofer } from '../../servicios/chofer';
import { viaje } from '../../servicios/viaje';
import { useSesion } from '../../estado/sesion';
import type { Ruta, Viaje } from '../../tipos';
import type { NavChofer, PilaChofer } from '../../navegacion/tipos';
import { fechaLarga, hora, listaNombres, mensajeError, nombreCompleto } from '../../utils';

const escapar = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export default function Resumen() {
  const { c } = useTema();
  const navigation = useNavigation<NavChofer>();
  const { tripId } = useRoute<RouteProp<PilaChofer, 'Resumen'>>().params;
  const toast = useToast();
  const usuario = useSesion((s) => s.usuario);
  const choferSesion = useSesion((s) => s.chofer);
  const [trip, setTrip] = useState<Viaje | null>(null);
  const [ruta, setRuta] = useState<Ruta | null>(null);
  const [falla, setFalla] = useState(false);
  const [compartiendo, setCompartiendo] = useState(false);
  const vivo = useRef(true);

  const cargar = useCallback(async () => {
    setFalla(false);
    try {
      // El resumen lo calcula el servidor al recibir "finalizado": si quedó en cola, se reintenta.
      for (let i = 0; i < 8 && vivo.current; i++) {
        if (i > 0) viaje.sincronizar().catch(() => {});
        const v = await viaje.obtener(tripId);
        setTrip(v);
        if (!ruta) servChofer.ruta(v.route_id).then((r) => vivo.current && setRuta(r)).catch(() => {});
        if (v.summary) return;
        await new Promise((ok) => setTimeout(ok, 2500));
      }
    } catch {
      if (vivo.current) setFalla(true);
    }
  }, [tripId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    vivo.current = true;
    cargar();
    return () => { vivo.current = false; };
  }, [cargar]);

  const s = trip?.summary ?? null;
  const nombreRuta = ruta?.name ?? 'Recorrido';
  const horario = trip ? `${hora(trip.started_at)} a ${trip.finished_at ? hora(trip.finished_at) : '—'}` : '';

  const compartir = async () => {
    if (!trip || !s) return;
    setCompartiendo(true);
    try {
      const fila = (a: string, b: string | number) => `<tr><td>${escapar(a)}</td><td class="v">${escapar(String(b))}</td></tr>`;
      const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>
        body{font-family:Helvetica,Arial,sans-serif;color:#0F1B2D;padding:36px;font-size:14px}
        h1{font-size:22px;margin:0 0 4px}.sub{color:#48596F;margin:0 0 24px}
        .marca{color:#1B4D89;font-weight:700;letter-spacing:.5px;margin-bottom:18px}
        table{width:100%;border-collapse:collapse;margin-bottom:22px}
        td{padding:10px 0;border-bottom:1px solid #D5DEEA}.v{text-align:right;font-weight:700}
        h2{font-size:15px;margin:0 0 8px}li{margin-bottom:4px}.pie{color:#5A6A80;font-size:12px;margin-top:28px}
      </style></head><body>
        <div class="marca">Busetas Seguras Loja</div>
        <h1>${escapar(nombreRuta)}</h1>
        <p class="sub">${escapar(fechaLarga(trip.date))}, ${escapar(horario)}</p>
        <table>
          ${fila('Chofer', nombreCompleto(usuario) || '—')}
          ${fila('Vehículo', [choferSesion?.vehicle_brand, choferSesion?.vehicle_model, choferSesion?.plate_number].filter(Boolean).join(', ') || '—')}
          ${fila('Niños transportados', `${s.boarded} de ${s.students}`)}
          ${fila('Entregados', s.delivered)}
          ${fila('Ausentes', s.absent)}
          ${fila('Paradas', s.stops)}
          ${fila('Hora de inicio', hora(trip.started_at))}
          ${fila('Hora de llegada', trip.finished_at ? hora(trip.finished_at) : '—')}
          ${fila('Duración', `${s.duration_min} min`)}
          ${s.delay_min ? fila('Retraso máximo', `${s.delay_min} min`) : ''}
        </table>
        ${s.pending.length ? `<h2>Sin entrega registrada</h2><ul>${s.pending.map((n) => `<li>${escapar(n)}</li>`).join('')}</ul>` : ''}
        ${s.messages.length ? `<h2>Mensajes enviados</h2><ul>${s.messages.map((m) => `<li>«${escapar(m)}»</li>`).join('')}</ul>` : ''}
        <p class="pie">Resumen generado por BSL el ${escapar(fechaLarga(undefined, false))}.</p>
      </body></html>`;
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `Resumen de ${nombreRuta}`, UTI: 'com.adobe.pdf' });
      } else {
        toast.mostrar('Este dispositivo no permite compartir archivos.', { tipo: 'error' });
      }
    } catch (e) {
      toast.mostrar(mensajeError(e, 'No pudimos crear el PDF.'), { tipo: 'error' });
    } finally {
      setCompartiendo(false);
    }
  };

  const alInicio = () => navigation.reset({ index: 0, routes: [{ name: 'Pestanas', params: { screen: 'Inicio' } }] });

  const cifra = (valor: string | number, etiqueta: string, borde: boolean) => (
    <View style={{ flex: 1, alignItems: 'center', gap: 2, paddingVertical: esp.md, borderLeftWidth: borde ? 1 : 0, borderLeftColor: c.border }}>
      <Texto v="cifra">{valor}</Texto>
      <Texto v="nota" color="text2" centro>{etiqueta}</Texto>
    </View>
  );
  const linea = (etiqueta: string, valor: string, ultima?: boolean) => (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: ultima ? 0 : 1, borderBottomColor: c.border }}>
      <Texto v="cuerpo" color="text2">{etiqueta}</Texto>
      <Texto v="fuerte" style={{ fontVariant: ['tabular-nums'] }}>{valor}</Texto>
    </View>
  );

  return (
    <Pantalla
      titulo="Resumen del recorrido"
      onAtras={alInicio}
      pie={
        <>
          <Boton titulo="Compartir como PDF" icono={FileText} tamano="conduccion" onPress={compartir} cargando={compartiendo} deshabilitado={!s} />
          <Boton titulo="Volver al inicio" variante="secundario" tamano="conduccion" onPress={alInicio} />
        </>
      }
    >
      {falla ? (
        <Tarjeta><EstadoError onReintentar={cargar} /></Tarjeta>
      ) : !trip ? (
        <EsqueletoLista filas={2} />
      ) : (
        <>
          <Tarjeta elevacion={2}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <CircleCheck size={32} color={c.success} strokeWidth={2} />
              <View style={{ flex: 1 }}>
                <Texto v="subtitulo">{nombreRuta} finalizado</Texto>
                <Texto v="medio" color="text2">{fechaLarga(trip.date, false)}, {horario}</Texto>
              </View>
              {s ? <PillEstado estado="finalizado" /> : <PillEstado estado="pendiente" texto="Sincronizando" />}
            </View>
            {s ? (
              <>
                <View style={{ flexDirection: 'row', marginTop: esp.lg, borderTopWidth: 1, borderTopColor: c.border }}>
                  {cifra(s.boarded, 'niños transportados', false)}
                  {cifra(s.absent, 'ausentes', true)}
                </View>
                <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: c.border }}>
                  {cifra(`${s.duration_min} min`, 'duración', false)}
                  {cifra(s.stops, 'paradas', true)}
                </View>
              </>
            ) : null}
          </Tarjeta>

          {!s ? (
            <BannerAlerta
              tipo="aviso"
              titulo="Pendiente de sincronizar"
              texto="El recorrido se cerrará en el servidor cuando vuelva la señal. Ya puedes guardar el teléfono."
              accion="Reintentar"
              onAccion={cargar}
            />
          ) : null}

          {s && s.pending.length > 0 ? (
            <BannerAlerta
              tipo="aviso"
              titulo={`${s.pending.length === 1 ? 'Quedó 1 niño' : `Quedaron ${s.pending.length} niños`} sin entrega registrada`}
              texto={listaNombres(s.pending)}
            />
          ) : null}

          <Tarjeta>
            {linea('Hora de inicio', hora(trip.started_at))}
            {linea('Hora de llegada', trip.finished_at ? hora(trip.finished_at) : 'Pendiente', !s?.delay_min && !s)}
            {s ? linea('Entregados', `${s.delivered} de ${s.boarded}`, !s.delay_min) : null}
            {s?.delay_min ? linea('Retraso máximo', `${s.delay_min} min`, true) : null}
          </Tarjeta>

          {s ? (
            <Tarjeta>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: esp.sm }}>
                <MessageSquare size={18} color={c.text2} strokeWidth={2} />
                <Texto v="seccion">Mensajes enviados</Texto>
              </View>
              {s.messages.length === 0 ? (
                <Texto v="medio" color="text2">No enviaste mensajes en este recorrido.</Texto>
              ) : (
                s.messages.map((m, i) => <Texto key={i} v="cuerpo" style={{ paddingVertical: 4 }}>«{m}»</Texto>)
              )}
            </Tarjeta>
          ) : null}
        </>
      )}
    </Pantalla>
  );
}
