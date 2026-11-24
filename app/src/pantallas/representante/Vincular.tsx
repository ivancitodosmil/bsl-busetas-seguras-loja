// Vincular a un hijo: con el código del chofer o escaneando su QR. Nunca bloquea ("Lo hago después").
import React, { useEffect, useRef, useState } from 'react';
import { Linking, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Camera, QrCode, UserRound } from 'lucide-react-native';
import type { NavRep, PilaRep } from '../../navegacion/tipos';
import { extraerCodigo, formatearCodigo, representante } from '../../servicios/representante';
import { esp, radio, useTema } from '../../tema';
import { BannerAlerta, Boton, CampoTexto, ConTeclado, Pantalla, Segmentado, Tarjeta, Texto } from '../../ui';
import { mensajeError } from '../../utils';

type Modo = 'codigo' | 'qr';

export default function Vincular() {
  const { c } = useTema();
  const nav = useNavigation<NavRep>();
  const params = useRoute<RouteProp<PilaRep, 'Vincular'>>().params;
  const [modo, setModo] = useState<Modo>('codigo');
  const [codigo, setCodigo] = useState(params?.codigo ? extraerCodigo(params.codigo) : '');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [permiso, pedirPermiso] = useCameraPermissions();
  const leyendo = useRef(false);

  useEffect(() => {
    if (params?.codigo) {
      setCodigo(extraerCodigo(params.codigo));
      setModo('codigo');
    }
  }, [params?.codigo]);

  const completo = /^BSL-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(codigo);

  const vincular = async (valor: string) => {
    setEnviando(true);
    setError(null);
    try {
      const vinculo = await representante.canjearInvitacion(valor);
      nav.replace('HijoVinculado', { vinculo });
    } catch (e) {
      setError(mensajeError(e, 'No pudimos vincular con ese código. Inténtalo de nuevo.'));
      setModo('codigo');
    } finally {
      setEnviando(false);
      leyendo.current = false;
    }
  };

  const alEscanear = ({ data }: { data: string }) => {
    if (leyendo.current || enviando) return;
    leyendo.current = true;
    const leido = extraerCodigo(data);
    setCodigo(leido);
    vincular(leido);
  };

  return (
    <ConTeclado>
      <Pantalla
        titulo="Vincular a tu hijo"
        onAtras={() => nav.goBack()}
        pie={
          <>
            {modo === 'codigo' ? <Boton titulo="Vincular" onPress={() => vincular(codigo)} cargando={enviando} deshabilitado={!completo} /> : null}
            <Boton titulo="Lo hago después" variante="fantasma" onPress={() => nav.goBack()} deshabilitado={enviando} />
          </>
        }
      >
        <Tarjeta elevacion={2} estilo={{ gap: esp.lg }}>
          <Segmentado<Modo> valor={modo} onChange={(m) => { setModo(m); setError(null); }} opciones={[{ valor: 'codigo', texto: 'Código' }, { valor: 'qr', texto: 'Escanear QR' }]} />

          {modo === 'codigo' ? (
            <>
              {params?.codigo ? <BannerAlerta tipo="info" titulo="Enlace recibido" texto="El código ya está escrito. Solo tienes que confirmar." /> : null}
              <CampoTexto
                etiqueta="Código del chofer"
                value={codigo}
                onChangeText={(t) => { setCodigo(formatearCodigo(t)); setError(null); }}
                placeholder="BSL-XXXX-XXXX"
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={13}
                returnKeyType="done"
                onSubmitEditing={() => completo && vincular(codigo)}
                error={error}
                ayuda="Formato BSL-XXXX-XXXX. Válido 48 horas, de un solo uso."
                style={{ fontFamily: 'Inter_700Bold', fontSize: 20, letterSpacing: 1 }}
              />
            </>
          ) : !permiso ? (
            <View style={{ height: 240, borderRadius: radio.grande, backgroundColor: c.surface2 }} />
          ) : permiso.granted ? (
            <>
              <View style={{ height: 300, borderRadius: radio.grande, overflow: 'hidden', backgroundColor: '#000000' }}>
                <CameraView
                  style={{ flex: 1 }}
                  facing="back"
                  barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                  onBarcodeScanned={enviando ? undefined : alEscanear}
                />
                <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
                  <View style={{ width: 190, height: 190, borderRadius: 20, borderWidth: 3, borderColor: '#FFFFFF' }} />
                </View>
              </View>
              <Texto v="medio" color="text2" centro>
                {enviando ? 'Código leído. Vinculando…' : 'Apunta la cámara al código que te muestra el chofer en su celular.'}
              </Texto>
            </>
          ) : (
            <View style={{ gap: esp.md }}>
              <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                <Camera size={26} color={c.primary} strokeWidth={2} />
              </View>
              <Texto v="subtitulo">Permite usar la cámara</Texto>
              <Texto v="medio" color="text2">La usamos para escanear el código QR del chofer y para tu foto de perfil. Nunca grabamos ni compartimos video.</Texto>
              <View style={{ gap: 10 }}>
                <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                  <QrCode size={20} color={c.primary} strokeWidth={2} />
                  <Texto v="medio" style={{ flex: 1 }}>Escanear el QR: vincula a tu hijo en segundos</Texto>
                </View>
                <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                  <UserRound size={20} color={c.primary} strokeWidth={2} />
                  <Texto v="medio" style={{ flex: 1 }}>Tu foto: opcional, también puedes elegirla de la galería</Texto>
                </View>
              </View>
              {permiso.canAskAgain ? (
                <Boton titulo="Permitir cámara" icono={Camera} onPress={() => pedirPermiso()} />
              ) : (
                <Boton titulo="Abrir Ajustes" onPress={() => Linking.openSettings()} />
              )}
              <Boton titulo="Escribir el código a mano" variante="secundario" onPress={() => setModo('codigo')} />
              <Texto v="nota" color="text3">Si la niegas, puedes escribir el código del chofer a mano.</Texto>
            </View>
          )}
        </Tarjeta>
      </Pantalla>
    </ConTeclado>
  );
}
