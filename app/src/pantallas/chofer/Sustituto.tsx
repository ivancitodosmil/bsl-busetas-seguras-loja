// Delegar a un chofer sustituto verificado y seguir el estado de las solicitudes.
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Search, UserRoundSearch } from 'lucide-react-native';
import {
  Avatar, BannerAlerta, Boton, CampoTexto, Chip, ConTeclado, EsqueletoLista, EstadoVacio, ModalConfirmar, Pantalla, PillEstado,
  Tarjeta, Texto, TituloSeccion, useToast, type Estado,
} from '../../ui';
import { esp, useTema } from '../../tema';
import { chofer } from '../../servicios/chofer';
import { useSesion } from '../../estado/sesion';
import type { NavChofer } from '../../navegacion/tipos';
import type { AlcanceAusencia, ChoferEncontrado, Sustitucion } from '../../tipos';
import { diaRelativo, fechaCorta, hoyISO, mensajeError, nombreCompleto, textoAlcance } from '../../utils';
import { opcionesFecha, useCarga } from './_c1Partes';

type Fila = Sustitucion & { substitute: { first_name: string; last_name: string; photo_url: string | null } | null };

const ESTADO: Record<Sustitucion['status'], { pill: Estado; texto: string }> = {
  requested: { pill: 'pendiente', texto: 'Pendiente' },
  accepted: { pill: 'verificado', texto: 'Aceptó' },
  rejected: { pill: 'rechazado', texto: 'Rechazó' },
  revoked: { pill: 'sin_servicio', texto: 'Revocada' },
};

