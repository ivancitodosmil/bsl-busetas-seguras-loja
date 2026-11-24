// 16 · Soporte y preguntas frecuentes
import type { ScrollViewInstance } from 'react-native';
import React, { useRef, useState } from 'react';
import { Linking, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Mail, MessageCircle, SendHorizontal } from 'lucide-react-native';
import { Boton, Chip, ConTeclado, Pantalla, PasosNumerados, Texto } from '../../ui';
import { esp, fuentes, radio, useTema } from '../../tema';
import { useSesion } from '../../estado/sesion';
import { CONTACTO_SOPORTE, soporte, type Respuesta } from '../../servicios/soporte';
import type { Rol } from '../../tipos';

type Mensaje = { id: number; de: 'yo' } & { texto: string } | { id: number; de: 'bsl'; respuesta: Respuesta };

export default function Soporte() {
  const { c } = useTema();
  const nav = useNavigation();
  const usuario = useSesion((s) => s.usuario);
  const rol: Rol = usuario?.role ?? 'guardian';
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [texto, setTexto] = useState('');
  const [escribiendo, setEscribiendo] = useState(false);
  const lista = useRef<ScrollViewInstance>(null);
  const sec = useRef(0);

  const bajar = () => setTimeout(() => lista.current?.scrollToEnd({ animated: true }), 60);

  const preguntar = async (pregunta: string) => {
    const p = pregunta.trim();
    if (!p || escribiendo) return;
    setTexto('');
    setMensajes((m) => [...m, { id: ++sec.current, de: 'yo', texto: p }]);
    setEscribiendo(true);
    bajar();
    const respuesta = await soporte.responder(p, rol).catch((): Respuesta => ({ texto: 'No pudimos responder ahora. Escríbele a una persona del equipo BSL.', sinRespuesta: true }));
    setMensajes((m) => [...m, { id: ++sec.current, de: 'bsl', respuesta }]);
    setEscribiendo(false);
    bajar();
  };

  const whatsapp = () =>
    Linking.openURL(`https://wa.me/${CONTACTO_SOPORTE.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent('Hola, necesito ayuda con BSL.')}`).catch(() => {});
  const correo = () => Linking.openURL(`mailto:${CONTACTO_SOPORTE.correo}?subject=${encodeURIComponent('Ayuda con BSL')}`).catch(() => {});

  const burbujaBsl = { backgroundColor: c.surface, borderRadius: radio.grande, borderTopLeftRadius: 4, padding: esp.md, gap: esp.sm, alignSelf: 'flex-start' as const, maxWidth: '88%' as const, borderWidth: 1, borderColor: c.border };

  return (
    <ConTeclado>
      <Pantalla
        titulo="Soporte BSL"
        onAtras={() => nav.goBack()}
        scroll={false}
        sinMontar
        estiloContenido={{ flex: 1, marginTop: 0, paddingHorizontal: 0 }}
        pie={
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: esp.sm }}>
            <TextInput
              value={texto}
              onChangeText={setTexto}
              placeholder="Escribe tu pregunta"
              placeholderTextColor={c.text3}
              accessibilityLabel="Escribe tu pregunta"
              multiline
              maxLength={300}
              selectionColor={c.primary}
              style={{ flex: 1, minHeight: 52, maxHeight: 120, borderRadius: radio.tarjeta, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, paddingHorizontal: 14, paddingVertical: 14, fontFamily: fuentes.cuerpo, fontSize: 16, color: c.text }}
            />
            <Pressable
              onPress={() => preguntar(texto)}
              disabled={!texto.trim() || escribiendo}
              accessibilityRole="button"
              accessibilityLabel="Enviar pregunta"
              accessibilityState={{ disabled: !texto.trim() || escribiendo }}
              style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center', opacity: !texto.trim() || escribiendo ? 0.45 : 1 }}
            >
              <SendHorizontal size={22} color={c.onPrimary} strokeWidth={2} />
            </Pressable>
          </View>
        }
      >
        <ScrollView
          ref={lista}
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: esp.xl, gap: esp.md }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={burbujaBsl}>
            <Texto v="cuerpo">
              {usuario?.first_name ? `Hola, ${usuario.first_name}. ` : 'Hola. '}Soy el asistente de BSL. ¿En qué te ayudo?
            </Texto>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: esp.sm }}>
            {soporte.sugeridas(rol).map((p) => (
              <Chip key={p} texto={p} onPress={() => preguntar(p)} deshabilitado={escribiendo} />
            ))}
          </View>

          {mensajes.map((m) =>
            m.de === 'yo' ? (
              <View key={m.id} style={{ backgroundColor: c.primary, borderRadius: radio.grande, borderTopRightRadius: 4, padding: esp.md, alignSelf: 'flex-end', maxWidth: '88%' }}>
                <Texto v="cuerpo" color="onPrimary">{m.texto}</Texto>
              </View>
            ) : (
              <View key={m.id} style={burbujaBsl}>
                <Texto v="cuerpo">{m.respuesta.texto}</Texto>
                {m.respuesta.pasos ? <PasosNumerados pasos={m.respuesta.pasos.map((t) => ({ texto: t }))} /> : null}
                {m.respuesta.sinRespuesta ? (
                  <View style={{ gap: esp.sm, marginTop: 4 }}>
                    <Boton titulo="Escribir por WhatsApp" icono={MessageCircle} variante="exito" onPress={whatsapp} />
                    <Boton titulo="Enviar un correo" icono={Mail} variante="secundario" onPress={correo} />
                  </View>
                ) : null}
              </View>
            ),
          )}

          {escribiendo ? (
            <View style={burbujaBsl} accessibilityLiveRegion="polite">
              <Texto v="medio" color="text3">Escribiendo…</Texto>
            </View>
          ) : null}
        </ScrollView>
      </Pantalla>
    </ConTeclado>
  );
}
