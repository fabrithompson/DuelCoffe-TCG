import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  Modal,
  FlatList,
  Vibration,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Image,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { useSidebar } from '../../contexts/SidebarContext';
import { db, storage } from '../../config/firebase';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import * as ImagePicker from 'expo-image-picker';
import {
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  query,
  where,
} from 'firebase/firestore';
import Colors from '../../constants/colors';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TCGProducto {
  id: string;
  nombre: string;
  valor: number;
  descripcion: string;
  stock: number;
  fotoUrl?: string;
}

interface TCGJuego {
  id: string;
  nombre: string;
}

interface Partida {
  jugador1: string;
  jugador2: string | null;
  ganador: string | null;
}

interface Ronda {
  numero: number;
  partidas: Partida[];
  completada: boolean;
}

interface Torneo {
  id: string;
  tcgId: string;
  nombre: string;
  valorEntrada: number;
  premio: string;
  jugadores: string[];
  totalRondas: number;
  tiempoPorRonda: number;
  estado: 'pendiente' | 'en_curso' | 'finalizado';
  rondaActual: number;
  rondas: Ronda[];
}

type Vista =
  | { tipo: 'tcg_lista' }
  | { tipo: 'torneos_lista'; tcg: TCGJuego }
  | { tipo: 'crear_torneo'; tcg: TCGJuego }
  | { tipo: 'torneo_activo'; torneo: Torneo; tcg: TCGJuego };

// ─── Utils ────────────────────────────────────────────────────────────────────

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function crearPartidas(jugadores: string[]): Partida[] {
  const mezclados = shuffleArray(jugadores);
  const partidas: Partida[] = [];
  for (let i = 0; i < mezclados.length; i += 2) {
    partidas.push({
      jugador1: mezclados[i],
      jugador2: mezclados[i + 1] ?? null,
      ganador: mezclados[i + 1] ? null : mezclados[i],
    });
  }
  return partidas;
}

function calcularTabla(torneo: Torneo) {
  const stats: Record<string, { victorias: number; derrotas: number }> = {};
  torneo.jugadores.forEach((j) => { stats[j] = { victorias: 0, derrotas: 0 }; });

  torneo.rondas.forEach((ronda) => {
    ronda.partidas.forEach((p) => {
      if (!p.ganador) return;
      let perdedor: string | null = null;
      if (p.jugador2 !== null) {
        perdedor = p.ganador === p.jugador1 ? p.jugador2 : p.jugador1;
      }
      if (stats[p.ganador]) stats[p.ganador].victorias += 1;
      if (perdedor && stats[perdedor]) stats[perdedor].derrotas += 1;
    });
  });

  return torneo.jugadores
    .map((j) => {
      const total = stats[j].victorias + stats[j].derrotas;
      return {
        jugador: j,
        victorias: stats[j].victorias,
        derrotas: stats[j].derrotas,
        winrate: total > 0 ? Math.round((stats[j].victorias / total) * 100) : 0,
      };
    })
    .sort((a, b) => b.victorias - a.victorias || b.winrate - a.winrate);
}

