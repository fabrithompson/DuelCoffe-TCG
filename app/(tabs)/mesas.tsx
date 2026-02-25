import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  PanResponder,
  Dimensions,
  Alert,
  TextInput,
  Modal,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { db, auth } from '../../config/firebase';
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
import { signOut } from 'firebase/auth';
import Colors from '../../constants/colors';
import ProductosSidebar from '../../components/Sidebar';
import PedidoModal from '../../components/PedidoModal';
import { useSidebar } from '../../contexts/SidebarContext';

const SCREEN = Dimensions.get('window');
const MESA_SIZE = 90;

interface ItemPedido {
  productoId: string;
  nombre: string;
  precio: number;
  emoji: string;
  cantidad: number;
}

interface Mesa {
  id: string;
  numero: number;
  x: number;
  y: number;
  pedido: ItemPedido[];
  estado: string;
  salaId: string;
}

interface Sala {
  id: string;
  nombre: string;
  orden: number;
}

// ─── Mesa Component ───────────────────────────────────────────────────────────

interface MesaProps {
  readonly mesa: Mesa;
  readonly canvasHeight: number;
  readonly onSave: (id: string, x: number, y: number) => void;
  readonly onTap: (mesa: Mesa) => void;
  readonly onDelete: (mesa: Mesa) => void;
}

