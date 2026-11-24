// 43 · Estudiantes: lista con filtro por escuela y estado de vinculación.
import React, { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ChevronRight, Plus, School, Search, Users } from 'lucide-react-native';
import {
  Avatar, BotonIcono, CampoTexto, Chip, EsqueletoLista, EstadoError, EstadoVacio, Pantalla, PillEstado, Tarjeta, Texto,
} from '../../ui';
import { margen, useTema } from '../../tema';
import { chofer, estadoVinculacion, type EstudianteLista } from '../../servicios/chofer';
import type { NavChofer } from '../../navegacion/tipos';
import { mensajeError, nombreCompleto } from '../../utils';
import { useCarga, useFotoEstudiante } from './_c2';

function Fila({ e, onPress }: { e: EstudianteLista; onPress: () => void }) {
  const { c } = useTema();
  const foto = useFotoEstudiante(e.photo_path);
  const nombre = nombreCompleto(e);
  const linea = [e.school?.short_name, e.grade].filter(Boolean).join(', ') || 'Sin escuela';
  return (
    <Tarjeta onPress={onPress} etiqueta={`${nombre}, ${linea}`} estilo={{ paddingVertical: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Avatar nombre={nombre} foto={foto} color={e.school?.color} tam={44} />
        <View style={{ flex: 1, gap: 2 }}>
          <Texto v="fuerte" numberOfLines={1}>{nombre}</Texto>
          <Texto v="nota" color="text2" numberOfLines={1}>{linea}</Texto>
        </View>
        <PillEstado estado={estadoVinculacion(e)} />
        <ChevronRight size={18} color={c.text3} strokeWidth={2} />
      </View>
    </Tarjeta>
  );
}

export default function Estudiantes() {
  const nav = useNavigation<NavChofer>();
  const { c } = useTema();
  const [filtro, setFiltro] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const { datos, cargando, refrescando, error, recargar, refrescar } = useCarga(async () => {
    const [estudiantes, escuelas] = await Promise.all([chofer.estudiantes(), chofer.escuelas()]);
    return { estudiantes, escuelas };
  });

  const visibles = useMemo(() => {
    if (!datos) return [];
    const q = busca.trim().toLowerCase();
    return datos.estudiantes.filter(
      (e) => (!filtro || e.school_id === filtro) && (!q || nombreCompleto(e).toLowerCase().includes(q) || (e.nickname ?? '').toLowerCase().includes(q)),
    );
  }, [datos, filtro, busca]);

  const total = datos?.estudiantes.length ?? 0;

  return (
    <Pantalla
      titulo="Estudiantes"
      subtitulo={datos ? (total === 1 ? '1 estudiante registrado' : `${total} estudiantes registrados`) : undefined}
      conBarra
      refrescando={refrescando}
      onRefrescar={refrescar}
      derecha={<BotonIcono icono={Plus} etiqueta="Agregar estudiante" sobreHero onPress={() => nav.navigate('EditarEstudiante')} />}
    >
      {cargando && !datos ? (
        <EsqueletoLista filas={4} />
      ) : error && !datos ? (
        <Tarjeta><EstadoError texto={mensajeError(error)} onReintentar={() => recargar()} /></Tarjeta>
      ) : datos && datos.escuelas.length === 0 && total === 0 ? (
        <Tarjeta>
          <EstadoVacio
            icono={School}
            titulo="Primero registra una escuela"
            texto="Cada estudiante pertenece a una escuela. Regístrala y luego agrega a tus estudiantes."
            accion="Registrar escuela"
            onAccion={() => nav.navigate('Escuelas')}
          />
        </Tarjeta>
      ) : total === 0 ? (
        <Tarjeta>
          <EstadoVacio
            icono={Users}
            titulo="Agrega a tus estudiantes"
            texto="Registra a cada niño con su dirección. Luego invitas a su representante con un código."
            accion="Agregar estudiante"
            onAccion={() => nav.navigate('EditarEstudiante')}
          />
        </Tarjeta>
      ) : datos ? (
        <>
          <Tarjeta estilo={{ paddingVertical: 12, gap: 12 }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: margen }} style={{ marginRight: -16 }}>
              <Chip texto={`Todos (${total})`} seleccionado={filtro === null} onPress={() => setFiltro(null)} />
              {datos.escuelas.map((s) => (
                <Chip
                  key={s.id}
                  texto={`${s.short_name} (${datos.estudiantes.filter((e) => e.school_id === s.id).length})`}
                  color={s.color}
                  seleccionado={filtro === s.id}
                  onPress={() => setFiltro(filtro === s.id ? null : s.id)}
                />
              ))}
            </ScrollView>
            {total > 8 ? (
              <CampoTexto
                etiqueta="Buscar por nombre"
                value={busca}
                onChangeText={setBusca}
                placeholder="Nombre o apellido"
                autoCorrect={false}
                returnKeyType="search"
                derecha={<Search size={18} color={c.text3} strokeWidth={2} />}
              />
            ) : null}
          </Tarjeta>
          {visibles.length === 0 ? (
            <Tarjeta><EstadoVacio compacto icono={Search} titulo="Sin resultados" texto="Ningún estudiante coincide con ese filtro." /></Tarjeta>
          ) : (
            visibles.map((e) => <Fila key={e.id} e={e} onPress={() => nav.navigate('FichaEstudiante', { studentId: e.id })} />)
          )}
        </>
      ) : null}
    </Pantalla>
  );
}