function getMedalla(idx: number, finalizado: boolean): string | null {
  if (!finalizado) return null;
  if (idx === 0) return '🥇';
  if (idx === 1) return '🥈';
  if (idx === 2) return '🥉';
  return null;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ─── Timer ────────────────────────────────────────────────────────────────────

interface TimerProps {
  readonly minutos: number;
  readonly onFinish: () => void;
}

function Timer({ minutos, onFinish }: TimerProps) {
  const [segundos, setSegundos] = useState(minutos * 60);
  const [activo, setActivo] = useState(false);
  const [terminado, setTerminado] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  const porcentaje = segundos / (minutos * 60);
  function getColorTimer(pct: number): string {
    if (pct > 0.5) return Colors.success;
    if (pct > 0.2) return Colors.primary;
    return Colors.error;
  }
  const colorTimer = getColorTimer(porcentaje);

  useEffect(() => {
    if (terminado) {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.15, duration: 400, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
      ])
    ).start();
    Vibration.vibrate([500, 300, 500, 300, 500]);
    onFinishRef.current();
    }
  }, [terminado, pulseAnim]);

  useEffect(() => {
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  const iniciar = () => {
    if (terminado) return;
    setActivo(true);
    intervalRef.current = setInterval(() => {
      setSegundos((prev) => {
        if (prev <= 1) {
          clearInterval(intervalRef.current!);
          setActivo(false);
          setTerminado(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const pausar = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setActivo(false);
  };

  const reiniciar = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setActivo(false);
    setTerminado(false);
    setSegundos(minutos * 60);
    pulseAnim.setValue(1);
  };

  return (
    <Animated.View style={[styles.timerBox, { transform: [{ scale: pulseAnim }] }]}>
      <Text style={[styles.timerDisplay, { color: terminado ? Colors.error : colorTimer }]}>
        {terminado ? '⏰ FIN' : formatTime(segundos)}
      </Text>
      {terminado && <Text style={styles.timerFinText}>¡Se acabó el tiempo!</Text>}
      <View style={styles.timerBarBg}>
        <View style={[styles.timerBarFill, { width: `${porcentaje * 100}%`, backgroundColor: colorTimer }]} />
      </View>
      <View style={styles.timerBtns}>
        {!terminado && (
          <TouchableOpacity
            style={[styles.timerBtn, activo ? styles.timerBtnPause : styles.timerBtnPlay]}
            onPress={activo ? pausar : iniciar}
          >
            <Text style={styles.timerBtnText}>{activo ? '⏸ Pausar' : '▶ Iniciar'}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.timerBtnReset} onPress={reiniciar}>
          <Text style={styles.timerBtnResetText}>↺ Reiniciar</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

// ─── Productos Inventario ─────────────────────────────────────────────────────

function ProductosView() {
  const [productos, setProductos] = useState<TCGProducto[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editando, setEditando] = useState<TCGProducto | null>(null);
  const [nombre, setNombre] = useState('');
  const [valor, setValor] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [stock, setStock] = useState('1');
  const [fotoUri, setFotoUri] = useState<string | null>(null);
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'tcg_productos'), (snap) => {
      setProductos(snap.docs.map((d) => ({ id: d.id, ...d.data() } as TCGProducto)));
    });
    return unsub;
  }, []);

  const resetForm = () => {
    setNombre(''); setValor(''); setDescripcion(''); setStock('1');
    setFotoUri(null); setFotoUrl(null); setEditando(null);
  };

  const abrirEditar = (p: TCGProducto) => {
    setEditando(p);
    setNombre(p.nombre); setValor(String(p.valor));
    setDescripcion(p.descripcion); setStock(String(p.stock));
    setFotoUri(null); setFotoUrl(p.fotoUrl ?? null);
    setModalVisible(true);
  };

  const pickFoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permiso denegado', 'Necesitamos acceso a tu galería.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.7 });
    if (!result.canceled && result.assets[0]) setFotoUri(result.assets[0].uri);
  };

  const tomarFoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permiso denegado', 'Necesitamos acceso a la cámara.'); return; }
    const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.7 });
    if (!result.canceled && result.assets[0]) setFotoUri(result.assets[0].uri);
  };

  const mostrarOpcionesFoto = () => {
    Alert.alert('Foto del producto', 'Elegí origen', [
      { text: '📷 Cámara', onPress: () => { void tomarFoto(); } },
      { text: '🖼️ Galería', onPress: () => { void pickFoto(); } },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  };

  const guardar = async () => {
    if (!nombre.trim() || !valor.trim()) { Alert.alert('Error', 'Nombre y valor son obligatorios.'); return; }
    const valorNum = Number.parseFloat(valor);
    const stockNum = Number.parseInt(stock, 10);
    if (Number.isNaN(valorNum) || valorNum < 0) { Alert.alert('Error', 'El valor debe ser un número válido.'); return; }
    setUploading(true);
    try {
      let fotoFinal = fotoUrl;
      if (fotoUri) {
        const response = await fetch(fotoUri);
        const blob = await response.blob();
        const sRef = storageRef(storage, `tcg_productos/${editando?.id ?? Date.now()}_${Date.now()}.jpg`);
        await uploadBytes(sRef, blob);
        fotoFinal = await getDownloadURL(sRef);
      }
      const data = {
        nombre: nombre.trim(), valor: valorNum,
        descripcion: descripcion.trim(),
        stock: Number.isFinite(stockNum) ? stockNum : 1,
        fotoUrl: fotoFinal ?? null,
      };
      if (editando) {
        await updateDoc(doc(db, 'tcg_productos', editando.id), data);
      } else {
        await addDoc(collection(db, 'tcg_productos'), { ...data, creadoEn: serverTimestamp() });
      }
      resetForm(); setModalVisible(false);
    } catch (error) { console.error('Error al guardar producto:', error); Alert.alert('Error', 'No se pudo guardar.'); }
    finally { setUploading(false); }
  };

  const eliminar = (p: TCGProducto) => {
    Alert.alert('Eliminar', `¿Eliminar "${p.nombre}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: () => { deleteDoc(doc(db, 'tcg_productos', p.id)).catch(console.error); } },
    ]);
  };

  const cambiarStock = (id: string, delta: number, stockActual: number) => {
    const nuevo = Math.max(0, stockActual + delta);
    updateDoc(doc(db, 'tcg_productos', id), { stock: nuevo }).catch(console.error);
  };

  const fotoPreview = fotoUri ?? fotoUrl ?? null;

  return (
    <View style={styles.flex}>
      <View style={styles.seccionHeader}>
        <Text style={styles.seccionTitle}>Inventario TCG</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => { resetForm(); setModalVisible(true); }}>
          <Text style={styles.addBtnText}>+ Nuevo</Text>
        </TouchableOpacity>
      </View>

      {productos.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>📦</Text>
          <Text style={styles.emptyTitle}>Sin productos</Text>
          <Text style={styles.emptySub}>Agregá carpetas, sobres, cajas y más</Text>
        </View>
      ) : (
        <FlatList
          data={productos}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <View style={styles.productoCard}>
              {/* Foto o placeholder */}
              <View style={styles.productoImgBox}>
                {item.fotoUrl
                  ? <Image source={{ uri: item.fotoUrl }} style={styles.productoImg} />
                  : <View style={styles.productoImgPlaceholder}><Text style={styles.productoImgIcon}>📦</Text></View>
                }
              </View>
              <View style={styles.productoInfo}>
                <Text style={styles.productoNombre}>{item.nombre}</Text>
                {!!item.descripcion && <Text style={styles.productoDesc} numberOfLines={1}>{item.descripcion}</Text>}
                <Text style={styles.productoValor}>${item.valor.toFixed(2)}</Text>
              </View>
              <View style={styles.stockControl}>
                <TouchableOpacity style={styles.stockBtn} onPress={() => cambiarStock(item.id, -1, item.stock)}>
                  <Text style={styles.stockBtnText}>−</Text>
                </TouchableOpacity>
                <View style={styles.stockBadge}>
                  <Text style={styles.stockNum}>{item.stock}</Text>
                </View>
                <TouchableOpacity style={styles.stockBtn} onPress={() => cambiarStock(item.id, 1, item.stock)}>
                  <Text style={styles.stockBtnText}>+</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.cardActions}>
                <TouchableOpacity onPress={() => abrirEditar(item)} style={styles.iconBtn}><Text>✏️</Text></TouchableOpacity>
                <TouchableOpacity onPress={() => eliminar(item)} style={styles.iconBtn}><Text>🗑️</Text></TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}

      <Modal visible={modalVisible} transparent animationType="fade">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <ScrollView contentContainerStyle={styles.modalScrollContent} keyboardShouldPersistTaps="handled">
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>{editando ? 'Editar producto' : 'Nuevo producto'}</Text>

              {/* Foto */}
              <Text style={styles.modalLabel}>Foto del producto</Text>
              <View style={styles.fotoRow}>
                <TouchableOpacity style={styles.fotoBtn} onPress={mostrarOpcionesFoto}>
                  {fotoPreview
                    ? <Image source={{ uri: fotoPreview }} style={styles.fotoPrev} />
                    : <View style={styles.fotoPlaceholder}><Text style={styles.fotoIcon}>📷</Text><Text style={styles.fotoText}>Subir foto</Text></View>
                  }
                </TouchableOpacity>
                {fotoPreview && (
                  <TouchableOpacity style={styles.fotoRemove} onPress={() => { setFotoUri(null); setFotoUrl(null); }}>
                    <Text style={styles.fotoRemoveText}>✕ Quitar</Text>
                  </TouchableOpacity>
                )}
              </View>

              <Text style={styles.modalLabel}>Nombre *</Text>
              <TextInput style={styles.modalInput} placeholder="Ej: Sobre Pokémon SV1" placeholderTextColor={Colors.textLight} value={nombre} onChangeText={setNombre} />
              <Text style={styles.modalLabel}>Valor *</Text>
              <TextInput style={styles.modalInput} placeholder="0.00" placeholderTextColor={Colors.textLight} value={valor} onChangeText={setValor} keyboardType="decimal-pad" />
              <Text style={styles.modalLabel}>Stock inicial</Text>
              <TextInput style={styles.modalInput} placeholder="1" placeholderTextColor={Colors.textLight} value={stock} onChangeText={setStock} keyboardType="number-pad" />
              <Text style={styles.modalLabel}>Descripción</Text>
              <TextInput style={[styles.modalInput, styles.modalInputMulti]} placeholder="Descripción opcional..." placeholderTextColor={Colors.textLight} value={descripcion} onChangeText={setDescripcion} multiline />
              <View style={styles.modalBtns}>
                <TouchableOpacity style={styles.modalCancelBtn} onPress={() => { setModalVisible(false); resetForm(); }}>
                  <Text style={styles.modalCancelText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalSaveBtn} onPress={() => { void guardar(); }} disabled={uploading}>
                  {uploading ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.modalSaveText}>Guardar</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
// ─── Rondas ───────────────────────────────────────────────────────────────────

interface RondasViewProps {
  readonly torneo: Torneo;
  readonly onUpdate: (torneo: Torneo) => void;
  readonly onVerTabla: () => void;
}

function RondasView({ torneo, onUpdate, onVerTabla }: RondasViewProps) {
  const [timerFinished, setTimerFinished] = useState(false);
  const rondaActual = torneo.rondas[torneo.rondaActual - 1];
  if (!rondaActual) return null;

  const todasCompletadas = rondaActual.partidas.every((p) => p.ganador !== null);

  const seleccionarGanador = async (partidaIndex: number, ganador: string) => {
    const nuevasRondas = torneo.rondas.map((r, ri) => {
      if (ri !== torneo.rondaActual - 1) return r;
      const nuevasPartidas = r.partidas.map((p, pi) => pi === partidaIndex ? { ...p, ganador } : p);
      return { ...r, partidas: nuevasPartidas, completada: nuevasPartidas.every((p) => p.ganador !== null) };
    });
    const torneoActualizado = { ...torneo, rondas: nuevasRondas };
    onUpdate(torneoActualizado);
    try { await updateDoc(doc(db, 'torneos', torneo.id), { rondas: nuevasRondas }); }
    catch (error) { console.error('Error al guardar ganador:', error); }
  };

  const siguienteRonda = async () => {
    if (!todasCompletadas) { Alert.alert('Faltan resultados', 'Seleccioná el ganador de todas las partidas primero.'); return; }
    const esUltimaRonda = torneo.rondaActual >= torneo.totalRondas;
    if (esUltimaRonda) {
      Alert.alert('🏆 Finalizar torneo', '¿Terminar el torneo y ver la tabla final?', [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Finalizar', onPress: async () => {
            try {
              await updateDoc(doc(db, 'torneos', torneo.id), { estado: 'finalizado' });
              onUpdate({ ...torneo, estado: 'finalizado' });
              onVerTabla();
            } catch (error) { console.error('Error al finalizar:', error); }
          },
        },
      ]);
      return;
    }
    const nuevaRondaNum = torneo.rondaActual + 1;
    const nuevaRonda: Ronda = { numero: nuevaRondaNum, partidas: crearPartidas(torneo.jugadores), completada: false };
    const nuevasRondas = [...torneo.rondas, nuevaRonda];
    setTimerFinished(false);
    const torneoActualizado = { ...torneo, rondaActual: nuevaRondaNum, rondas: nuevasRondas };
    onUpdate(torneoActualizado);
    try { await updateDoc(doc(db, 'torneos', torneo.id), { rondaActual: nuevaRondaNum, rondas: nuevasRondas }); }
    catch (error) { console.error('Error al avanzar ronda:', error); }
  };

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.rondasContent}>
      <View style={styles.rondaInfo}>
        <Text style={styles.rondaNumero}>Ronda {torneo.rondaActual} / {torneo.totalRondas}</Text>
        <Text style={styles.rondaSubtitle}>{torneo.nombre}</Text>
      </View>

      <Timer minutos={torneo.tiempoPorRonda} onFinish={() => setTimerFinished(true)} />

      {timerFinished && !todasCompletadas && (
        <View style={styles.timerAlertBox}>
          <Text style={styles.timerAlertText}>⏰ Tiempo terminado — seleccioná los ganadores</Text>
        </View>
      )}

      <Text style={styles.partidasTitle}>Enfrentamientos</Text>

      {rondaActual.partidas.map((partida, idx) => {
        const partidaKey = `${partida.jugador1}-${partida.jugador2 ?? 'bye'}-${String(idx)}`;
        return (
          <View key={partidaKey} style={styles.partidaCard}>
            {partida.jugador2 === null ? (
              <View style={styles.byeCard}>
                <Text style={styles.byeText}>🎯 {partida.jugador1}</Text>
                <View style={styles.byeBadge}>
                  <Text style={styles.byeBadgeText}>BYE — Pasa automáticamente</Text>
                </View>
              </View>
            ) : (
              <View style={styles.jugadoresRow}>
                <TouchableOpacity
                  style={[styles.jugadorBtn, partida.ganador === partida.jugador1 && styles.jugadorGanador]}
                  onPress={() => { void seleccionarGanador(idx, partida.jugador1); }}
                >
                  <Text style={[styles.jugadorNombre, partida.ganador === partida.jugador1 && styles.jugadorNombreGanador]}>
                    {partida.jugador1}
                  </Text>
                  {partida.ganador === partida.jugador1 && <Text style={styles.ganadorBadge}>👑 Ganador</Text>}
                </TouchableOpacity>

                <View style={styles.vsCircle}><Text style={styles.vsText}>VS</Text></View>

                <TouchableOpacity
                  style={[styles.jugadorBtn, partida.ganador === partida.jugador2 && styles.jugadorGanador]}
                  onPress={() => { void seleccionarGanador(idx, partida.jugador2!); }}
                >
                  <Text style={[styles.jugadorNombre, partida.ganador === partida.jugador2 && styles.jugadorNombreGanador]}>
                    {partida.jugador2}
                  </Text>
                  {partida.ganador === partida.jugador2 && <Text style={styles.ganadorBadge}>👑 Ganador</Text>}
                </TouchableOpacity>
              </View>
            )}
          </View>
        );
      })}

      <TouchableOpacity
        style={[styles.nextRoundBtn, !todasCompletadas && styles.nextRoundBtnDisabled]}
        onPress={() => { void siguienteRonda(); }}
      >
        <Text style={styles.nextRoundBtnText}>
          {torneo.rondaActual >= torneo.totalRondas ? '🏆 Finalizar torneo' : 'Siguiente ronda →'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.verTablaBtn} onPress={onVerTabla}>
        <Text style={styles.verTablaBtnText}>📊 Ver tabla de posiciones</Text>
      </TouchableOpacity>

      <View style={styles.bottomPad} />
    </ScrollView>
  );
}

// ─── Tabla ────────────────────────────────────────────────────────────────────

interface TablaViewProps {
  readonly torneo: Torneo;
  readonly onVolver: () => void;
}

function TablaView({ torneo, onVolver }: TablaViewProps) {
  const tabla = calcularTabla(torneo);
  const rondasJugadas = torneo.rondas.filter((r) => r.completada).length;
  const esFinalizado = torneo.estado === 'finalizado';

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.tablaContent}>
      <View style={styles.tablaHeader}>
        <Text style={styles.tablaTitulo}>{esFinalizado ? '🏆 Tabla Final' : '📊 Posiciones'}</Text>
        <Text style={styles.tablaSubtitulo}>{torneo.nombre} · {rondasJugadas}/{torneo.totalRondas} rondas</Text>
        {!!torneo.premio && (
          <View style={styles.premioBox}>
            <Text style={styles.premioLabel}>🎁 Premio</Text>
            <Text style={styles.premioText}>{torneo.premio}</Text>
          </View>
        )}
      </View>

      <View style={styles.tablaEncabezado}>
        <Text style={[styles.tablaCol, styles.tablaPosCol]}>#</Text>
        <Text style={[styles.tablaCol, styles.tablaNombreCol]}>Jugador</Text>
        <Text style={[styles.tablaCol, styles.tablaNumCol]}>V</Text>
        <Text style={[styles.tablaCol, styles.tablaNumCol]}>D</Text>
        <Text style={[styles.tablaCol, styles.tablaWinCol]}>Win%</Text>
      </View>

      {tabla.map((fila, idx) => {
        const medalla = getMedalla(idx, esFinalizado);
        return (
          <View key={fila.jugador} style={[styles.tablaFila, idx === 0 && styles.tablaFilaPrimero]}>
            <View style={[styles.tablaCol, styles.tablaPosCol]}>
              {medalla
                ? <Text style={styles.tablaTrophy}>{medalla}</Text>
                : <Text style={styles.tablaPosNum}>{idx + 1}</Text>
              }
            </View>
            <Text style={[styles.tablaCol, styles.tablaNombreCol, styles.tablaNombreText]}>{fila.jugador}</Text>
            <Text style={[styles.tablaCol, styles.tablaNumCol, styles.tablaVicText]}>{fila.victorias}</Text>
            <Text style={[styles.tablaCol, styles.tablaNumCol, styles.tablaDerText]}>{fila.derrotas}</Text>
            <Text style={[styles.tablaCol, styles.tablaWinCol, styles.tablaWinText]}>{fila.winrate}%</Text>
          </View>
        );
      })}

      <TouchableOpacity style={styles.volverBtn} onPress={onVolver}>
        <Text style={styles.volverBtnText}>← Volver a rondas</Text>
      </TouchableOpacity>
      <View style={styles.bottomPad} />
    </ScrollView>
  );
}

// ─── Torneo Activo ────────────────────────────────────────────────────────────

interface TorneoActivoViewProps {
  readonly torneo: Torneo;
  readonly tcg: TCGJuego;
  readonly onVolver: () => void;
}

function TorneoActivoView({ torneo: torneoInicial, tcg, onVolver }: TorneoActivoViewProps) {
  const [torneo, setTorneo] = useState(torneoInicial);
  const [vistaActiva, setVistaActiva] = useState<'rondas' | 'tabla'>('rondas');

  return (
    <View style={styles.flex}>
      <View style={styles.subHeader}>
        <TouchableOpacity onPress={onVolver} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← {tcg.nombre}</Text>
        </TouchableOpacity>
        <View style={styles.subHeaderTabs}>
          <TouchableOpacity
            style={[styles.subTab, vistaActiva === 'rondas' && styles.subTabActive]}
            onPress={() => setVistaActiva('rondas')}
          >
            <Text style={[styles.subTabText, vistaActiva === 'rondas' && styles.subTabTextActive]}>⚔️ Rondas</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.subTab, vistaActiva === 'tabla' && styles.subTabActive]}
            onPress={() => setVistaActiva('tabla')}
          >
            <Text style={[styles.subTabText, vistaActiva === 'tabla' && styles.subTabTextActive]}>📊 Tabla</Text>
          </TouchableOpacity>
        </View>
      </View>

      {vistaActiva === 'rondas'
        ? <RondasView torneo={torneo} onUpdate={setTorneo} onVerTabla={() => setVistaActiva('tabla')} />
        : <TablaView torneo={torneo} onVolver={() => setVistaActiva('rondas')} />
      }
    </View>
  );
}

// ─── Crear Torneo ─────────────────────────────────────────────────────────────

interface CrearTorneoViewProps {
  readonly tcg: TCGJuego;
  readonly onVolver: () => void;
  readonly onCreate: (torneo: Torneo) => void;
}

function CrearTorneoView({ tcg, onVolver, onCreate }: CrearTorneoViewProps) {
  const [nombre, setNombre] = useState('');
  const [valorEntrada, setValorEntrada] = useState('');
  const [premio, setPremio] = useState('');
  const [rondas, setRondas] = useState('3');
  const [tiempo, setTiempo] = useState('50');
  const [jugadorInput, setJugadorInput] = useState('');
  const [jugadores, setJugadores] = useState<string[]>([]);

  const agregarJugador = () => {
    const n = jugadorInput.trim();
    if (!n) return;
    if (jugadores.includes(n)) { Alert.alert('Duplicado', 'Ese jugador ya está anotado.'); return; }
    setJugadores([...jugadores, n]);
    setJugadorInput('');
  };

  const crear = async () => {
    if (!nombre.trim()) { Alert.alert('Error', 'El nombre del torneo es obligatorio.'); return; }
    if (jugadores.length < 2) { Alert.alert('Error', 'Necesitás al menos 2 jugadores.'); return; }
    const totalRondas = Number.parseInt(rondas, 10);
    const tiempoPorRonda = Number.parseInt(tiempo, 10);
    if (Number.isNaN(totalRondas) || totalRondas < 1) { Alert.alert('Error', 'Cantidad de rondas inválida.'); return; }
    if (Number.isNaN(tiempoPorRonda) || tiempoPorRonda < 1) { Alert.alert('Error', 'Tiempo de ronda inválido.'); return; }

    const primeraRonda: Ronda = { numero: 1, partidas: crearPartidas(jugadores), completada: false };
    const data = {
      tcgId: tcg.id, nombre: nombre.trim(),
      valorEntrada: Number.parseFloat(valorEntrada) || 0,
      premio: premio.trim(), jugadores,
      totalRondas, tiempoPorRonda,
      estado: 'en_curso' as const,
      rondaActual: 1, rondas: [primeraRonda],
      creadoEn: serverTimestamp(),
    };

    try {
      const ref = await addDoc(collection(db, 'torneos'), data);
      onCreate({ id: ref.id, ...data });
    } catch (error) { console.error('Error al crear torneo:', error); Alert.alert('Error', 'No se pudo crear el torneo.'); }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.crearContent} keyboardShouldPersistTaps="handled">
        <View style={styles.crearHeader}>
          <TouchableOpacity onPress={onVolver} style={styles.backBtn}>
            <Text style={styles.backBtnText}>← {tcg.nombre}</Text>
          </TouchableOpacity>
          <Text style={styles.crearTitulo}>Nuevo torneo</Text>
        </View>

        <Text style={styles.formLabel}>Nombre del torneo *</Text>
        <TextInput style={styles.formInput} placeholder="Ej: Torneo de Apertura" placeholderTextColor={Colors.textLight} value={nombre} onChangeText={setNombre} />

        <Text style={styles.formLabel}>Valor de entrada ($)</Text>
        <TextInput style={styles.formInput} placeholder="0.00" placeholderTextColor={Colors.textLight} value={valorEntrada} onChangeText={setValorEntrada} keyboardType="decimal-pad" />

        <Text style={styles.formLabel}>Premio / Por lo que se juega</Text>
        <TextInput style={styles.formInput} placeholder="Ej: Sobre de campeón, taza..." placeholderTextColor={Colors.textLight} value={premio} onChangeText={setPremio} />

        <View style={styles.rowInputs}>
          <View style={styles.rowInputItem}>
            <Text style={styles.formLabel}>Rondas</Text>
            <TextInput style={styles.formInput} value={rondas} onChangeText={setRondas} keyboardType="number-pad" />
          </View>
          <View style={styles.rowInputItem}>
            <Text style={styles.formLabel}>Tiempo (min)</Text>
            <TextInput style={styles.formInput} value={tiempo} onChangeText={setTiempo} keyboardType="number-pad" />
          </View>
        </View>

        <Text style={styles.formLabel}>Jugadores ({jugadores.length})</Text>
        <View style={styles.jugadorInputRow}>
          <TextInput
            style={styles.jugadorInput}
            placeholder="Nombre del jugador"
            placeholderTextColor={Colors.textLight}
            value={jugadorInput}
            onChangeText={setJugadorInput}
            onSubmitEditing={agregarJugador}
            returnKeyType="done"
          />
          <TouchableOpacity style={styles.jugadorAddBtn} onPress={agregarJugador}>
            <Text style={styles.jugadorAddText}>+ Agregar</Text>
          </TouchableOpacity>
        </View>

        {jugadores.length > 0 && (
          <View style={styles.jugadoresList}>
            {jugadores.map((j, idx) => (
              <View key={j} style={styles.jugadorChip}>
                <Text style={styles.jugadorChipNum}>{idx + 1}</Text>
                <Text style={styles.jugadorChipNombre}>{j}</Text>
                <TouchableOpacity
                  onPress={() => setJugadores(jugadores.filter((x) => x !== j))}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.jugadorChipX}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        <TouchableOpacity
          style={[styles.crearBtn, jugadores.length < 2 && styles.crearBtnDisabled]}
          onPress={() => { void crear(); }}
          disabled={jugadores.length < 2}
        >
          <Text style={styles.crearBtnText}>⚔️ Crear torneo y comenzar</Text>
        </TouchableOpacity>
        <View style={styles.bottomPad} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Lista Torneos ────────────────────────────────────────────────────────────

interface TorneosListaViewProps {
  readonly tcg: TCGJuego;
  readonly onVolver: () => void;
  readonly onCrear: () => void;
  readonly onSeleccionar: (torneo: Torneo) => void;
}

function TorneosListaView({ tcg, onVolver, onCrear, onSeleccionar }: TorneosListaViewProps) {
  const [torneos, setTorneos] = useState<Torneo[]>([]);

  useEffect(() => {
    const q = query(collection(db, 'torneos'), where('tcgId', '==', tcg.id));
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Torneo));
      data.sort((a, b) => b.rondaActual - a.rondaActual);
      setTorneos(data);
    });
    return unsub;
  }, [tcg.id]);

  const eliminar = (t: Torneo) => {
    Alert.alert('Eliminar torneo', `¿Eliminar "${t.nombre}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: () => { deleteDoc(doc(db, 'torneos', t.id)).catch(console.error); } },
    ]);
  };

  return (
    <View style={styles.flex}>
      <View style={styles.subHeader}>
        <TouchableOpacity onPress={onVolver} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← TCGs</Text>
        </TouchableOpacity>
        <Text style={styles.subHeaderTitle}>🃏 {tcg.nombre}</Text>
        <TouchableOpacity style={styles.addBtnSmall} onPress={onCrear}>
          <Text style={styles.addBtnSmallText}>+ Torneo</Text>
        </TouchableOpacity>
      </View>

      {torneos.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>⚔️</Text>
          <Text style={styles.emptyTitle}>Sin torneos</Text>
          <Text style={styles.emptySub}>Creá el primer torneo de {tcg.nombre}</Text>
          <TouchableOpacity style={styles.emptyBtn} onPress={onCrear}>
            <Text style={styles.emptyBtnText}>+ Crear torneo</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={torneos}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.torneoCard} onPress={() => onSeleccionar(item)}>
              <View style={styles.torneoInfo}>
                <View style={styles.torneoTitleRow}>
                  <Text style={styles.torneoNombre}>{item.nombre}</Text>
                  <View style={[styles.estadoBadge, item.estado === 'finalizado' ? styles.estadoFinalizado : styles.estadoEnCurso]}>
                    <Text style={styles.estadoText}>
                      {item.estado === 'finalizado' ? '✅ Final' : `⚔️ Ronda ${item.rondaActual}/${item.totalRondas}`}
                    </Text>
                  </View>
                </View>
                <Text style={styles.torneoDetalle}>{item.jugadores.length} jugadores · {item.totalRondas} rondas · {item.tiempoPorRonda}min</Text>
                {item.valorEntrada > 0 && <Text style={styles.torneoValor}>Entrada: ${item.valorEntrada}</Text>}
              </View>
              <TouchableOpacity onPress={() => eliminar(item)} style={styles.iconBtn}><Text>🗑️</Text></TouchableOpacity>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

// ─── TCG Lista ────────────────────────────────────────────────────────────────

interface TCGListaViewProps {
  readonly onSeleccionarTCG: (tcg: TCGJuego) => void;
}

function TCGListaView({ onSeleccionarTCG }: TCGListaViewProps) {
  const [juegos, setJuegos] = useState<TCGJuego[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editando, setEditando] = useState<TCGJuego | null>(null);
  const [nombre, setNombre] = useState('');

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'tcg_juegos'), (snap) => {
      setJuegos(snap.docs.map((d) => ({ id: d.id, ...d.data() } as TCGJuego)));
    });
    return unsub;
  }, []);

  const guardar = async () => {
    if (!nombre.trim()) { Alert.alert('Error', 'El nombre es obligatorio.'); return; }
    try {
      if (editando) {
        await updateDoc(doc(db, 'tcg_juegos', editando.id), { nombre: nombre.trim() });
      } else {
        await addDoc(collection(db, 'tcg_juegos'), { nombre: nombre.trim(), creadoEn: serverTimestamp() });
      }
      setNombre(''); setEditando(null); setModalVisible(false);
    } catch (error) { console.error('Error al guardar TCG:', error); Alert.alert('Error', 'No se pudo guardar.'); }
  };

  const eliminar = (j: TCGJuego) => {
    Alert.alert('Eliminar', `¿Eliminar "${j.nombre}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: () => { deleteDoc(doc(db, 'tcg_juegos', j.id)).catch(console.error); } },
    ]);
  };

  return (
    <View style={styles.flex}>
      <View style={styles.seccionHeader}>
        <Text style={styles.seccionTitle}>Juegos TCG</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => { setNombre(''); setEditando(null); setModalVisible(true); }}>
          <Text style={styles.addBtnText}>+ Nuevo</Text>
        </TouchableOpacity>
      </View>

      {juegos.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>🃏</Text>
          <Text style={styles.emptyTitle}>Sin juegos TCG</Text>
          <Text style={styles.emptySub}>Agregá Pokémon, Magic, Yu-Gi-Oh y más</Text>
        </View>
      ) : (
        <FlatList
          data={juegos}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.tcgCard} onPress={() => onSeleccionarTCG(item)}>
              <View style={styles.tcgIconCircle}>
                <Text style={styles.tcgIconText}>{item.nombre.charAt(0).toUpperCase()}</Text>
              </View>
              <Text style={styles.tcgNombre}>{item.nombre}</Text>
              <Text style={styles.tcgArrow}>→</Text>
              <TouchableOpacity onPress={() => { setEditando(item); setNombre(item.nombre); setModalVisible(true); }} style={styles.iconBtn}>
                <Text>✏️</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => eliminar(item)} style={styles.iconBtn}>
                <Text>🗑️</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          )}
        />
      )}

      <Modal visible={modalVisible} transparent animationType="fade">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{editando ? 'Editar TCG' : 'Nuevo TCG'}</Text>
            <Text style={styles.modalLabel}>Nombre del juego *</Text>
            <TextInput style={styles.modalInput} placeholder="Ej: Pokémon, Magic, Yu-Gi-Oh..." placeholderTextColor={Colors.textLight} value={nombre} onChangeText={setNombre} autoFocus />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => { setModalVisible(false); setNombre(''); }}>
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={() => { void guardar(); }}>
                <Text style={styles.modalSaveText}>Guardar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ─── Pantalla Principal ───────────────────────────────────────────────────────

export default function TorneosScreen() {
  const { seccion } = useLocalSearchParams<{ seccion?: string }>();
  const { open: openNav } = useSidebar();
  const [seccionActiva, setSeccionActiva] = useState<'productos' | 'tcg'>('tcg');
  const [vista, setVista] = useState<Vista>({ tipo: 'tcg_lista' });

  useEffect(() => {
    if (seccion === 'inventario') setSeccionActiva('productos');
    if (seccion === 'tcg') { setSeccionActiva('tcg'); setVista({ tipo: 'tcg_lista' }); }
  }, [seccion]);

  const renderContenido = () => {
    if (seccionActiva === 'productos') return <ProductosView />;
    switch (vista.tipo) {
      case 'tcg_lista':
        return <TCGListaView onSeleccionarTCG={(tcg) => setVista({ tipo: 'torneos_lista', tcg })} />;
      case 'torneos_lista':
        return (
          <TorneosListaView
            tcg={vista.tcg}
            onVolver={() => setVista({ tipo: 'tcg_lista' })}
            onCrear={() => setVista({ tipo: 'crear_torneo', tcg: vista.tcg })}
            onSeleccionar={(torneo) => setVista({ tipo: 'torneo_activo', torneo, tcg: vista.tcg })}
          />
        );
      case 'crear_torneo':
        return (
          <CrearTorneoView
            tcg={vista.tcg}
            onVolver={() => setVista({ tipo: 'torneos_lista', tcg: vista.tcg })}
            onCreate={(torneo) => setVista({ tipo: 'torneo_activo', torneo, tcg: vista.tcg })}
          />
        );
      case 'torneo_activo':
        return (
          <TorneoActivoView
            torneo={vista.torneo}
            tcg={vista.tcg}
            onVolver={() => setVista({ tipo: 'torneos_lista', tcg: vista.tcg })}
          />
        );
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.hamburger} onPress={openNav}>
          <View style={styles.hamburgerLine} />
          <View style={styles.hamburgerLine} />
          <View style={styles.hamburgerLine} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>🃏 TCG</Text>
        <View style={styles.headerTabs}>
          <TouchableOpacity
            style={[styles.headerTab, seccionActiva === 'tcg' && styles.headerTabActive]}
            onPress={() => { setSeccionActiva('tcg'); setVista({ tipo: 'tcg_lista' }); }}
          >
            <Text style={[styles.headerTabText, seccionActiva === 'tcg' && styles.headerTabTextActive]}>Torneos</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.headerTab, seccionActiva === 'productos' && styles.headerTabActive]}
            onPress={() => setSeccionActiva('productos')}
          >
            <Text style={[styles.headerTabText, seccionActiva === 'productos' && styles.headerTabTextActive]}>Inventario</Text>
          </TouchableOpacity>
        </View>
      </View>
      {renderContenido()}
    </SafeAreaView>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: Colors.background },
  bottomPad: { height: 60 },
  header: {
    backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border,
    paddingHorizontal: 14, paddingVertical: 12,
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  hamburger: { padding: 6, gap: 5, justifyContent: 'center' },
  hamburgerLine: { width: 22, height: 2.5, backgroundColor: Colors.text, borderRadius: 2 },
  headerTitle: { fontSize: 20, fontWeight: '800', color: Colors.text },
  headerTabs: { flex: 1, flexDirection: 'row', gap: 8, justifyContent: 'flex-end' },
  headerTab: {
    paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20,
    backgroundColor: Colors.background, borderWidth: 1.5, borderColor: Colors.border,
  },
  headerTabActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  headerTabText: { fontSize: 13, fontWeight: '600', color: Colors.textLight },
  headerTabTextActive: { color: Colors.white },
  subHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  subHeaderTitle: { fontSize: 16, fontWeight: '700', color: Colors.text, flex: 1, textAlign: 'center' },
  subHeaderTabs: { flexDirection: 'row', gap: 6 },
  subTab: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 14,
    backgroundColor: Colors.background, borderWidth: 1.5, borderColor: Colors.border,
  },
  subTabActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  subTabText: { fontSize: 13, fontWeight: '600', color: Colors.textLight },
  subTabTextActive: { color: Colors.white },
  backBtn: { paddingVertical: 4 },
  backBtnText: { fontSize: 14, color: Colors.primary, fontWeight: '600' },
  seccionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  seccionTitle: { fontSize: 18, fontWeight: '800', color: Colors.text },
  addBtn: { backgroundColor: Colors.primary, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12 },
  addBtnText: { color: Colors.white, fontWeight: '700', fontSize: 14 },
  addBtnSmall: { backgroundColor: Colors.primary, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
  addBtnSmallText: { color: Colors.white, fontWeight: '700', fontSize: 13 },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyEmoji: { fontSize: 60, marginBottom: 14 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: Colors.text, textAlign: 'center' },
  emptySub: { fontSize: 14, color: Colors.textLight, marginTop: 6, textAlign: 'center' },
  emptyBtn: { marginTop: 20, backgroundColor: Colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 14 },
  emptyBtnText: { color: Colors.white, fontWeight: '700', fontSize: 15 },
  listContent: { padding: 16 },
  productoCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.white, borderRadius: 16, padding: 14, marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.07, shadowRadius: 4, elevation: 2,
  },
  productoInfo: { flex: 1 },
  productoNombre: { fontSize: 15, fontWeight: '700', color: Colors.text },
  productoDesc: { fontSize: 12, color: Colors.textLight, marginTop: 2 },
  productoValor: { fontSize: 13, fontWeight: '600', color: Colors.primary, marginTop: 3 },
  stockControl: { flexDirection: 'row', alignItems: 'center', gap: 6, marginRight: 8 },
  stockBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.card, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  stockBtnText: { fontSize: 16, fontWeight: '700', color: Colors.text },
  stockBadge: { width: 34, height: 28, borderRadius: 8, backgroundColor: Colors.background, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  stockNum: { fontSize: 14, fontWeight: '800', color: Colors.text },
  cardActions: { flexDirection: 'row', gap: 4 },
  iconBtn: { padding: 6 },
  tcgCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.white, borderRadius: 18, padding: 16, marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 3,
  },
  tcgIconCircle: { width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  tcgIconText: { fontSize: 22, fontWeight: '800', color: Colors.white },
  tcgNombre: { flex: 1, fontSize: 17, fontWeight: '700', color: Colors.text },
  tcgArrow: { fontSize: 18, color: Colors.textLight, marginRight: 4 },
  torneoCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.white, borderRadius: 16, padding: 14, marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.07, shadowRadius: 4, elevation: 2,
  },
  torneoInfo: { flex: 1 },
  torneoTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  torneoNombre: { fontSize: 15, fontWeight: '700', color: Colors.text },
  estadoBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  estadoEnCurso: { backgroundColor: '#FFF3E8' },
  estadoFinalizado: { backgroundColor: '#E8F5E9' },
  estadoText: { fontSize: 11, fontWeight: '600', color: Colors.text },
  torneoDetalle: { fontSize: 12, color: Colors.textLight, marginTop: 4 },
  torneoValor: { fontSize: 12, color: Colors.primary, fontWeight: '600', marginTop: 2 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalScrollContent: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  modalCard: { backgroundColor: Colors.white, borderRadius: 24, padding: 24, width: '100%' },
  modalTitle: { fontSize: 20, fontWeight: '800', color: Colors.text, marginBottom: 16 },
  modalLabel: { fontSize: 12, fontWeight: '700', color: Colors.textLight, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, marginTop: 12 },
  modalInput: { borderWidth: 1.5, borderColor: Colors.border, borderRadius: 12, padding: 13, fontSize: 15, color: Colors.text, backgroundColor: Colors.background },
  modalInputMulti: { height: 70, textAlignVertical: 'top' },
  modalBtns: { flexDirection: 'row', gap: 10, marginTop: 20 },
  modalCancelBtn: { flex: 1, padding: 13, borderRadius: 14, borderWidth: 1.5, borderColor: Colors.border, alignItems: 'center' },
  modalCancelText: { color: Colors.textLight, fontWeight: '600' },
  modalSaveBtn: { flex: 2, padding: 13, borderRadius: 14, backgroundColor: Colors.primary, alignItems: 'center' },
  modalSaveText: { color: Colors.white, fontWeight: '700' },
  crearContent: { padding: 16 },
  crearHeader: { marginBottom: 16 },
  crearTitulo: { fontSize: 22, fontWeight: '800', color: Colors.text, marginTop: 10 },
  formLabel: { fontSize: 12, fontWeight: '700', color: Colors.textLight, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, marginTop: 14 },
  formInput: { borderWidth: 1.5, borderColor: Colors.border, borderRadius: 12, padding: 13, fontSize: 15, color: Colors.text, backgroundColor: Colors.white },
  rowInputs: { flexDirection: 'row', gap: 12 },
  rowInputItem: { flex: 1 },
  jugadorInputRow: { flexDirection: 'row', gap: 8 },
  jugadorInput: { flex: 1, borderWidth: 1.5, borderColor: Colors.border, borderRadius: 12, padding: 13, fontSize: 15, color: Colors.text, backgroundColor: Colors.white },
  jugadorAddBtn: { backgroundColor: Colors.primary, paddingHorizontal: 14, borderRadius: 12, justifyContent: 'center' },
  jugadorAddText: { color: Colors.white, fontWeight: '700', fontSize: 13 },
  jugadoresList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  jugadorChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.card, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: Colors.border },
  jugadorChipNum: { fontSize: 11, fontWeight: '700', color: Colors.textLight },
  jugadorChipNombre: { fontSize: 13, fontWeight: '600', color: Colors.text },
  jugadorChipX: { fontSize: 11, color: Colors.textLight },
  crearBtn: { backgroundColor: Colors.primary, borderRadius: 16, padding: 16, alignItems: 'center', marginTop: 24, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 8, elevation: 5 },
  crearBtnDisabled: { opacity: 0.5 },
  crearBtnText: { color: Colors.white, fontWeight: '800', fontSize: 16 },
  timerBox: { backgroundColor: Colors.white, borderRadius: 20, padding: 20, margin: 16, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 4 },
  timerDisplay: { fontSize: 56, fontWeight: '900', letterSpacing: 2 },
  timerFinText: { fontSize: 14, color: Colors.error, fontWeight: '700', marginTop: 4 },
  timerBarBg: { width: '100%', height: 6, borderRadius: 3, backgroundColor: Colors.border, marginTop: 12, marginBottom: 16, overflow: 'hidden' },
  timerBarFill: { height: '100%', borderRadius: 3 },
  timerBtns: { flexDirection: 'row', gap: 10 },
  timerBtn: { paddingHorizontal: 24, paddingVertical: 10, borderRadius: 12 },
  timerBtnPlay: { backgroundColor: Colors.primary },
  timerBtnPause: { backgroundColor: Colors.secondary },
  timerBtnText: { color: Colors.white, fontWeight: '700', fontSize: 14 },
  timerBtnReset: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, borderColor: Colors.border },
  timerBtnResetText: { color: Colors.textLight, fontWeight: '600', fontSize: 14 },
  timerAlertBox: { backgroundColor: '#FFF3E8', borderRadius: 12, padding: 12, marginHorizontal: 16, borderWidth: 1.5, borderColor: Colors.primary },
  timerAlertText: { color: Colors.primary, fontWeight: '600', textAlign: 'center', fontSize: 13 },
  rondasContent: { padding: 0 },
  rondaInfo: { backgroundColor: Colors.white, paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.border },
  rondaNumero: { fontSize: 22, fontWeight: '800', color: Colors.text },
  rondaSubtitle: { fontSize: 13, color: Colors.textLight, marginTop: 2 },
  partidasTitle: { fontSize: 14, fontWeight: '700', color: Colors.textLight, textTransform: 'uppercase', letterSpacing: 0.8, paddingHorizontal: 16, marginTop: 16, marginBottom: 8 },
  partidaCard: { backgroundColor: Colors.white, borderRadius: 18, marginHorizontal: 16, marginBottom: 12, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 6, elevation: 2 },
  jugadoresRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  jugadorBtn: { flex: 1, padding: 14, borderRadius: 14, alignItems: 'center', backgroundColor: Colors.background, borderWidth: 1.5, borderColor: Colors.border },
  jugadorGanador: { backgroundColor: '#FFF3E8', borderColor: Colors.primary },
  jugadorNombre: { fontSize: 14, fontWeight: '700', color: Colors.text, textAlign: 'center' },
  jugadorNombreGanador: { color: Colors.primary },
  ganadorBadge: { fontSize: 11, color: Colors.primary, fontWeight: '600', marginTop: 4 },
  vsCircle: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.border, justifyContent: 'center', alignItems: 'center' },
  vsText: { fontSize: 11, fontWeight: '800', color: Colors.textLight },
  byeCard: { alignItems: 'center', padding: 8 },
  byeText: { fontSize: 16, fontWeight: '700', color: Colors.text },
  byeBadge: { backgroundColor: Colors.card, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 10, marginTop: 6 },
  byeBadgeText: { fontSize: 12, color: Colors.textLight, fontWeight: '500' },
  nextRoundBtn: { backgroundColor: Colors.primary, borderRadius: 16, padding: 15, alignItems: 'center', margin: 16, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  nextRoundBtnDisabled: { opacity: 0.4 },
  nextRoundBtnText: { color: Colors.white, fontWeight: '800', fontSize: 16 },
  verTablaBtn: { borderWidth: 1.5, borderColor: Colors.border, borderRadius: 16, padding: 13, alignItems: 'center', marginHorizontal: 16 },
  verTablaBtnText: { color: Colors.textLight, fontWeight: '600', fontSize: 14 },
  tablaContent: { padding: 16 },
  tablaHeader: { marginBottom: 20 },
  tablaTitulo: { fontSize: 24, fontWeight: '900', color: Colors.text },
  tablaSubtitulo: { fontSize: 14, color: Colors.textLight, marginTop: 4 },
  premioBox: { backgroundColor: '#FFF3E8', borderRadius: 12, padding: 12, borderWidth: 1.5, borderColor: Colors.primary, marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  premioLabel: { fontSize: 14, fontWeight: '700', color: Colors.primary },
  premioText: { fontSize: 14, color: Colors.text, fontWeight: '600', flex: 1 },
  tablaEncabezado: { flexDirection: 'row', backgroundColor: Colors.card, borderRadius: 10, padding: 10, marginBottom: 6 },
  tablaFila: { flexDirection: 'row', backgroundColor: Colors.white, borderRadius: 14, padding: 12, marginBottom: 6, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
  tablaFilaPrimero: { borderColor: Colors.primary, borderWidth: 2, backgroundColor: '#FFF8F4' },
  tablaCol: { alignItems: 'center', justifyContent: 'center' },
  tablaPosCol: { width: 36 },
  tablaNombreCol: { flex: 1 },
  tablaNumCol: { width: 36 },
  tablaWinCol: { width: 52 },
  tablaTrophy: { fontSize: 22 },
  tablaPosNum: { fontSize: 15, fontWeight: '800', color: Colors.textLight },
  tablaNombreText: { fontSize: 14, fontWeight: '700', color: Colors.text },
  tablaVicText: { fontSize: 14, fontWeight: '800', color: Colors.success, textAlign: 'center' },
  tablaDerText: { fontSize: 14, fontWeight: '600', color: Colors.error, textAlign: 'center' },
  tablaWinText: { fontSize: 14, fontWeight: '800', color: Colors.primary, textAlign: 'center' },
  volverBtn: { borderWidth: 1.5, borderColor: Colors.border, borderRadius: 16, padding: 13, alignItems: 'center', marginTop: 16 },
  volverBtnText: { color: Colors.textLight, fontWeight: '600' },

  // Foto estilos para ProductosView
  productoImgBox: { marginRight: 10 },
  productoImg: { width: 52, height: 52, borderRadius: 12 },
  productoImgPlaceholder: { width: 52, height: 52, borderRadius: 12, backgroundColor: Colors.card, justifyContent: 'center', alignItems: 'center' },
  productoImgIcon: { fontSize: 24 },
  fotoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4, marginBottom: 8 },
  fotoBtn: { width: 80, height: 80, borderRadius: 16, overflow: 'hidden', borderWidth: 2, borderColor: Colors.border, borderStyle: 'dashed' },
  fotoPrev: { width: '100%', height: '100%', borderRadius: 14 },
  fotoPlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background },
  fotoIcon: { fontSize: 24 },
  fotoText: { fontSize: 10, color: Colors.textLight, marginTop: 2 },
  fotoRemove: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: Colors.border },
  fotoRemoveText: { fontSize: 12, color: Colors.textLight },
});