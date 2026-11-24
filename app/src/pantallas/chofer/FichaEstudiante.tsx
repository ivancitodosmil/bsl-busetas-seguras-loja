// 75 / 88 · Ficha del estudiante: direcciones, notas, representantes, rutas y eliminar.
import React, { useState } from 'react';
import { Linking, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { MessageCircle, Pencil, Phone, Route, StickyNote, Trash2, UserPlus } from 'lucide-react-native';
import {
  Avatar, Boton, BotonIcono, ChipEscuela, EsqueletoLista, EstadoError, ModalConfirmar, Pantalla, PillEstado, Tarjeta,
  TarjetaDireccion, Texto, TituloSeccion, useToast,
} from '../../ui';
import { useTema } from '../../tema';
import { chofer, estadoInvitacion } from '../../servicios/chofer';
import type { NavChofer, PilaChofer } from '../../navegacion/tipos';
import type { Direccion } from '../../tipos';
import { edad, hhmm, listaNombres, mensajeError, nombreCompleto, NOMBRES_DIA_ISO, textoSentido } from '../../utils';
import { calleDe, detalleDe, useCarga, useFotoEstudiante } from './_c2';

export default function FichaEstudiante() {
  const nav = useNavigation<NavChofer>();
  const { studentId } = useRoute<RouteProp<PilaChofer, 'FichaEstudiante'>>().params;
  const { c } = useTema();
  const toast = useToast();
  const [confirmar, setConfirmar] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const { datos, cargando, refrescando, error, recargar, refrescar } = useCarga(() => chofer.fichaEstudiante(studentId), [studentId]);
  const foto = useFotoEstudiante(datos?.estudiante.photo_path);

  if (!datos) {
    return (
      <Pantalla titulo="Ficha del estudiante" onAtras={nav.goBack}>
        {cargando ? <EsqueletoLista filas={3} /> : <Tarjeta><EstadoError texto={mensajeError(error)} onReintentar={() => recargar()} /></Tarjeta>}
      </Pantalla>
    );
  }

  const { estudiante: e, direcciones, excepciones, representantes, invitaciones, rutas } = datos;
  const nombre = nombreCompleto(e);
  const corto = e.nickname || e.first_name;
  const anos = edad(e.birth_date);
  const porId = (id: string | null) => direcciones.find((d) => d.id === id) ?? null;
  const origen: Direccion | null = porId(e.default_pickup_address_id);
  const destino: Direccion | null = porId(e.default_dropoff_address_id) ?? origen;
  const mismo = !!origen && destino?.id === origen.id;
  const etiqueta = (d: Direccion) => (d.label.toLowerCase() === 'casa' ? `Casa ${e.last_name}`.trim() : d.label);

  // "Martes y jueves: Casa de los abuelos, Calle Azuay y Bolívar"
  const lineasExcepcion = Object.values(
    excepciones.reduce<Record<string, { dir: Direccion | null; sentido: string; dias: number[] }>>((acc, x) => {
      const k = `${x.address_id}-${x.direction}`;
      (acc[k] ??= { dir: porId(x.address_id), sentido: x.direction, dias: [] }).dias.push(x.weekday);
      return acc;
    }, {}),
  )
    .filter((g) => g.dir)
    .map((g) => {
      const dias = listaNombres(g.dias.sort((a, b) => a - b).map((d) => NOMBRES_DIA_ISO[d - 1]));
      const texto = `${dias.charAt(0).toUpperCase()}${dias.slice(1)}: ${etiqueta(g.dir as Direccion)}${calleDe(g.dir) ? `, ${calleDe(g.dir)}` : ''}`;
      return { sentido: g.sentido, texto };
    });
  const excOrigen = lineasExcepcion.filter((l) => l.sentido === 'pickup').map((l) => l.texto).join('\n') || null;
  const excDestino = lineasExcepcion.filter((l) => l.sentido === 'dropoff').map((l) => l.texto).join('\n') || null;

  const pendientes = invitaciones.filter((i) => !i.redeemed_at);
  const rutasUnicas = rutas.filter((r, i) => rutas.findIndex((x) => x.id === r.id) === i);

  const eliminar = async () => {
    setBorrando(true);
    try {
      await chofer.eliminarEstudiante(studentId);
      setConfirmar(false);
      toast.mostrar(`${corto} fue eliminado de tus estudiantes`, { tipo: 'exito' });
      nav.goBack();
    } catch (err) {
      setConfirmar(false);
      toast.mostrar(mensajeError(err), { tipo: 'error' });
    } finally {
      setBorrando(false);
    }
  };

  const textoEliminar =
    (rutasUnicas.length > 0
      ? `Se quitará de ${listaNombres(rutasUnicas.map((r) => r.name))}, con ${rutasUnicas.length === 1 ? 'su parada' : `sus ${rutasUnicas.length} paradas`}. `
      : '') + 'Sus representantes dejarán de ver la buseta. El historial de recorridos se conserva 90 días.';

  return (
    <Pantalla
      titulo="Ficha del estudiante"
      onAtras={nav.goBack}
      refrescando={refrescando}
      onRefrescar={refrescar}
      derecha={<BotonIcono icono={Pencil} etiqueta="Editar estudiante" sobreHero onPress={() => nav.navigate('EditarEstudiante', { studentId })} />}
    >
      <Tarjeta elevacion={2}>
        <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
          <Avatar nombre={nombre} foto={foto} color={e.school?.color} tam={60} />
          <View style={{ flex: 1, gap: 4 }}>
            <Texto v="subtitulo">{nombre}</Texto>
            <Texto v="medio" color="text2">{[anos != null ? `${anos} años` : null, e.grade].filter(Boolean).join(', ') || 'Sin curso registrado'}</Texto>
            <ChipEscuela nombre={e.school?.name} color={e.school?.color} />
          </View>
        </View>
      </Tarjeta>

      {origen ? (
        <>
          <TarjetaDireccion
            tipo="origen"
            titulo="Origen: dónde se recoge"
            etiqueta={etiqueta(origen)}
            calle={calleDe(origen)}
            detalle={detalleDe(origen)}
            nota={excOrigen}
          />
          <TarjetaDireccion
            tipo="destino"
            titulo="Destino: dónde se deja"
            etiqueta={mismo ? 'Igual que el origen' : etiqueta(destino as Direccion)}
            calle={calleDe(destino)}
            detalle={mismo ? null : [detalleDe(destino), destino?.receiver_note].filter(Boolean).join(', ') || null}
            nota={excDestino}
          />
        </>
      ) : (
        <Tarjeta plano>
          <Texto v="fuerte">Falta la dirección</Texto>
          <Texto v="medio" color="text2">Sin dirección no se puede agregar a {corto} a una ruta.</Texto>
          <Boton titulo="Agregar dirección" variante="secundario" tamano="compacto" estilo={{ marginTop: 10 }} onPress={() => nav.navigate('EditarEstudiante', { studentId })} />
        </Tarjeta>
      )}

      {e.notes ? (
        <Tarjeta>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <StickyNote size={20} color={c.accentInk} strokeWidth={2} />
            <View style={{ flex: 1, gap: 2 }}>
              <Texto v="medioFuerte" color="text2">Notas para el chofer</Texto>
              <Texto v="cuerpo">{e.notes}</Texto>
            </View>
          </View>
        </Tarjeta>
      ) : null}

      <View>
        <TituloSeccion titulo="Representantes" accion="Invitar" onAccion={() => nav.navigate('Invitar', { studentId })} />
        <Tarjeta estilo={{ paddingVertical: 4 }}>
          {representantes.length === 0 && pendientes.length === 0 ? (
            <View style={{ paddingVertical: 14, gap: 10 }}>
              <Texto v="medio" color="text2">Nadie recibe todavía los avisos de {corto}. Envía una invitación a su representante.</Texto>
              <Boton titulo="Invitar representante" icono={UserPlus} variante="secundario" onPress={() => nav.navigate('Invitar', { studentId })} />
            </View>
          ) : null}
          {representantes.map((r, i) => {
            const n = nombreCompleto(r.user) || 'Representante';
            const tel = r.user?.phone ?? null;
            const ultima = i === representantes.length - 1 && pendientes.length === 0;
            return (
              <View key={r.user_id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: ultima ? 0 : 1, borderBottomColor: c.border }}>
                <Avatar nombre={n} foto={r.user?.photo_url} tam={40} />
                <View style={{ flex: 1 }}>
                  <Texto v="fuerte" numberOfLines={1}>{n}</Texto>
                  <Texto v="nota" color="text2">{[r.relationship, r.is_primary ? 'principal' : null, r.receives_notifications ? 'recibe avisos' : null].filter(Boolean).join(', ')}</Texto>
                </View>
                {tel ? (
                  <>
                    <BotonIcono icono={Phone} etiqueta={`Llamar a ${n}`} onPress={() => Linking.openURL(`tel:${tel}`).catch(() => {})} />
                    <BotonIcono icono={MessageCircle} etiqueta={`WhatsApp a ${n}`} onPress={() => Linking.openURL(`https://wa.me/${tel.replace(/\D/g, '')}`).catch(() => {})} />
                  </>
                ) : (
                  <PillEstado estado="vinculado" />
                )}
              </View>
            );
          })}
          {pendientes.map((inv, i) => (
            <View key={inv.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: i === pendientes.length - 1 ? 0 : 1, borderBottomColor: c.border }}>
              <Avatar nombre={inv.guardian_name ?? inv.relationship} tam={40} color={c.text3} />
              <View style={{ flex: 1 }}>
                <Texto v="fuerte" numberOfLines={1}>{inv.guardian_name ?? 'Representante invitado'}</Texto>
                <Texto v="nota" color="text2">{inv.relationship}, invitación {estadoInvitacion(inv) === 'expirado' ? 'vencida' : 'enviada'}</Texto>
              </View>
              <PillEstado estado={estadoInvitacion(inv)} />
            </View>
          ))}
        </Tarjeta>
      </View>

      <View>
        <TituloSeccion titulo="Rutas" />
        <Tarjeta estilo={{ paddingVertical: 4 }}>
          {rutasUnicas.length === 0 ? (
            <Texto v="medio" color="text2" style={{ paddingVertical: 14 }}>Todavía no está en ninguna ruta. Agrégalo desde Rutas, en Paradas.</Texto>
          ) : (
            rutasUnicas.map((r, i) => (
              <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, borderBottomWidth: i === rutasUnicas.length - 1 ? 0 : 1, borderBottomColor: c.border }}>
                <Route size={20} color={r.color || c.primary} strokeWidth={2} />
                <Texto v="fuerte" style={{ flex: 1 }} numberOfLines={1}>{r.name}</Texto>
                <Texto v="medio" color="text2">{textoSentido(r.direction)} {hhmm(r.departure_time)}</Texto>
              </View>
            ))
          )}
        </Tarjeta>
      </View>

      <Boton titulo="Editar" icono={Pencil} variante="secundario" onPress={() => nav.navigate('EditarEstudiante', { studentId })} />
      <Boton titulo="Eliminar estudiante" icono={Trash2} variante="peligro" onPress={() => setConfirmar(true)} />

      <ModalConfirmar
        visible={confirmar}
        titulo={`¿Eliminar a ${nombre}?`}
        mensaje={textoEliminar}
        confirmar="Eliminar"
        peligro
        cargando={borrando}
        onConfirmar={eliminar}
        onCancelar={() => setConfirmar(false)}
      />
    </Pantalla>
  );
}
