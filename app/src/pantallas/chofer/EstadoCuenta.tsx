// 65–68 · Estado de verificación de la cuenta del chofer.
import React, { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Check, CircleCheck, Clock, FileWarning, Lock, ShieldCheck, Upload, X, type LucideIcon } from 'lucide-react-native';
import { BannerAlerta, Boton, Pantalla, Tarjeta, Texto } from '../../ui';
import { fuentes, useTema } from '../../tema';
import { chofer as servicio } from '../../servicios/chofer';
import { useSesion } from '../../estado/sesion';
import type { NavChofer } from '../../navegacion/tipos';
import type { EstadoVerificacion } from '../../tipos';

interface Vista {
  icono: LucideIcon;
  tono: 'exito' | 'aviso' | 'peligro' | 'info';
  titulo: string;
  texto: string;
  paso: number; // hito en curso: 0 documentos, 1 revisión, 2 verificada (3 = todo listo)
  boton: string;
}

const VISTAS: Record<EstadoVerificacion, Vista> = {
  pending: {
    icono: Upload, tono: 'info', titulo: 'Faltan documentos', paso: 0, boton: 'Subir documentos',
    texto: 'Sube tu licencia y la matrícula del vehículo para enviar tu cuenta a revisión.',
  },
  in_review: {
    icono: Clock, tono: 'aviso', titulo: 'Tu cuenta está en revisión', paso: 1, boton: 'Continuar',
    texto: 'Te avisaremos en 24 a 48 horas. Ya puedes registrar escuelas, estudiantes y rutas.',
  },
  verified: {
    icono: ShieldCheck, tono: 'exito', titulo: 'Cuenta verificada', paso: 3, boton: 'Continuar',
    texto: 'Ya puedes iniciar recorridos y ser chofer sustituto. Los representantes ven tu insignia de verificado.',
  },
  rejected: {
    icono: FileWarning, tono: 'peligro', titulo: 'Necesitamos un cambio', paso: 1, boton: 'Volver a subir documentos',
    texto: 'Revisa el motivo, corrige el documento y vuelve a enviarlo.',
  },
};

export default function EstadoCuenta() {
  const nav = useNavigation<NavChofer>();
  const { c } = useTema();
  const { idSesion, chofer, recargar } = useSesion();
  const [nDocs, setNDocs] = useState<number | null>(null);
  const [refrescando, setRefrescando] = useState(false);

  const cargar = useCallback(async () => {
    await recargar();
    if (idSesion) await servicio.documentos(idSesion).then((d) => setNDocs(d.length)).catch(() => {});
  }, [idSesion, recargar]);

  useFocusEffect(useCallback(() => { cargar(); }, [cargar]));

  const estado: EstadoVerificacion = chofer?.verification_status ?? 'pending';
  const v = VISTAS[estado];
  const verificada = estado === 'verified';
  const rechazada = estado === 'rejected';
  const tonos = {
    exito: [c.successSoft, c.successInk], aviso: [c.warningSoft, c.warningInk],
    peligro: [c.dangerSoft, c.dangerInk], info: [c.primarySoft, c.primary],
  } as const;
  const [fondo, tinta] = tonos[v.tono];

  const hitos = ['Documentos enviados', 'Revisión del equipo BSL', 'Cuenta verificada'];
  const permisos = [
    { texto: 'Registrar escuelas, estudiantes y rutas', si: true },
    { texto: 'Iniciar recorridos', si: verificada },
    { texto: 'Ser chofer sustituto', si: verificada },
  ];

  const principal = () => {
    if (estado === 'pending' || rechazada) nav.navigate('RegistroDocumentos');
    else if (nav.canGoBack()) nav.goBack();
    else nav.navigate('Pestanas');
  };

  return (
    <Pantalla
      titulo="Estado de tu cuenta"
      onAtras={() => (nav.canGoBack() ? nav.goBack() : nav.navigate('Pestanas'))}
      refrescando={refrescando}
      onRefrescar={async () => { setRefrescando(true); await cargar(); setRefrescando(false); }}
      pie={
        <>
          <Boton titulo={v.boton} onPress={principal} />
          <Boton titulo="Hablar con soporte" variante="fantasma" onPress={() => nav.navigate('Soporte')} />
        </>
      }
    >
      <Tarjeta elevacion={2} estilo={{ gap: 12 }}>
        <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: fondo, alignItems: 'center', justifyContent: 'center' }}>
          <v.icono size={28} color={tinta} strokeWidth={2} />
        </View>
        <Texto v="titulo" accessibilityRole="header">{v.titulo}</Texto>
        <Texto v="cuerpo" color="text2">{v.texto}</Texto>
        {estado === 'pending' && nDocs != null && nDocs > 0 ? (
          <Texto v="nota" color="text3">Llevas {nDocs} de 4 documentos subidos.</Texto>
        ) : null}
      </Tarjeta>

      {rechazada ? (
        <BannerAlerta tipo="urgente" titulo="Motivo" texto={chofer?.reviewer_note ?? 'Uno de los documentos no se pudo leer. Vuelve a subirlo.'} />
      ) : null}

      <Tarjeta>
        {hitos.map((h, i) => {
          const hecho = i < v.paso;
          const actual = i === v.paso;
          const fallo = rechazada && actual;
          const colorPunto = hecho ? c.success : fallo ? c.danger : actual ? c.accent : c.surface2;
          return (
            <View key={h} style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ alignItems: 'center', width: 28 }}>
                <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colorPunto, alignItems: 'center', justifyContent: 'center' }}>
                  {hecho ? <Check size={16} color="#FFFFFF" strokeWidth={3} /> : fallo ? <X size={16} color="#FFFFFF" strokeWidth={3} /> : (
                    <Texto style={{ fontFamily: fuentes.titulo, fontSize: 13, color: actual ? c.onAccent : c.text3 }}>{i + 1}</Texto>
                  )}
                </View>
                {i < hitos.length - 1 ? <View style={{ width: 2, flex: 1, minHeight: 22, backgroundColor: hecho ? c.success : c.border }} /> : null}
              </View>
              <View style={{ flex: 1, paddingBottom: i < hitos.length - 1 ? 16 : 0, paddingTop: 3 }}>
                <Texto v={actual ? 'fuerte' : 'cuerpo'} color={hecho || actual ? 'text' : 'text3'}>{h}</Texto>
                {actual ? <Texto v="nota" color={fallo ? 'dangerInk' : 'accentInk'}>{fallo ? 'Rechazado' : 'Ahora'}</Texto> : null}
              </View>
            </View>
          );
        })}
      </Tarjeta>

      <Tarjeta estilo={{ gap: 12 }}>
        <Texto v="seccion" accessibilityRole="header">Qué puedes hacer</Texto>
        {permisos.map((p) => (
          <View key={p.texto} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }} accessibilityLabel={`${p.texto}: ${p.si ? 'disponible' : 'al verificar tu cuenta'}`}>
            {p.si ? <CircleCheck size={20} color={c.successInk} strokeWidth={2} /> : <Lock size={20} color={c.text3} strokeWidth={2} />}
            <Texto v="cuerpo" color={p.si ? 'text' : 'text3'} style={{ flex: 1 }}>{p.texto}</Texto>
          </View>
        ))}
      </Tarjeta>
    </Pantalla>
  );
}
