// Editar perfil: foto, nombres, apellidos y celular.
import React, { useState } from 'react';
import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Camera, Image as IconoImagen } from 'lucide-react-native';
import { Avatar, Boton, CampoTexto, ConTeclado, HojaInferior, Pantalla, Texto, useToast } from '../../ui';
import { esp, radio, sombra, useTema } from '../../tema';
import { useSesion } from '../../estado/sesion';
import { elegirImagen, subirFotoPerfil } from '../../servicios/fotos';
import { celularE164, mensajeError, nombreCompleto } from '../../utils';

export default function EditarPerfil() {
  const { c } = useTema();
  const nav = useNavigation();
  const toast = useToast();
  const { usuario, actualizarPerfil } = useSesion();
  const [nombres, setNombres] = useState(usuario?.first_name ?? '');
  const [apellidos, setApellidos] = useState(usuario?.last_name ?? '');
  const [celular, setCelular] = useState((usuario?.phone ?? '').replace(/^\+593/, ''));
  const [errores, setErrores] = useState<{ nombres?: string; apellidos?: string; celular?: string }>({});
  const [guardando, setGuardando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [hoja, setHoja] = useState(false);

  const cambiarFoto = async (desde: 'galeria' | 'camara') => {
    setHoja(false);
    if (!usuario) return;
    try {
      const uri = await elegirImagen(desde);
      if (!uri) return;
      setSubiendo(true);
      const url = await subirFotoPerfil(usuario.id, uri);
      await actualizarPerfil({ photo_url: url });
      toast.mostrar('Foto actualizada', { tipo: 'exito' });
    } catch (e) {
      toast.mostrar(mensajeError(e, 'No pudimos subir la foto.'), { tipo: 'error' });
    } finally {
      setSubiendo(false);
    }
  };

  const guardar = async () => {
    const e: typeof errores = {};
    if (nombres.trim().length < 2) e.nombres = 'Escribe tus nombres.';
    if (apellidos.trim().length < 2) e.apellidos = 'Escribe tus apellidos.';
    const e164 = celular.trim() ? celularE164(celular) : null;
    if (celular.trim() && !e164) e.celular = 'Escribe tu celular de 9 dígitos, por ejemplo 99 123 4567.';
    setErrores(e);
    if (Object.keys(e).length) return;
    setGuardando(true);
    try {
      await actualizarPerfil({ first_name: nombres.trim(), last_name: apellidos.trim(), phone: e164 });
      toast.mostrar('Perfil guardado', { tipo: 'exito' });
      nav.goBack();
    } catch (err) {
      const m = mensajeError(err, 'No pudimos guardar los cambios.');
      if (m.toLowerCase().includes('celular')) setErrores({ celular: m });
      else toast.mostrar(m, { tipo: 'error' });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <ConTeclado>
      <Pantalla titulo="Editar perfil" onAtras={() => nav.goBack()} pie={<Boton titulo="Guardar cambios" onPress={guardar} cargando={guardando} />}>
        <View style={{ backgroundColor: c.surface, borderRadius: radio.grande, padding: esp.lg, gap: esp.md, alignItems: 'center', ...sombra(c, 2) }}>
          <Avatar nombre={nombreCompleto(usuario)} foto={usuario?.photo_url} tam={88} />
          <Boton titulo="Cambiar foto" variante="secundario" tamano="compacto" icono={Camera} onPress={() => setHoja(true)} cargando={subiendo} ancho={false} estilo={{ alignSelf: 'center' }} />
          {usuario?.email ? <Texto v="nota" color="text3">{usuario.email}</Texto> : null}
        </View>
        <CampoTexto etiqueta="Nombres" value={nombres} onChangeText={setNombres} error={errores.nombres} autoCapitalize="words" />
        <CampoTexto etiqueta="Apellidos" value={apellidos} onChangeText={setApellidos} error={errores.apellidos} autoCapitalize="words" />
        <CampoTexto etiqueta="Celular" prefijo="+593" value={celular} onChangeText={setCelular} error={errores.celular} keyboardType="phone-pad" placeholder="99 123 4567" />
      </Pantalla>
      <HojaInferior visible={hoja} onCerrar={() => setHoja(false)} titulo="Tu foto de perfil" texto="Ayuda a que te reconozcan antes de cada recorrido.">
        <Boton titulo="Tomar una foto" icono={Camera} onPress={() => cambiarFoto('camara')} />
        <Boton titulo="Elegir de la galería" icono={IconoImagen} variante="secundario" onPress={() => cambiarFoto('galeria')} />
      </HojaInferior>
    </ConTeclado>
  );
}
