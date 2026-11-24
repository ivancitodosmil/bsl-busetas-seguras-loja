// 64 · Registro de chofer: documentos para la verificación (paso 3 de 3).
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { BusFront, Camera, CircleCheck, FileText, IdCard, Image as IconoImagen, Lock, UserRound, type LucideIcon } from 'lucide-react-native';
import { Boton, EsqueletoLista, Pantalla, Tarjeta, Texto, useToast } from '../../ui';
import { useTema } from '../../tema';
import { chofer as servicio } from '../../servicios/chofer';
import { elegirImagen, subirFotoPerfil } from '../../servicios/fotos';
import { useSesion } from '../../estado/sesion';
import type { NavChofer } from '../../navegacion/tipos';
import type { DocumentoChofer, TipoDocumento } from '../../tipos';
import { fechaCorta, fechaDe, hoyISO, mensajeError } from '../../utils';

const DOCUMENTOS: { tipo: TipoDocumento; titulo: string; nota: string; icono: LucideIcon; obligatorio: boolean }[] = [
  { tipo: 'license', titulo: 'Licencia de conducir', nota: 'Frente, que se lea el número', icono: IdCard, obligatorio: true },
  { tipo: 'registration', titulo: 'Matrícula del vehículo', nota: 'Vigente este año', icono: FileText, obligatorio: true },
  { tipo: 'vehicle_photo', titulo: 'Foto de la buseta', nota: 'Que se vea la placa', icono: BusFront, obligatorio: false },
  { tipo: 'profile_photo', titulo: 'Tu foto de perfil', nota: 'De frente y sin gafas', icono: UserRound, obligatorio: false },
];

export default function RegistroDocumentos() {
  const nav = useNavigation<NavChofer>();
  const { c } = useTema();
  const toast = useToast();
  const { idSesion, chofer, actualizarChofer, actualizarPerfil } = useSesion();
  const [docs, setDocs] = useState<DocumentoChofer[] | null>(null);
  const [subiendo, setSubiendo] = useState<TipoDocumento | null>(null);
  const [enviando, setEnviando] = useState(false);

  const cargar = useCallback(async () => {
    if (!idSesion) return;
    try {
      setDocs(await servicio.documentos(idSesion));
    } catch {
      setDocs((d) => d ?? []);
    }
  }, [idSesion]);

  useEffect(() => { cargar(); }, [cargar]);

  const subir = async (tipo: TipoDocumento, desde: 'camara' | 'galeria') => {
    if (!idSesion || subiendo) return;
    const uri = await elegirImagen(desde, tipo === 'profile_photo');
    if (!uri) return;
    setSubiendo(tipo);
    try {
      const doc = await servicio.subirDocumento(idSesion, tipo, uri);
      setDocs((d) => [...(d ?? []).filter((x) => x.kind !== tipo), doc]);
      if (tipo === 'profile_photo') {
        // La misma foto queda como foto de perfil visible para los representantes.
        await actualizarPerfil({ photo_url: await subirFotoPerfil(idSesion, uri) }).catch(() => {});
      }
      toast.mostrar('Documento subido', { tipo: 'exito' });
    } catch (e) {
      toast.mostrar(mensajeError(e, 'No se pudo subir el archivo. Inténtalo de nuevo.'), { tipo: 'error' });
    } finally {
      setSubiendo(null);
    }
  };

  const tiene = (t: TipoDocumento) => !!docs?.some((d) => d.kind === t);
  const completos = tiene('license') && tiene('registration');
  const yaVerificada = chofer?.verification_status === 'verified';

  const terminar = (irAEstado: boolean) => {
    nav.reset({ index: irAEstado ? 1 : 0, routes: irAEstado ? [{ name: 'Pestanas' }, { name: 'EstadoCuenta' }] : [{ name: 'Pestanas' }] });
  };

  const enviar = async () => {
    setEnviando(true);
    try {
      if (!yaVerificada) await actualizarChofer({ verification_status: 'in_review' });
      terminar(true);
    } catch (e) {
      toast.mostrar(mensajeError(e, 'No se pudo enviar a revisión.'), { tipo: 'error' });
      setEnviando(false);
    }
  };

  return (
    <Pantalla
      titulo="Sube tus documentos"
      sobretitulo="Paso 3 de 3: documentos"
      subtitulo="El equipo de BSL los revisa en 24 a 48 horas. Mientras tanto puedes registrar escuelas, estudiantes y rutas."
      pie={
        <>
          <Boton titulo={yaVerificada ? 'Guardar' : 'Enviar a revisión'} onPress={enviar} cargando={enviando} deshabilitado={!completos} />
          {!completos ? <Texto v="nota" color="text3" centro>Para enviar faltan la licencia y la matrícula.</Texto> : null}
          <Boton titulo="Lo hago después" variante="fantasma" onPress={() => terminar(false)} />
        </>
      }
    >
      {docs === null ? (
        <EsqueletoLista filas={3} />
      ) : (
        DOCUMENTOS.map((d) => {
          const doc = docs.find((x) => x.kind === d.tipo);
          const cargando = subiendo === d.tipo;
          const rechazado = doc?.status === 'rejected';
          const cuando = doc ? (fechaDe(doc.created_at) === hoyISO() ? 'hoy' : `el ${fechaCorta(fechaDe(doc.created_at)).toLowerCase()}`) : '';
          return (
            <Tarjeta key={d.tipo} estilo={{ gap: 12 }} elevacion={d.tipo === 'license' ? 2 : 1}>
              <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: doc && !rechazado ? c.successSoft : c.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                  {cargando ? <ActivityIndicator color={c.primary} /> : doc && !rechazado ? <CircleCheck size={22} color={c.successInk} strokeWidth={2} /> : <d.icono size={22} color={c.primary} strokeWidth={2} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Texto v="fuerte">{d.titulo}{d.obligatorio ? '' : ' (opcional)'}</Texto>
                  <Texto v="nota" color={rechazado ? 'dangerInk' : doc ? 'successInk' : 'text2'}>
                    {cargando ? 'Subiendo…' : rechazado ? `Rechazado: ${doc?.reviewer_note ?? 'vuelve a subirlo'}` : doc ? `Subida ${cuando}` : d.nota}
                  </Texto>
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Boton titulo={doc ? 'Repetir foto' : 'Tomar foto'} icono={Camera} variante="secundario" tamano="compacto" estilo={{ flex: 1, height: 48 }} ancho deshabilitado={!!subiendo} onPress={() => subir(d.tipo, 'camara')} etiqueta={`Tomar foto de ${d.titulo}`} />
                <Boton titulo="Galería" icono={IconoImagen} variante="secundario" tamano="compacto" estilo={{ flex: 1, height: 48 }} ancho deshabilitado={!!subiendo} onPress={() => subir(d.tipo, 'galeria')} etiqueta={`Elegir de la galería: ${d.titulo}`} />
              </View>
            </Tarjeta>
          );
        })
      )}
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingHorizontal: 4 }}>
        <Lock size={16} color={c.text3} strokeWidth={2} style={{ marginTop: 2 }} />
        <Texto v="nota" color="text3" style={{ flex: 1 }}>Fotos JPG o PNG. Solo el equipo de verificación ve tus documentos; los representantes nunca.</Texto>
      </View>
    </Pantalla>
  );
}
