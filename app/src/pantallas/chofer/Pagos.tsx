// Pagos: registro manual de la mensualidad. Un toque cambia Pagado / Pendiente. Sin pasarela.
import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Check, ChevronLeft, ChevronRight, CircleDollarSign, Clock } from 'lucide-react-native';
import { Avatar, BotonIcono, EsqueletoLista, EstadoError, EstadoVacio, Pantalla, Tarjeta, Texto, useToast } from '../../ui';
import { esp, fuentes, radio, useTema } from '../../tema';
import { chofer, type EstudianteLista } from '../../servicios/chofer';
import { useSesion } from '../../estado/sesion';
import type { NavChofer } from '../../navegacion/tipos';
import type { Pago } from '../../tipos';
import { dinero, fechaDe, hora, hoyISO, mensajeError, MESES } from '../../utils';
import { mesISO, useCarga } from './_c1Partes';

const DIA_CORTE = 5;

export default function Pagos() {
  const nav = useNavigation<NavChofer>();
  const { c } = useTema();
  const toast = useToast();
  const yo = useSesion((s) => s.idSesion);
  const mesActual = useMemo(() => mesISO(hoyISO()), []);
  const [periodo, setPeriodo] = useState(mesActual);

  const { datos, setDatos, cargando, refrescando, error, recargar, refrescar } = useCarga(async () => {
    const [estudiantes, pagos] = await Promise.all([chofer.estudiantes(), chofer.pagos(periodo)]);
    return { estudiantes: estudiantes as EstudianteLista[], pagos: pagos as Pago[] };
  });

  const nMes = Number(periodo.slice(5, 7)) - 1;
  const tituloMes = `${MESES[nMes].replace(/^./, (l) => l.toUpperCase())} ${periodo.slice(0, 4)}`;
  const esFuturo = periodo > mesActual;

  function irA(d: number) {
    setPeriodo(mesISO(periodo, d));
    setDatos(null);
    setTimeout(() => recargar(), 0);
  }

  const pagoDe = (id: string) => datos?.pagos.find((p) => p.student_id === id);
  const pagados = (datos?.estudiantes ?? []).filter((e) => pagoDe(e.id)?.status === 'paid');
  const cobrado = pagados.reduce((n, e) => n + Number(pagoDe(e.id)?.amount ?? e.monthly_fee), 0);

  async function alternar(e: EstudianteLista, silencioso = false) {
    if (!yo || !datos) return;
    const previo = pagoDe(e.id);
    const pagar = previo?.status !== 'paid';
    const optimista: Pago = {
      id: previo?.id ?? `tmp-${e.id}`, student_id: e.id, driver_id: yo, period: periodo,
      amount: Number(previo?.amount ?? e.monthly_fee), status: pagar ? 'paid' : 'pending', paid_at: pagar ? new Date().toISOString() : null,
    };
    const poner = (p: Pago | undefined) =>
      setDatos((d) => (d ? { ...d, pagos: [...d.pagos.filter((x) => x.student_id !== e.id), ...(p ? [p] : [])] } : d));
    poner(optimista);
    try {
      const real = await chofer.marcarPago(yo, e.id, periodo, pagar, optimista.amount);
      poner(real);
      if (!silencioso) {
        toast.mostrar(pagar ? `${e.first_name}: pagado, ${dinero(optimista.amount)}` : `${e.first_name}: pendiente`, {
          tipo: pagar ? 'exito' : 'info',
          deshacer: () => alternarDe(e.id),
        });
      }
    } catch (err) {
      poner(previo);
      toast.mostrar(mensajeError(err), { tipo: 'error' });
    }
  }
  // "Deshacer" vuelve a alternar con el estado más reciente.
  const ref = React.useRef(alternar);
  ref.current = alternar;
  const alternarDe = (id: string) => {
    const e = datos?.estudiantes.find((x) => x.id === id);
    if (e) ref.current(e, true);
  };

  function detalle(e: EstudianteLista): string {
    const p = pagoDe(e.id);
    const monto = dinero(Number(p?.amount ?? e.monthly_fee));
    if (p?.status === 'paid' && p.paid_at) {
      const f = fechaDe(p.paid_at);
      return `${monto}, pagado el ${Number(f.slice(8, 10))} ${MESES[Number(f.slice(5, 7)) - 1].slice(0, 3)} ${hora(p.paid_at)}`;
    }
    const corte = `${periodo.slice(0, 8)}${String(DIA_CORTE).padStart(2, '0')}`;
    return hoyISO() > corte ? `${monto}, pendiente desde el ${DIA_CORTE} ${MESES[nMes].slice(0, 3)}` : `${monto}, pendiente`;
  }

  return (
    <Pantalla titulo="Pagos" conBarra refrescando={refrescando} onRefrescar={refrescar}>
      <Tarjeta elevacion={2} estilo={{ gap: esp.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <BotonIcono icono={ChevronLeft} etiqueta="Mes anterior" onPress={() => irA(-1)} />
          <Texto v="subtitulo" centro style={{ flex: 1 }} accessibilityLiveRegion="polite">{tituloMes}</Texto>
          <BotonIcono icono={ChevronRight} etiqueta="Mes siguiente" onPress={esFuturo ? undefined : () => irA(1)} color={esFuturo ? c.border : undefined} />
        </View>
        <View style={{ flexDirection: 'row' }}>
          <View style={{ flex: 1.4 }}>
            <Texto v="cifra" style={{ fontSize: 30, lineHeight: 36 }}>{dinero(cobrado)}</Texto>
            <Texto v="nota" color="text2">cobrado, {pagados.length} de {datos?.estudiantes.length ?? 0}</Texto>
          </View>
          <View style={{ width: 1, backgroundColor: c.border, marginHorizontal: esp.md }} />
          <View style={{ flex: 1, justifyContent: 'center' }}>
            <Texto v="seccion">día {DIA_CORTE}</Texto>
            <Texto v="nota" color="text2">fecha de corte</Texto>
          </View>
        </View>
      </Tarjeta>

      {cargando && !datos ? (
        <EsqueletoLista filas={3} />
      ) : error && !datos ? (
        <Tarjeta><EstadoError texto={mensajeError(error)} onReintentar={refrescar} /></Tarjeta>
      ) : datos && datos.estudiantes.length === 0 ? (
        <Tarjeta>
          <EstadoVacio
            icono={CircleDollarSign}
            titulo="Aún no tienes estudiantes"
            texto="Cuando registres estudiantes podrás llevar aquí el control de sus mensualidades."
            accion="Registrar estudiante"
            onAccion={() => nav.navigate('EditarEstudiante')}
            compacto
          />
        </Tarjeta>
      ) : datos ? (
        <Tarjeta estilo={{ paddingVertical: 4 }}>
          {datos.estudiantes.map((e, i) => {
            const pagado = pagoDe(e.id)?.status === 'paid';
            const nombre = `${e.first_name} ${e.last_name}`.trim();
            return (
              <View key={e.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, minHeight: 68, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: c.border }}>
                <Avatar nombre={nombre} color={e.school?.color} tam={40} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Texto v="fuerte" numberOfLines={1}>{nombre}</Texto>
                  <Texto v="nota" color="text2">{detalle(e)}</Texto>
                </View>
                <Pressable
                  onPress={() => alternar(e)}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: pagado }}
                  accessibilityLabel={`Mensualidad de ${nombre}: ${pagado ? 'pagada' : 'pendiente'}`}
                  accessibilityHint="Toca para cambiar el estado"
                  android_ripple={{ color: 'rgba(128,128,128,0.2)' }}
                  style={{
                    minHeight: 48, minWidth: 118, borderRadius: radio.pill, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center',
                    justifyContent: 'center', gap: 6, overflow: 'hidden', backgroundColor: pagado ? c.successSoft : c.warningSoft,
                  }}
                >
                  {pagado ? <Check size={17} color={c.successInk} strokeWidth={2.6} /> : <Clock size={16} color={c.warningInk} strokeWidth={2.2} />}
                  <Texto style={{ fontFamily: fuentes.tituloSuave, fontSize: 14.5 }} color={pagado ? 'successInk' : 'warningInk'}>
                    {pagado ? 'Pagado' : 'Pendiente'}
                  </Texto>
                </Pressable>
              </View>
            );
          })}
        </Tarjeta>
      ) : null}

      <Texto v="nota" color="text2">Registro manual. Un toque cambia el estado y guarda fecha y hora. Sin pasarela de pago.</Texto>
    </Pantalla>
  );
}
