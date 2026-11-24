// Perfil del representante: sus datos, sus hijos y los ajustes.
import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { BellRing, Check, ChevronRight, History, LifeBuoy, LogOut, Moon, Pencil, Trash2, Users } from 'lucide-react-native';
import { useSesion } from '../../estado/sesion';
import type { NavRep } from '../../navegacion/tipos';
import { esp, useTema, type ModoTema } from '../../tema';
import {
  Avatar, ChipEscuela, EsqueletoLista, EstadoError, EstadoVacio, FilaAjuste, HojaInferior, ModalConfirmar, Pantalla, Tarjeta,
  Texto, TituloSeccion, CreditoPredir } from '../../ui';
import { celularBonito, nombreCompleto } from '../../utils';
import { colorDe, useResumen } from './_partes';

const MODOS: { valor: ModoTema; texto: string; nota: string }[] = [
  { valor: 'sistema', texto: 'Automático', nota: 'Según el sistema del teléfono' },
  { valor: 'claro', texto: 'Claro', nota: 'Fondo claro siempre' },
  { valor: 'oscuro', texto: 'Oscuro', nota: 'Fondo oscuro siempre' },
];

export default function Perfil() {
  const { c, modo, setModo } = useTema();
  const nav = useNavigation<NavRep>();
  const usuario = useSesion((s) => s.usuario);
  const salir = useSesion((s) => s.salir);
  const { datos, cargando, error, refrescando, recargar } = useResumen();
  const [hojaTema, setHojaTema] = useState(false);
  const [confirmarSalir, setConfirmarSalir] = useState(false);
  const [saliendo, setSaliendo] = useState(false);
  const hijos = datos?.children ?? [];
  const nombre = nombreCompleto(usuario);

  return (
    <Pantalla titulo="Perfil" conBarra refrescando={refrescando} onRefrescar={() => recargar(true)}>
      <Tarjeta elevacion={2} onPress={() => nav.navigate('EditarPerfil')} etiqueta={`${nombre}. Editar perfil`}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Avatar nombre={nombre} foto={usuario?.photo_url} tam={60} />
          <View style={{ flex: 1 }}>
            <Texto v="subtitulo">{nombre || 'Tu cuenta'}</Texto>
            {usuario?.phone ? <Texto v="medio" color="text2">{celularBonito(usuario.phone)}</Texto> : null}
            {usuario?.email ? <Texto v="medio" color="text2" numberOfLines={1}>{usuario.email}</Texto> : null}
          </View>
          <Pencil size={18} color={c.text3} strokeWidth={2} />
        </View>
      </Tarjeta>

      <View>
        <TituloSeccion titulo="Mis hijos" accion="Vincular otro" onAccion={() => nav.navigate('Vincular')} />
        {cargando && !datos ? (
          <EsqueletoLista filas={2} />
        ) : error && !datos ? (
          <Tarjeta><EstadoError onReintentar={() => recargar(true)} /></Tarjeta>
        ) : hijos.length === 0 ? (
          <Tarjeta>
            <EstadoVacio compacto icono={Users} titulo="Aún no vinculas a nadie" texto="Pídele al chofer el código de invitación." accion="Vincular con un código" onAccion={() => nav.navigate('Vincular')} />
          </Tarjeta>
        ) : (
          <View style={{ gap: 8, marginTop: 4 }}>
            {hijos.map((h, i) => (
              <Tarjeta key={h.id} onPress={() => nav.navigate('FichaHijo', { studentId: h.id })} etiqueta={`Ficha de ${h.name}`}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <Avatar nombre={h.name} color={colorDe(h, i)} tam={44} />
                  <View style={{ flex: 1, gap: 3 }}>
                    <Texto v="fuerte">{h.first_name} {h.last_name}</Texto>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <ChipEscuela nombre={h.school?.short_name} color={h.school?.color} />
                      {h.grade ? <Texto v="nota" color="text2">{h.grade}</Texto> : null}
                    </View>
                  </View>
                  <ChevronRight size={20} color={c.text3} strokeWidth={2} />
                </View>
              </Tarjeta>
            ))}
          </View>
        )}
      </View>

      <Tarjeta estilo={{ paddingVertical: 4 }}>
        <FilaAjuste icono={BellRing} titulo="Preferencias de avisos" texto="Qué te avisamos y en qué horario" onPress={() => nav.navigate('PreferenciasAvisos')} />
        <FilaAjuste icono={Moon} titulo="Modo oscuro" texto={MODOS.find((m) => m.valor === modo)?.texto} onPress={() => setHojaTema(true)} />
        <FilaAjuste icono={History} titulo="Historial" texto="Recorridos de los últimos 90 días" onPress={() => nav.navigate('Historial')} />
        <FilaAjuste icono={LifeBuoy} titulo="Soporte y preguntas frecuentes" onPress={() => nav.navigate('Soporte')} ultima />
      </Tarjeta>

      <Tarjeta estilo={{ paddingVertical: 4 }}>
        <FilaAjuste icono={LogOut} titulo="Cerrar sesión" onPress={() => setConfirmarSalir(true)} />
        <FilaAjuste icono={Trash2} titulo="Eliminar cuenta" peligro onPress={() => nav.navigate('EliminarCuenta')} ultima />
      </Tarjeta>

      <CreditoPredir />

      <HojaInferior visible={hojaTema} onCerrar={() => setHojaTema(false)} titulo="Modo oscuro">
        {MODOS.map((m) => {
          const sel = m.valor === modo;
          return (
            <Pressable
              key={m.valor}
              onPress={() => { setModo(m.valor); setHojaTema(false); }}
              accessibilityRole="radio"
              accessibilityState={{ selected: sel }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingHorizontal: esp.md, borderRadius: 12, backgroundColor: sel ? c.primarySoft : c.surface2 }}
            >
              <View style={{ flex: 1 }}>
                <Texto v="fuerte" color={sel ? 'primary' : 'text'}>{m.texto}</Texto>
                <Texto v="nota" color="text2">{m.nota}</Texto>
              </View>
              {sel ? <Check size={20} color={c.primary} strokeWidth={2} /> : null}
            </Pressable>
          );
        })}
      </HojaInferior>

      <ModalConfirmar
        visible={confirmarSalir}
        titulo="¿Cerrar sesión?"
        mensaje="Dejarás de recibir los avisos de la buseta en este teléfono hasta que vuelvas a entrar."
        confirmar="Cerrar sesión"
        cargando={saliendo}
        onCancelar={() => setConfirmarSalir(false)}
        onConfirmar={async () => { setSaliendo(true); await salir(); }}
      />
    </Pantalla>
  );
}
