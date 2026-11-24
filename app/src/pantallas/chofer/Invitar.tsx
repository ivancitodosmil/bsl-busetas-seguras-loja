// 78 / 79 · Invitar representante: código, WhatsApp, QR y estado de cada invitación.
import React, { useEffect, useState } from 'react';
import { Linking, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { Copy, MessageCircle, QrCode, RefreshCw, UserPlus } from 'lucide-react-native';
import {
  Avatar, BannerAlerta, Boton, CampoTexto, ChipEscuela, EsqueletoLista, EstadoError, HojaInferior, Pantalla, PillEstado,
  Tarjeta, Texto, TituloSeccion, useToast,
} from '../../ui';
import { fuentes, radio, useTema } from '../../tema';
import { pedir, supabase } from '../../config/supabase';
import { chofer, estadoInvitacion } from '../../servicios/chofer';
import { useSesion } from '../../estado/sesion';
import type { NavChofer, PilaChofer } from '../../navegacion/tipos';
import type { Estudiante, Invitacion } from '../../tipos';
import { celularBonito, celularE164, fechaCorta, fechaDe, hora, hoyISO, mensajeError, nombreCompleto } from '../../utils';
import { ChipsParentesco, useCarga } from './_c2';

/** "31 h 12 min" */
function faltan(ms: number): string {
  const min = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(min / 60);
  return h > 0 ? `${h} h ${min % 60} min` : `${min} min`;
}
const celularOculto = (t: string | null) => {
  if (!t) return null;
  const b = celularBonito(t);
  return b.length > 8 ? `${b.slice(0, 7)}…${b.slice(-4)}` : b;
};
const cuando = (ts: string) => (fechaDe(ts) === hoyISO() ? `hoy ${hora(ts)}` : `el ${fechaCorta(fechaDe(ts)).toLowerCase()}`);

export default function Invitar() {
  const nav = useNavigation<NavChofer>();
  const { studentId } = useRoute<RouteProp<PilaChofer, 'Invitar'>>().params;
  const { c } = useTema();
  const toast = useToast();
  const usuario = useSesion((s) => s.usuario);
  const [ahora, setAhora] = useState(Date.now());
  const [verQR, setVerQR] = useState(false);
  const [hojaOtro, setHojaOtro] = useState(false);
  const [generando, setGenerando] = useState(false);
  const [nombre, setNombre] = useState('');
  const [celular, setCelular] = useState('');
  const [errorCel, setErrorCel] = useState<string | null>(null);
  const [parentesco, setParentesco] = useState('Papá');

  const { datos, cargando, refrescando, error, recargar, refrescar } = useCarga(async () => {
    const [estudiante, invitaciones] = await Promise.all([
      pedir<Estudiante>(supabase.from('students').select('*, school:schools(*)').eq('id', studentId).single()),
      chofer.invitaciones(studentId),
    ]);
    return { estudiante, invitaciones };
  }, [studentId]);

  useEffect(() => {
    const r = setInterval(() => setAhora(Date.now()), 30000);
    return () => clearInterval(r);
  }, []);

  if (!datos) {
    return (
      <Pantalla titulo="Invitar representante" onAtras={nav.goBack}>
        {cargando ? <EsqueletoLista filas={2} /> : <Tarjeta><EstadoError texto={mensajeError(error)} onReintentar={() => recargar()} /></Tarjeta>}
      </Pantalla>
    );
  }

  const { estudiante: e, invitaciones } = datos;
  const corto = e.nickname || e.first_name;
  const abiertas = invitaciones.filter((i) => !i.redeemed_at);
  const actual: Invitacion | null = abiertas[0] ?? null; // la más reciente sin canjear
  const vencida = !!actual && new Date(actual.expires_at).getTime() <= ahora;
  const enlaceWeb = actual ? `https://bsl.app/i/${actual.code.replace(/^BSL-/, '').replace(/-/g, '')}` : '';
  const enlaceApp = actual ? `bsl://i/${actual.code}` : '';

  const generar = async (d: { nombre?: string; celular?: string | null; parentesco?: string; principal?: boolean }) => {
    setGenerando(true);
    try {
      await chofer.crearInvitacion(studentId, d);
      await recargar();
      toast.mostrar('Código nuevo listo. Dura 48 horas.', { tipo: 'exito' });
      return true;
    } catch (err) {
      toast.mostrar(mensajeError(err), { tipo: 'error' });
      return false;
    } finally {
      setGenerando(false);
    }
  };

  const regenerar = () =>
    generar({
      nombre: actual?.guardian_name ?? undefined, celular: actual?.guardian_phone ?? null,
      parentesco: actual?.relationship, principal: actual?.is_primary ?? invitaciones.length === 0,
    });

  const whatsapp = async () => {
    if (!actual) return;
    const texto = `Hola, soy ${nombreCompleto(usuario) || 'el chofer'}, el chofer de ${corto}. Para ver la buseta en vivo instala BSL y usa este código: ${actual.code}. O abre: ${enlaceWeb}. Vence en 48 horas.`;
    const q = encodeURIComponent(texto);
    const tel = actual.guardian_phone?.replace(/\D/g, '');
    try {
      await Linking.openURL(tel ? `https://wa.me/${tel}?text=${q}` : `whatsapp://send?text=${q}`);
    } catch {
      await Clipboard.setStringAsync(texto);
      toast.mostrar('No se pudo abrir WhatsApp. Copiamos el mensaje para que lo pegues.', { tipo: 'info' });
    }
  };

  const copiar = async () => {
    if (!actual) return;
    await Clipboard.setStringAsync(actual.code);
    toast.mostrar('Código copiado', { tipo: 'exito' });
  };

  const invitarOtro = async () => {
    const cel = celular.trim() ? celularE164(celular) : null;
    if (celular.trim() && !cel) {
      setErrorCel('El celular debe tener 10 dígitos y empezar con 09.');
      return;
    }
    if (await generar({ nombre: nombre.trim() || undefined, celular: cel, parentesco, principal: false })) {
      setHojaOtro(false);
      setNombre('');
      setCelular('');
      setErrorCel(null);
    }
  };

  return (
    <Pantalla titulo="Invitar representante" onAtras={nav.goBack} refrescando={refrescando} onRefrescar={refrescar}>
      <Tarjeta elevacion={2}>
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <Avatar nombre={nombreCompleto(e)} color={e.school?.color} tam={48} />
          <View style={{ flex: 1, gap: 4 }}>
            <Texto v="subtitulo" numberOfLines={1}>{nombreCompleto(e)}</Texto>
            <ChipEscuela nombre={e.school?.name} color={e.school?.color} />
          </View>
        </View>
      </Tarjeta>

      {!actual ? (
        <Tarjeta estilo={{ gap: 12 }}>
          <Texto v="fuerte">{invitaciones.length > 0 ? 'No hay invitaciones pendientes' : 'Aún no hay un código'}</Texto>
          <Texto v="medio" color="text2">Genera un código para que el representante de {corto} se vincule. Dura 48 horas y es de un solo uso.</Texto>
          <Boton titulo="Generar código" icono={RefreshCw} cargando={generando} onPress={() => generar({ principal: invitaciones.length === 0 })} />
        </Tarjeta>
      ) : (
        <>
          {vencida ? <BannerAlerta tipo="urgente" titulo="Este código venció" texto="Duran 48 horas. Genera uno nuevo y vuelve a enviarlo." /> : null}
          <Tarjeta estilo={{ gap: 14 }}>
            <View style={{ gap: 4, alignItems: 'center' }}>
              <Texto v="medioFuerte" color="text2">Código de invitación</Texto>
              <Texto
                selectable
                accessibilityLabel={`Código ${actual.code.split('').join(' ')}`}
                style={{ fontFamily: fuentes.titulo, fontSize: 30, lineHeight: 38, letterSpacing: 1, color: vencida ? c.text3 : c.text, textDecorationLine: vencida ? 'line-through' : 'none' }}
              >
                {actual.code}
              </Texto>
              <Texto v="nota" color={vencida ? 'dangerInk' : 'text2'}>
                {vencida ? `Venció ${cuando(actual.expires_at)}` : `Vence en ${faltan(new Date(actual.expires_at).getTime() - ahora)}, un solo uso`}
              </Texto>
              {actual.guardian_name ? <Texto v="nota" color="text3">Para {actual.guardian_name}{actual.guardian_phone ? `, ${celularBonito(actual.guardian_phone)}` : ''}</Texto> : null}
            </View>
            {vencida ? (
              <Boton titulo="Generar nuevo código" icono={RefreshCw} cargando={generando} onPress={regenerar} />
            ) : (
              <>
                <Boton titulo="Enviar por WhatsApp" icono={MessageCircle} variante="exito" onPress={whatsapp} />
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Boton titulo="Mostrar QR" icono={QrCode} variante="secundario" onPress={() => setVerQR(true)} estilo={{ flex: 1 }} />
                  <Boton titulo="Copiar" icono={Copy} variante="secundario" onPress={copiar} estilo={{ flex: 1 }} />
                </View>
              </>
            )}
          </Tarjeta>
        </>
      )}

      {invitaciones.length > 0 ? (
        <View>
          <TituloSeccion titulo={`Invitaciones de ${corto}`} />
          <Tarjeta estilo={{ paddingVertical: 4 }}>
            {invitaciones.map((inv, i) => {
              const est = estadoInvitacion(inv);
              const detalle =
                est === 'vinculado' ? `se vinculó ${cuando(inv.redeemed_at as string)}`
                : est === 'expirado' ? `el código venció ${cuando(inv.expires_at)}`
                : `creada ${cuando(inv.created_at)}`;
              return (
                <View key={inv.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: i === invitaciones.length - 1 ? 0 : 1, borderBottomColor: c.border }}>
                  <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.surface2, alignItems: 'center', justifyContent: 'center' }}>
                    <Texto v="medioFuerte" color="text2">R{invitaciones.length - i}</Texto>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Texto v="fuerte" numberOfLines={1}>{inv.guardian_name ?? (inv.is_primary ? 'Representante principal' : inv.relationship)}</Texto>
                    <Texto v="nota" color="text2" numberOfLines={2}>{[celularOculto(inv.guardian_phone), detalle].filter(Boolean).join(', ')}</Texto>
                  </View>
                  <PillEstado estado={est} />
                </View>
              );
            })}
          </Tarjeta>
        </View>
      ) : null}

      <Boton titulo="Invitar a otro representante" icono={UserPlus} variante="secundario" onPress={() => setHojaOtro(true)} />

      <HojaInferior visible={verQR} onCerrar={() => setVerQR(false)} titulo={`QR de ${corto}`} texto="El representante lo escanea desde BSL, en Vincular a tu hijo.">
        <View style={{ alignItems: 'center', gap: 12 }}>
          <View style={{ backgroundColor: '#FFFFFF', padding: 18, borderRadius: radio.grande }}>
            {actual ? <QRCode value={enlaceApp} size={220} backgroundColor="#FFFFFF" color="#0F1B2D" /> : null}
          </View>
          <Texto v="subtitulo" selectable>{actual?.code}</Texto>
        </View>
      </HojaInferior>

      <HojaInferior
        visible={hojaOtro}
        onCerrar={() => setHojaOtro(false)}
        titulo="Invitar a otro representante"
        texto={`Recibirá los mismos avisos de ${corto}. Se crea un código nuevo solo para esa persona.`}
        pie={<Boton titulo="Generar código" cargando={generando} onPress={invitarOtro} />}
      >
        <CampoTexto etiqueta="Nombre" value={nombre} onChangeText={setNombre} autoCapitalize="words" placeholder="Diego Armijos" ayuda="Opcional" />
        <CampoTexto etiqueta="Celular" prefijo="+593" value={celular} onChangeText={(t) => { setCelular(t); setErrorCel(null); }} keyboardType="phone-pad" placeholder="99 123 4567" error={errorCel} ayuda="Opcional. Para enviarle el código por WhatsApp." maxLength={13} />
        <ChipsParentesco valor={parentesco} onChange={setParentesco} />
      </HojaInferior>
    </Pantalla>
  );
}