function MesaComponent({ mesa, canvasHeight, onSave, onTap, onDelete }: MesaProps) {
  const [pos, setPos] = useState({ x: mesa.x, y: mesa.y });
  const posRef = useRef({ x: mesa.x, y: mesa.y });
  const isDragging = useRef(false);
  const didMove = useRef(false);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!isDragging.current) {
      posRef.current = { x: mesa.x, y: mesa.y };
      setPos({ x: mesa.x, y: mesa.y });
    }
  }, [mesa.x, mesa.y]);

  const maxX = SCREEN.width - MESA_SIZE - 10;
  const maxY = canvasHeight - MESA_SIZE - 10;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 3 || Math.abs(g.dy) > 3,
      onPanResponderGrant: () => {
        isDragging.current = true;
        didMove.current = false;
        setDragging(true);
      },
      onPanResponderMove: (_, g) => {
        if (Math.abs(g.dx) > 3 || Math.abs(g.dy) > 3) didMove.current = true;
        const nx = Math.max(10, Math.min(maxX, posRef.current.x + g.dx));
        const ny = Math.max(10, Math.min(maxY, posRef.current.y + g.dy));
        setPos({ x: nx, y: ny });
      },
      onPanResponderRelease: (_, g) => {
        isDragging.current = false;
        setDragging(false);
        if (didMove.current) {
          const nx = Math.max(10, Math.min(maxX, posRef.current.x + g.dx));
          const ny = Math.max(10, Math.min(maxY, posRef.current.y + g.dy));
          posRef.current = { x: nx, y: ny };
          setPos({ x: nx, y: ny });
          onSave(mesa.id, nx, ny);
        } else {
          onTap(mesa);
        }
      },
      onPanResponderTerminate: () => {
        isDragging.current = false;
        setDragging(false);
      },
    })
  ).current;

  const total = (mesa.pedido ?? []).reduce((acc, i) => acc + i.precio * i.cantidad, 0);
  const itemCount = (mesa.pedido ?? []).reduce((a, i) => a + i.cantidad, 0);

  return (
    <View
      {...panResponder.panHandlers}
      style={[
        styles.mesa,
        { left: pos.x, top: pos.y },
        mesa.estado === 'ocupada' && styles.mesaOcupada,
        dragging && styles.mesaDragging,
      ]}
    >
      <Text style={styles.mesaNumero}>{mesa.numero}</Text>
      <Text style={styles.mesaLabel}>Mesa</Text>
      {itemCount > 0 && (
        <View style={styles.mesaBadge}>
          <Text style={styles.mesaBadgeText}>{itemCount}</Text>
        </View>
      )}
      {total > 0 && <Text style={styles.mesaTotal}>${total.toFixed(0)}</Text>}
      <TouchableOpacity
        style={styles.mesaDeleteBtn}
        onPress={() => onDelete(mesa)}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Text style={styles.mesaDeleteText}>✕</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Sala Modal ───────────────────────────────────────────────────────────────

interface SalaModalProps {
  readonly visible: boolean;
  readonly sala: Sala | null;
  readonly onClose: () => void;
  readonly onSave: (nombre: string) => void;
}

function SalaModal({ visible, sala, onClose, onSave }: SalaModalProps) {
  const [nombre, setNombre] = useState('');
  useEffect(() => { setNombre(sala?.nombre ?? ''); }, [sala, visible]);

  const handleSave = () => {
    if (!nombre.trim()) { Alert.alert('Error', 'El nombre no puede estar vacío.'); return; }
    onSave(nombre.trim());
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>{sala ? 'Editar sala' : 'Nueva sala'}</Text>
          <Text style={styles.modalLabel}>Nombre de la sala</Text>
          <TextInput
            style={styles.modalInput}
            placeholder="Ej: Planta baja, Terraza, VIP..."
            placeholderTextColor={Colors.textLight}
            value={nombre}
            onChangeText={setNombre}
            autoFocus
            autoCapitalize="words"
          />
          <View style={styles.modalBtns}>
            <TouchableOpacity style={styles.modalCancelBtn} onPress={onClose}>
              <Text style={styles.modalCancelText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalSaveBtn} onPress={handleSave}>
              <Text style={styles.modalSaveText}>Guardar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Pantalla Principal ───────────────────────────────────────────────────────

export default function MesasScreen() {
  const router = useRouter();
  const { seccion } = useLocalSearchParams<{ seccion?: string }>();
  const { open: openNav } = useSidebar();

  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [salas, setSalas] = useState<Sala[]>([]);
  const [salaActualId, setSalaActualId] = useState<string | null>(null);
  const [productosSidebarOpen, setProductosSidebarOpen] = useState(false);
  const [mesaSeleccionada, setMesaSeleccionada] = useState<Mesa | null>(null);
  const [salaModalVisible, setSalaModalVisible] = useState(false);
  const [salaEditando, setSalaEditando] = useState<Sala | null>(null);
  const [canvasHeight, setCanvasHeight] = useState(500);

  useEffect(() => {
    if (seccion === 'productos') setProductosSidebarOpen(true);
  }, [seccion]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'salas'), (snap) => {
      const data = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as Sala))
        .sort((a, b) => a.orden - b.orden);
      setSalas(data);
      setSalaActualId((prev) => {
        if (prev && data.some((s) => s.id === prev)) return prev;
        return data[0]?.id ?? null;
      });
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!salaActualId) { setMesas([]); return; }
    const q = query(collection(db, 'mesas'), where('salaId', '==', salaActualId));
    const unsub = onSnapshot(q, (snap) => {
      setMesas(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Mesa)));
    });
    return unsub;
  }, [salaActualId]);

  const crearSala = useCallback(async (nombre: string) => {
    try {
      const ref = await addDoc(collection(db, 'salas'), {
        nombre, orden: salas.length, creadoEn: serverTimestamp(),
      });
      setSalaActualId(ref.id);
      setSalaModalVisible(false);
    } catch (error) {
      console.error('Error al crear sala:', error);
      Alert.alert('Error', 'No se pudo crear la sala.');
    }
  }, [salas.length]);

  const editarSala = useCallback(async (nombre: string) => {
    if (!salaEditando) return;
    try {
      await updateDoc(doc(db, 'salas', salaEditando.id), { nombre });
      setSalaEditando(null);
      setSalaModalVisible(false);
    } catch (error) {
      console.error('Error al editar sala:', error);
      Alert.alert('Error', 'No se pudo editar la sala.');
    }
  }, [salaEditando]);

  const eliminarSala = useCallback((sala: Sala) => {
    if (salas.length <= 1) {
      Alert.alert('No permitido', 'Debe haber al menos una sala.');
      return;
    }
    Alert.alert('Eliminar sala', `¿Eliminar "${sala.nombre}"? Las mesas también serán eliminadas.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar', style: 'destructive',
        onPress: async () => {
          try {
            const q = query(collection(db, 'mesas'), where('salaId', '==', sala.id));
            const unsub = onSnapshot(q, (snap) => {
              snap.docs.forEach((d) => { deleteDoc(doc(db, 'mesas', d.id)).catch(console.error); });
              unsub();
            });
            await deleteDoc(doc(db, 'salas', sala.id));
          } catch (error) {
            console.error('Error al eliminar sala:', error);
            Alert.alert('Error', 'No se pudo eliminar la sala.');
          }
        },
      },
    ]);
  }, [salas.length]);

  const agregarMesa = useCallback(() => {
    if (!salaActualId) { Alert.alert('Sin sala', 'Creá una sala primero.'); return; }
    const numero = mesas.length > 0 ? Math.max(...mesas.map((m) => m.numero)) + 1 : 1;
    const x = 40 + Math.random() * (SCREEN.width - 160);
    const y = 40 + Math.random() * (canvasHeight - 180);
    addDoc(collection(db, 'mesas'), {
      numero, x, y, pedido: [], estado: 'libre',
      salaId: salaActualId, creadoEn: serverTimestamp(),
    }).catch((error) => {
      console.error('Error:', error);
      Alert.alert('Error', 'No se pudo agregar la mesa.');
    });
  }, [mesas, salaActualId, canvasHeight]);

  const guardarPosicion = useCallback((id: string, x: number, y: number) => {
    updateDoc(doc(db, 'mesas', id), { x, y }).catch(console.error);
  }, []);

  const eliminarMesa = useCallback((mesa: Mesa) => {
    if (mesa.estado === 'ocupada') {
      Alert.alert('Mesa ocupada', 'Cerrá el pedido antes de eliminar la mesa.');
      return;
    }
    Alert.alert('Eliminar mesa', `¿Eliminar Mesa ${mesa.numero}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar', style: 'destructive',
        onPress: () => { deleteDoc(doc(db, 'mesas', mesa.id)).catch(console.error); },
      },
    ]);
  }, []);

  const handleLogout = useCallback(() => {
    Alert.alert('Cerrar sesión', '¿Salir?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Salir', style: 'destructive',
        onPress: () => {
          signOut(auth)
            .then(() => { router.replace('/(auth)/login'); })
            .catch(console.error);
        },
      },
    ]);
  }, [router]);

  const mesasOcupadas = mesas.filter((m) => m.estado === 'ocupada').length;
  const salaActual = salas.find((s) => s.id === salaActualId);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.hamburger} onPress={openNav}>
          <View style={styles.hamburgerLine} />
          <View style={styles.hamburgerLine} />
          <View style={styles.hamburgerLine} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>☕ Mesas</Text>
          <Text style={styles.headerSub}>{mesasOcupadas}/{mesas.length} ocupadas</Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.headerBtn} onPress={agregarMesa}>
            <Text style={styles.headerBtnText}>+ Mesa</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.menuIconBtn} onPress={() => setProductosSidebarOpen(true)}>
            <Text style={styles.menuIconText}>🍽️</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Tabs salas */}
      <View style={styles.salasBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.salasScroll}>
          {salas.map((sala) => (
            <TouchableOpacity
              key={sala.id}
              style={[styles.salaTab, salaActualId === sala.id && styles.salaTabActive]}
              onPress={() => setSalaActualId(sala.id)}
            >
              <Text style={[styles.salaTabText, salaActualId === sala.id && styles.salaTabTextActive]}>
                {sala.nombre}
              </Text>
              {salaActualId === sala.id && (
                <View style={styles.salaTabActions}>
                  <TouchableOpacity
                    onPress={() => { setSalaEditando(sala); setSalaModalVisible(true); }}
                    hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                  >
                    <Text style={styles.salaActionIcon}>✏️</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => eliminarSala(sala)}
                    hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                  >
                    <Text style={styles.salaActionIcon}>🗑️</Text>
                  </TouchableOpacity>
                </View>
              )}
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={styles.salaAddBtn}
            onPress={() => { setSalaEditando(null); setSalaModalVisible(true); }}
          >
            <Text style={styles.salaAddText}>+ Sala</Text>
          </TouchableOpacity>
        </ScrollView>

        <View style={styles.leyendaRow}>
          <View style={styles.leyendaItem}>
            <View style={[styles.dot, styles.dotLibre]} />
            <Text style={styles.leyendaText}>Libre</Text>
          </View>
          <View style={styles.leyendaItem}>
            <View style={[styles.dot, styles.dotOcupada]} />
            <Text style={styles.leyendaText}>Ocupada</Text>
          </View>
          <View style={styles.spacer} />
          <TouchableOpacity onPress={handleLogout}>
            <Text style={styles.logoutText}>Salir</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Canvas */}
      <View style={styles.canvas} onLayout={(e) => setCanvasHeight(e.nativeEvent.layout.height)}>
        {salas.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>🏠</Text>
            <Text style={styles.emptyTitle}>No hay salas</Text>
            <Text style={styles.emptySub}>Tocá "+ Sala" para crear tu primer espacio</Text>
            <TouchableOpacity
              style={styles.emptyBtn}
              onPress={() => { setSalaEditando(null); setSalaModalVisible(true); }}
            >
              <Text style={styles.emptyBtnText}>+ Crear sala</Text>
            </TouchableOpacity>
          </View>
        )}
        {salas.length > 0 && mesas.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>🪑</Text>
            <Text style={styles.emptyTitle}>
              {salaActual ? `"${salaActual.nombre}" está vacía` : 'Sin mesas'}
            </Text>
            <Text style={styles.emptySub}>Tocá "+ Mesa" para agregar</Text>
          </View>
        )}
        {mesas.map((mesa) => (
          <MesaComponent
            key={mesa.id}
            mesa={mesa}
            canvasHeight={canvasHeight}
            onSave={guardarPosicion}
            onTap={setMesaSeleccionada}
            onDelete={eliminarMesa}
          />
        ))}
      </View>

      <SalaModal
        visible={salaModalVisible}
        sala={salaEditando}
        onClose={() => { setSalaModalVisible(false); setSalaEditando(null); }}
        onSave={salaEditando ? editarSala : crearSala}
      />
      <ProductosSidebar visible={productosSidebarOpen} onClose={() => setProductosSidebarOpen(false)} />
      <PedidoModal mesa={mesaSeleccionada} onClose={() => setMesaSeleccionada(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 11,
    backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border, gap: 10,
  },
  hamburger: { padding: 6, gap: 5, justifyContent: 'center' },
  hamburgerLine: { width: 22, height: 2.5, backgroundColor: Colors.text, borderRadius: 2 },
  headerCenter: { flex: 1 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: Colors.text },
  headerSub: { fontSize: 11, color: Colors.textLight, marginTop: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerBtn: { backgroundColor: Colors.primary, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10 },
  headerBtnText: { color: Colors.white, fontWeight: '700', fontSize: 13 },
  menuIconBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: Colors.card, justifyContent: 'center', alignItems: 'center' },
  menuIconText: { fontSize: 18 },
  salasBar: { backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border },
  salasScroll: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6, flexDirection: 'row', gap: 8 },
  salaTab: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    backgroundColor: Colors.background, borderWidth: 1.5, borderColor: Colors.border,
  },
  salaTabActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  salaTabText: { fontSize: 13, color: Colors.textLight, fontWeight: '600' },
  salaTabTextActive: { color: Colors.white },
  salaTabActions: { flexDirection: 'row', gap: 4 },
  salaActionIcon: { fontSize: 13 },
  salaAddBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5, borderColor: Colors.primary, borderStyle: 'dashed' },
  salaAddText: { fontSize: 13, color: Colors.primary, fontWeight: '700' },
  leyendaRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8 },
  leyendaItem: { flexDirection: 'row', alignItems: 'center', marginRight: 14 },
  dot: { width: 9, height: 9, borderRadius: 5, marginRight: 5 },
  dotLibre: { backgroundColor: Colors.white, borderWidth: 1.5, borderColor: Colors.border },
  dotOcupada: { backgroundColor: Colors.primary },
  leyendaText: { fontSize: 12, color: Colors.textLight },
  spacer: { flex: 1 },
  logoutText: { fontSize: 13, color: Colors.secondary, fontWeight: '600' },
  canvas: { flex: 1, position: 'relative' },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyEmoji: { fontSize: 56, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: Colors.text, textAlign: 'center' },
  emptySub: { fontSize: 14, color: Colors.textLight, marginTop: 6, textAlign: 'center' },
  emptyBtn: { marginTop: 20, backgroundColor: Colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 14 },
  emptyBtnText: { color: Colors.white, fontWeight: '700', fontSize: 15 },
  mesa: {
    position: 'absolute', width: MESA_SIZE, height: MESA_SIZE, borderRadius: 20,
    backgroundColor: Colors.white, justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: Colors.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 4,
  },
  mesaOcupada: { backgroundColor: Colors.card, borderColor: Colors.primary, borderWidth: 2.5 },
  mesaDragging: { shadowOpacity: 0.3, shadowRadius: 20, elevation: 16, transform: [{ scale: 1.08 }], zIndex: 999 },
  mesaNumero: { fontSize: 26, fontWeight: '800', color: Colors.text },
  mesaLabel: { fontSize: 11, color: Colors.textLight, fontWeight: '500', marginTop: -2 },
  mesaBadge: {
    position: 'absolute', top: -8, right: -8, width: 22, height: 22, borderRadius: 11,
    backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: Colors.white,
  },
  mesaBadgeText: { fontSize: 11, fontWeight: '800', color: Colors.white },
  mesaTotal: { position: 'absolute', bottom: 6, fontSize: 11, fontWeight: '700', color: Colors.primary },
  mesaDeleteBtn: { position: 'absolute', top: 4, left: 6, width: 18, height: 18, justifyContent: 'center', alignItems: 'center' },
  mesaDeleteText: { fontSize: 10, color: Colors.textLight },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalCard: { backgroundColor: Colors.white, borderRadius: 24, padding: 24, width: '100%' },
  modalTitle: { fontSize: 20, fontWeight: '800', color: Colors.text, marginBottom: 16 },
  modalLabel: { fontSize: 13, fontWeight: '600', color: Colors.textLight, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  modalInput: { borderWidth: 1.5, borderColor: Colors.border, borderRadius: 12, padding: 14, fontSize: 16, color: Colors.text, backgroundColor: Colors.background },
  modalBtns: { flexDirection: 'row', gap: 10, marginTop: 20 },
  modalCancelBtn: { flex: 1, padding: 14, borderRadius: 14, borderWidth: 1.5, borderColor: Colors.border, alignItems: 'center' },
  modalCancelText: { color: Colors.textLight, fontWeight: '600' },
  modalSaveBtn: { flex: 2, padding: 14, borderRadius: 14, backgroundColor: Colors.primary, alignItems: 'center' },
  modalSaveText: { color: Colors.white, fontWeight: '700', fontSize: 15 },
});