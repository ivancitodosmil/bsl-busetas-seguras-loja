// 45 · Perfil y vehículo del chofer.
import React, { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import {
  BatteryLow, Bell, BusFront, Check, Clock, History, IdCard, LifeBuoy, LogOut, MessageSquare, Moon, School, ShieldCheck,
  Trash2, UserPen,
} from 'lucide-react-native';
import {
  Avatar, Boton, FilaAjuste, HojaInferior, ModalConfirmar, Pantalla, PillEstado, Tarjeta, Texto, useToast, type Estado, CreditoPredir } from '../../ui';
import { useTema, type ModoTema } from '../../tema';
import { chofer as servicio } from '../../servicios/chofer';
import { useSesion } from '../../estado/sesion';
import type { NavChofer } from '../../navegacion/tipos';
import type { ChoferPrivado, EstadoVerificacion } from '../../tipos';
import { celularBonito, hhmm, mensajeError, nombreCompleto } from '../../utils';
import { SelectorHora } from './_c2';

const PILL: Record<EstadoVerificacion, { estado: Estado; texto: string }> = {
  verified: { estado: 'verificado', texto: 'Cuenta verificada' },
  in_review: { estado: 'en_revision', texto: 'En revisión' },
  rejected: { estado: 'rechazado', texto: 'Necesita un cambio' },
  pending: { estado: 'pendiente', texto: 'Faltan documentos' },
};
const MODOS: { valor: ModoTema; texto: string; nota: string }[] = [
  { valor: 'sistema', texto: 'Automático', nota: 'Según el sistema del teléfono' },
  { valor: 'claro', texto: 'Claro', nota: 'Mejor a pleno sol' },
  { valor: 'oscuro', texto: 'Oscuro', nota: 'Mejor de madrugada' },
];

export default function Perfil() {
  const nav = useNavigation<NavChofer>();
  const { c, modo, setModo } = useTema();
  const toast = useToast();
  const { usuario, chofer, actualizarChofer, recargar, salir } = useSesion();
  const [privado, setPrivado] = useState<ChoferPrivado | null>(null);
  const [escuelas, setEscuelas] = useState<number | null>(null);
  const [refrescando, setRefrescando] = useState(false);
  const [hojaTema, setHojaTema] = useState(false);
  const [hojaHora, setHojaHora] = useState(false);
  const [cerrar, setCerrar] = useState(false);
  const [saliendo, setSaliendo] = useState(false);

  const cargar = useCallback(async () => {
    if (!usuario) return;
    await Promise.all([
      recargar(),
      servicio.datosPrivados(usuario.id).then(setPrivado).catch(() => {}),
      servicio.escuelas().then((l) => setEscuelas(l.length)).catch(() => {}),
    ]);
  }, [usuario?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useFocusEffect(useCallback(() => { cargar(); }, [cargar]));

  if (!usuario) return null;

  const cambiar = async (cambios: Parameters<typeof actualizarChofer>[0], listo: string) => {
    try {
      await actualizarChofer(cambios);
      toast.mostrar(listo, { tipo: 'exito' });
    } catch (e) {
      toast.mostrar(mensajeError(e), { tipo: 'error' });
    }
  };

  const nombre = nombreCompleto(usuario);
  const pill = PILL[chofer?.verification_status ?? 'pending'];
  const vehiculo = [[chofer?.vehicle_brand, chofer?.vehicle_model, chofer?.vehicle_year].filter(Boolean).join(' '), chofer?.vehicle_color?.toLowerCase()].filter(Boolean).join(', ');
  const placa = [chofer?.plate_number ? `Placa ${chofer.plate_number}` : null, chofer?.vehicle_capacity ? `${chofer.vehicle_capacity} asientos` : null].filter(Boolean).join(', ');
  const vence = privado?.license_expiry ? `vence ${privado.license_expiry.slice(5, 7)}/${privado.license_expiry.slice(0, 4)}` : null;
  const licencia = [privado?.license_type ? `Licencia tipo ${privado.license_type}` : privado?.license_number ? 'Licencia registrada' : null, vence].filter(Boolean).join(', ');
  const limite = hhmm(chofer?.absence_cutoff_time) || '05:30';

  return (
    <Pantalla
      titulo="Perfil"
      conBarra
      refrescando={refrescando}
      onRefrescar={async () => { setRefrescando(true); await cargar(); setRefrescando(false); }}
    >
      <Tarjeta elevacion={2} onPress={() => nav.navigate('EditarPerfil')} etiqueta={`${nombre}. Editar perfil`}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Avatar nombre={nombre} foto={usuario.photo_url} tam={60} />
          <View style={{ flex: 1, gap: 4 }}>
            <Texto v="subtitulo" numberOfLines={1}>{nombre || 'Tu nombre'}</Texto>
            <Texto v="medio" color="text2" numberOfLines={1}>{celularBonito(usuario.phone) || usuario.email || ''}</Texto>
            <PillEstado estado={pill.estado} texto={pill.texto} />
          </View>
        </View>
      </Tarjeta>

      <Tarjeta estilo={{ gap: 12 }}>
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <BusFront size={22} color={c.accentInk} strokeWidth={2} />
          <View style={{ flex: 1 }}>
            <Texto v="fuerte">{vehiculo || 'Vehículo sin registrar'}</Texto>
            <Texto v="medio" color="text2">{placa || 'Agrega la placa y la capacidad'}</Texto>
          </View>
          <Boton titulo="Editar" variante="secundario" tamano="compacto" onPress={() => nav.navigate('RegistroVehiculo', { editar: true })} />
        </View>
        {licencia ? (
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            <IdCard size={22} color={c.accentInk} strokeWidth={2} />
            <Texto v="medio" color="text2" style={{ flex: 1 }}>{licencia}</Texto>
          </View>
        ) : null}
      </Tarjeta>

      <Tarjeta estilo={{ paddingVertical: 4 }}>
        <FilaAjuste icono={ShieldCheck} titulo="Estado de la cuenta" texto="Documentos y verificación" onPress={() => nav.navigate('EstadoCuenta')} />
        <FilaAjuste icono={School} titulo="Escuelas" texto={escuelas == null ? undefined : escuelas === 1 ? '1 escuela registrada' : `${escuelas} escuelas registradas`} onPress={() => nav.navigate('Escuelas')} />
        <FilaAjuste icono={MessageSquare} titulo="Mensajes rápidos" texto="Botones e historial" onPress={() => nav.navigate('MensajesRapidos')} />
        <FilaAjuste icono={History} titulo="Historial de recorridos" texto="Resúmenes y PDF" onPress={() => nav.navigate('HistorialChofer')} ultima />
      </Tarjeta>

      <Tarjeta estilo={{ paddingVertical: 4 }}>
        <FilaAjuste
          icono={BatteryLow}
          titulo="Modo bajo consumo"
          texto="GPS cada 15 s en lugar de 5 s. Gasta menos batería y datos."
          interruptor={!!chofer?.low_power_mode}
          onInterruptor={(v) => cambiar({ low_power_mode: v }, v ? 'Bajo consumo activado: GPS cada 15 s' : 'GPS cada 5 s')}
        />
        <FilaAjuste icono={Clock} titulo="Hora límite para ausencias de hoy" texto={`${limite}. Después, solo antes de iniciar`} onPress={() => setHojaHora(true)} />
        <FilaAjuste icono={Moon} titulo="Modo oscuro" texto={MODOS.find((m) => m.valor === modo)?.texto} onPress={() => setHojaTema(true)} />
        <FilaAjuste icono={Bell} titulo="Avisos" texto="Ausencias, vinculaciones y solicitudes" onPress={() => nav.navigate('PermisoAvisos', { siguiente: 'volver' })} ultima />
      </Tarjeta>

      <Tarjeta estilo={{ paddingVertical: 4 }}>
        <FilaAjuste icono={UserPen} titulo="Editar perfil" texto="Nombre, celular y foto" onPress={() => nav.navigate('EditarPerfil')} />
        <FilaAjuste icono={LifeBuoy} titulo="Soporte" texto="Preguntas frecuentes y contacto" onPress={() => nav.navigate('Soporte')} />
        <FilaAjuste icono={LogOut} titulo="Cerrar sesión" onPress={() => setCerrar(true)} />
        <FilaAjuste icono={Trash2} titulo="Eliminar cuenta" peligro onPress={() => nav.navigate('EliminarCuenta')} ultima />
      </Tarjeta>

      <CreditoPredir />

      <HojaInferior visible={hojaTema} onCerrar={() => setHojaTema(false)} titulo="Modo oscuro">
        {MODOS.map((m, i) => (
          <FilaAjuste
            key={m.valor}
            titulo={m.texto}
            texto={m.nota}
            ultima={i === MODOS.length - 1}
            onPress={() => { setModo(m.valor); setHojaTema(false); }}
            derecha={modo === m.valor ? <Check size={22} color={c.successInk} strokeWidth={2.4} /> : <View style={{ width: 22 }} />}
          />
        ))}
      </HojaInferior>

      <SelectorHora
        visible={hojaHora}
        titulo="Hora límite para ausencias de hoy"
        valor={limite}
        horas={[3, 4, 5, 6, 7, 8, 9, 10, 11, 12]}
        onCerrar={() => setHojaHora(false)}
        onElegir={(v) => cambiar({ absence_cutoff_time: v }, `Hora límite: ${v}`)}
      />

      <ModalConfirmar
        visible={cerrar}
        titulo="¿Cerrar sesión?"
        mensaje="Tus rutas, estudiantes y recorridos siguen guardados. Vuelves a entrar con tu correo y contraseña."
        confirmar="Cerrar sesión"
        cargando={saliendo}
        onConfirmar={async () => { setSaliendo(true); await salir(); }}
        onCancelar={() => setCerrar(false)}
      />
    </Pantalla>
  );
}