export default function Sustituto() {
  const nav = useNavigation<NavChofer>();
  const { c } = useTema();
  const toast = useToast();
  const idChofer = useSesion((s) => s.idSesion);
  const fechas = useMemo(opcionesFecha, []);

  const [texto, setTexto] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [resultados, setResultados] = useState<ChoferEncontrado[] | null>(null);
  const [elegido, setElegido] = useState<ChoferEncontrado | null>(null);
  const [errBusqueda, setErrBusqueda] = useState<string | null>(null);
  const [fecha, setFecha] = useState(fechas[1].iso);
  const [alcance, setAlcance] = useState<AlcanceAusencia>('all');
  const [enviando, setEnviando] = useState(false);
  const [revocar, setRevocar] = useState<Fila | null>(null);
  const [revocando, setRevocando] = useState(false);

  const { datos: solicitudes, cargando, refrescando, recargar, refrescar } = useCarga<Fila[]>(() =>
    idChofer ? chofer.sustituciones(idChofer, hoyISO()) : Promise.resolve([]),
  );

  async function buscar() {
    const q = texto.trim();
    if (q.replace(/\D/g, '').length < 9 && !q.includes('@')) {
      setErrBusqueda('Escribe el celular completo o el correo del chofer.');
      return;
    }
    setErrBusqueda(null);
    setBuscando(true);
    setElegido(null);
    try {
      const r = await chofer.buscarSustituto(q);
      setResultados(r);
      if (r.length === 1) setElegido(r[0]);
    } catch (e) {
      setErrBusqueda(mensajeError(e));
    } finally {
      setBuscando(false);
    }
  }

  async function enviar() {
    if (!elegido || !idChofer) return;
    setEnviando(true);
    try {
      await chofer.solicitarSustituto(idChofer, elegido.id, fecha, alcance);
      toast.mostrar(`Solicitud enviada a ${elegido.name.split(' ')[0]}. Te avisamos cuando responda.`, { tipo: 'exito' });
      setElegido(null);
      setResultados(null);
      setTexto('');
      await recargar();
    } catch (e) {
      toast.mostrar(mensajeError(e), { tipo: 'error' });
    } finally {
      setEnviando(false);
    }
  }

  async function confirmarRevocar() {
    if (!revocar) return;
    setRevocando(true);
    try {
      await chofer.revocarSustitucion(revocar.id);
      setRevocar(null);
      toast.mostrar('Autorización revocada.', { tipo: 'info' });
      await recargar();
    } catch (e) {
      toast.mostrar(mensajeError(e), { tipo: 'error' });
    } finally {
      setRevocando(false);
    }
  }

  const yaHay = solicitudes?.find((s) => s.date === fecha && (s.status === 'requested' || s.status === 'accepted'));

  return (
    <ConTeclado>
      <Pantalla titulo="Chofer sustituto" onAtras={() => nav.goBack()} refrescando={refrescando} onRefrescar={refrescar}>
        <Tarjeta estilo={{ gap: esp.md }}>
          <CampoTexto
            etiqueta="Buscar chofer verificado"
            value={texto}
            onChangeText={(t) => { setTexto(t); setErrBusqueda(null); }}
            placeholder="+593 99 555 1212 o correo"
            ayuda="Por celular o correo. Solo aparecen cuentas verificadas."
            error={errBusqueda}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            returnKeyType="search"
            onSubmitEditing={buscar}
          />
          <Boton titulo="Buscar" icono={Search} variante="secundario" cargando={buscando} onPress={buscar} />

          {resultados && resultados.length === 0 ? (
            <EstadoVacio icono={UserRoundSearch} titulo="No encontramos un chofer verificado con ese dato" texto="Revisa el número o pídele que complete su verificación en BSL." compacto />
          ) : null}

          {(resultados ?? []).map((r) => {
            const sel = elegido?.id === r.id;
            return (
              <Tarjeta key={r.id} plano onPress={() => setElegido(r)} etiqueta={`Elegir a ${r.name}`} estilo={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 2, borderColor: sel ? c.primary : 'transparent' }}>
                <Avatar nombre={r.name} foto={r.photo_url} tam={44} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Texto v="fuerte">{r.name}</Texto>
                  <Texto v="nota" color="text2">{[r.vehicle, r.color?.toLowerCase(), r.plate].filter(Boolean).join(', ')}</Texto>
                </View>
                <PillEstado estado="verificado" />
              </Tarjeta>
            );
          })}
        </Tarjeta>

        {elegido ? (
          <Tarjeta estilo={{ gap: esp.md }}>
            <Texto v="medioFuerte" color="text2">Fecha</Texto>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {fechas.map((f) => <Chip key={f.iso} texto={f.texto} seleccionado={fecha === f.iso} onPress={() => setFecha(f.iso)} />)}
            </View>
            <Texto v="medioFuerte" color="text2">Recorridos</Texto>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {([['all', 'Ida y vuelta'], ['pickup', 'Solo ida'], ['dropoff', 'Solo vuelta']] as const).map(([v, t]) => (
                <Chip key={v} texto={t} seleccionado={alcance === v} onPress={() => setAlcance(v)} />
              ))}
            </View>
            {yaHay ? (
              <BannerAlerta tipo="aviso" titulo={`Ya tienes una solicitud para ${diaRelativo(fecha)}`} texto="Si envías esta, reemplaza a la anterior." />
            ) : null}
            <Boton titulo={`Enviar solicitud a ${elegido.name.split(' ')[0]}`} cargando={enviando} onPress={enviar} />
            <Texto v="nota" color="text2">Los representantes reciben el aviso con 12 horas de anticipación cuando es posible. La autorización caduca al terminar el día.</Texto>
          </Tarjeta>
        ) : null}

        <TituloSeccion titulo="Solicitudes" />
        {cargando && !solicitudes ? (
          <EsqueletoLista filas={1} />
        ) : !solicitudes || solicitudes.length === 0 ? (
          <Tarjeta><Texto v="medio" color="text2">No tienes solicitudes para hoy ni para los próximos días.</Texto></Tarjeta>
        ) : (
          solicitudes.map((s) => {
            const nombre = nombreCompleto(s.substitute) || 'Chofer';
            const e = ESTADO[s.status];
            return (
              <Tarjeta key={s.id} estilo={{ gap: esp.md }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <Avatar nombre={nombre} foto={s.substitute?.photo_url} tam={44} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Texto v="fuerte">{nombre}</Texto>
                    <Texto v="nota" color="text2">
                      {s.date === hoyISO() ? 'Hoy' : fechaCorta(s.date)}, {s.scope === 'all' ? 'Ida y vuelta' : textoAlcance(s.scope)}
                    </Texto>
                  </View>
                  <PillEstado estado={e.pill} texto={e.texto} />
                </View>
                {s.status === 'accepted' ? (
                  <Texto v="medio" color="text2">Los representantes ya recibieron su foto, nombre y placa.</Texto>
                ) : null}
                {s.status === 'requested' || s.status === 'accepted' ? (
                  <Boton titulo={s.status === 'accepted' ? 'Revocar autorización' : 'Cancelar solicitud'} variante="peligro" tamano="compacto" onPress={() => setRevocar(s)} />
                ) : null}
              </Tarjeta>
            );
          })
        )}
      </Pantalla>

      <ModalConfirmar
        visible={!!revocar}
        titulo={revocar?.status === 'accepted' ? '¿Revocar la autorización?' : '¿Cancelar la solicitud?'}
        mensaje={revocar ? `${nombreCompleto(revocar.substitute) || 'El chofer'} ya no podrá conducir tus rutas ${diaRelativo(revocar.date)}. Le avisamos al instante.` : undefined}
        confirmar={revocar?.status === 'accepted' ? 'Revocar' : 'Cancelar solicitud'}
        cancelar="Volver"
        peligro
        cargando={revocando}
        onConfirmar={confirmarRevocar}
        onCancelar={() => setRevocar(null)}
      />
    </ConTeclado>
  );
}
