// Se muestra mientras app/.env no tenga los datos de Supabase.
import React from 'react';
import { View } from 'react-native';
import { Pantalla, PasosNumerados, Texto } from '../../ui';
import { esp, fuentes, radio, sombra, useTema } from '../../tema';

export default function Configurar() {
  const { c } = useTema();
  return (
    <Pantalla titulo="Falta conectar el servidor" sobretitulo="Busetas Seguras Loja">
      <View style={{ backgroundColor: c.surface, borderRadius: radio.grande, padding: esp.lg, gap: esp.lg, ...sombra(c, 2) }}>
        <Texto v="cuerpo" color="text2">La app necesita un proyecto de Supabase para guardar rutas, estudiantes y recorridos. Se hace una sola vez:</Texto>
        <PasosNumerados
          pasos={[
            { texto: 'Crea un proyecto nuevo en supabase.com (región São Paulo).' },
            { texto: 'En SQL Editor ejecuta, en orden, los archivos 01 y 02 de la carpeta supabase.' },
            { texto: 'En Authentication, Sign In / Providers, desactiva Confirm email.' },
            { texto: 'En Settings, API, copia la URL del proyecto y la clave anon al archivo app/.env.' },
            { texto: 'Reinicia la app con el comando de abajo.' },
          ]}
        />
        <View style={{ backgroundColor: c.surface2, borderRadius: radio.campo, padding: esp.md }}>
          <Texto v="medio" selectable style={{ fontFamily: fuentes.semi }}>npm start -- -c</Texto>
        </View>
      </View>
      <View style={{ backgroundColor: c.surface2, borderRadius: radio.tarjeta, padding: esp.lg, gap: 6 }}>
        <Texto v="medioFuerte">Líneas que debe tener app/.env</Texto>
        <Texto v="nota" color="text2" selectable>EXPO_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co</Texto>
        <Texto v="nota" color="text2" selectable>EXPO_PUBLIC_SUPABASE_ANON_KEY=tu-clave-anon</Texto>
      </View>
    </Pantalla>
  );
}
