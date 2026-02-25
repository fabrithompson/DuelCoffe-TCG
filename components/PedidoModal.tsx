import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  Alert,
  FlatList,
  Image,
} from 'react-native';
import { db } from '../config/firebase';
import {
  collection,
  onSnapshot,
  doc,
  updateDoc,
  addDoc,
  serverTimestamp,
} from 'firebase/firestore';
import Colors from '../constants/colors';

interface Producto {
  id: string;
  nombre: string;
  precio: number;
  emoji: string;
  categoria: string;
  fotoUrl?: string;
  controlStock?: boolean;
  stock?: number;
}

interface ItemPedido {
  productoId: string;
  nombre: string;
  precio: number;
  emoji: string;
  fotoUrl?: string;
  cantidad: number;
}

interface Mesa {
  id: string;
  numero: number;
  pedido: ItemPedido[];
  estado: string;
}

interface PedidoModalProps {
  readonly mesa: Mesa | null;
  readonly onClose: () => void;
}

const CATEGORIAS = ['Todos', 'Bebidas', 'Comidas', 'Postres'] as const;

function getFechaHoy(): string {
  return new Date().toISOString().split('T')[0];
}

function getHoraActual(): string {
  return new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

export default function PedidoModal({ mesa, onClose }: PedidoModalProps) {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [pedido, setPedido] = useState<ItemPedido[]>([]);
  const [categoriaActiva, setCategoriaActiva] = useState<string>('Todos');

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'productos'), (snap) => {
      setProductos(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Producto)));
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (mesa) setPedido(mesa.pedido ?? []);
  }, [mesa]);

  const agregarItem = (producto: Producto) => {
    setPedido((prev) => {
      const existe = prev.find((i) => i.productoId === producto.id);
      if (existe) {
        return prev.map((i) =>
          i.productoId === producto.id ? { ...i, cantidad: i.cantidad + 1 } : i
        );
      }
      return [...prev, {
        productoId: producto.id,
        nombre: producto.nombre,
        precio: producto.precio,
        emoji: producto.emoji,
        fotoUrl: producto.fotoUrl,
        cantidad: 1,
      }];
    });
  };

  const cambiarCantidad = (productoId: string, delta: number) => {
    setPedido((prev) => {
      const item = prev.find((i) => i.productoId === productoId);
      if (!item) return prev;
      if (item.cantidad + delta <= 0) return prev.filter((i) => i.productoId !== productoId);
      return prev.map((i) =>
        i.productoId === productoId ? { ...i, cantidad: i.cantidad + delta } : i
      );
    });
  };

  const guardarPedido = async () => {
    if (!mesa) return;
    try {
      await updateDoc(doc(db, 'mesas', mesa.id), {
        pedido,
        estado: pedido.length > 0 ? 'ocupada' : 'libre',
      });
      onClose();
    } catch (error) {
      console.error('Error al guardar pedido:', error);
      Alert.alert('Error', 'No se pudo guardar el pedido.');
    }
  };

  // ── Cerrar mesa: registra venta + descuenta stock ──────────────────────────
  const cerrarMesa = () => {
    Alert.alert('Cerrar mesa', '¿Dar por pagado y vaciar el pedido?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Cerrar ✅',
        onPress: async () => {
          if (!mesa) return;
          try {
            const total = pedido.reduce((acc, i) => acc + i.precio * i.cantidad, 0);

            // 1. Guardar venta en colección "ventas" para métricas
            await addDoc(collection(db, 'ventas'), {
              mesaId: mesa.id,
              mesaNum: mesa.numero,
              total,
              items: pedido,
              fecha: getFechaHoy(),
              hora: getHoraActual(),
              creadoEn: serverTimestamp(),
              timestamp: Date.now(),
            });

            // 2. Descontar stock de productos con controlStock = true
            const productosConStock = productos.filter(
              (p) => p.controlStock && p.stock !== undefined && p.stock !== null
            );
            if (productosConStock.length > 0) {
              await Promise.all(
                pedido.map(async (item) => {
                  const prod = productosConStock.find((p) => p.id === item.productoId);
                  if (!prod) return;
                  const nuevoStock = Math.max(0, (prod.stock ?? 0) - item.cantidad);
                  await updateDoc(doc(db, 'productos', prod.id), { stock: nuevoStock });
                })
              );
            }

            // 3. Liberar mesa
            await updateDoc(doc(db, 'mesas', mesa.id), { pedido: [], estado: 'libre' });
            onClose();
          } catch (error) {
            console.error('Error al cerrar mesa:', error);
            Alert.alert('Error', 'No se pudo cerrar la mesa.');
          }
        },
      },
    ]);
  };

  const productosFiltrados = categoriaActiva === 'Todos'
    ? productos
    : productos.filter((p) => p.categoria === categoriaActiva);

  const total = pedido.reduce((acc, i) => acc + i.precio * i.cantidad, 0);
  const itemCount = pedido.reduce((a, i) => a + i.cantidad, 0);

  if (!mesa) return null;

  return (
    <Modal visible={!!mesa} animationType="slide" presentationStyle="pageSheet">
      <View style={styles.container}>

        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.mesaTitle}>Mesa {mesa.numero}</Text>
            <Text style={styles.mesaSubtitle}>
              {itemCount > 0 ? `${itemCount} ítems · $${total.toFixed(2)}` : 'Sin pedido aún'}
            </Text>
          </View>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Categoría chips */}
        <View style={styles.productosSection}>
          <View style={styles.productosTitleRow}>
            <Text style={styles.sectionTitle}>Agregar productos</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catScroll} contentContainerStyle={styles.catScrollContent}>
            {CATEGORIAS.map((c) => (
              <TouchableOpacity
                key={c}
                style={[styles.catChip, categoriaActiva === c && styles.catChipActive]}
                onPress={() => setCategoriaActiva(c)}
              >
                <Text style={[styles.catChipText, categoriaActiva === c && styles.catChipTextActive]}>{c}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Grid con fotos */}
          {productosFiltrados.length === 0 ? (
            <View style={styles.emptyProductos}>
              <Text style={styles.emptyEmoji}>🍽️</Text>
              <Text style={styles.emptyText}>No hay productos en esta categoría</Text>
            </View>
          ) : (
            <FlatList
              data={productosFiltrados}
              keyExtractor={(item) => item.id}
              numColumns={3}
              scrollEnabled
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.gridContent}
              style={styles.flatListStyle}
              renderItem={({ item, index }) => {
                const enPedido = pedido.find((i) => i.productoId === item.id);
                const isFirst = index % 3 === 0;
                const isLast = index % 3 === 2;
                return (
                  <View style={[styles.tileWrapper, isFirst && styles.tileWrapperFirst, isLast && styles.tileWrapperLast]}>
                    <TouchableOpacity
                      style={[styles.productoTile, enPedido && styles.productoTileActive]}
                      onPress={() => agregarItem(item)}
                      activeOpacity={0.7}
                    >
                      {enPedido && (
                        <View style={styles.tileBadge}>
                          <Text style={styles.tileBadgeText}>{enPedido.cantidad}</Text>
                        </View>
                      )}
                      {/* Foto o emoji */}
                      {item.fotoUrl
                        ? <Image source={{ uri: item.fotoUrl }} style={styles.tileFoto} />
                        : <Text style={styles.tileEmoji}>{item.emoji}</Text>
                      }
                      <Text style={styles.tileNombre} numberOfLines={2}>{item.nombre}</Text>
                      <Text style={styles.tilePrecio}>${item.precio.toFixed(2)}</Text>
                      {/* Alerta stock bajo */}
                      {item.controlStock && (item.stock ?? 0) <= 5 && (
                        <Text style={styles.tileLowStock}>⚠️ {item.stock ?? 0}</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                );
              }}
            />
          )}
        </View>

        {/* Pedido actual */}
        <View style={styles.pedidoSection}>
          <View style={styles.pedidoHeader}>
            <Text style={styles.pedidoTitle}>Pedido actual{itemCount > 0 ? ` (${itemCount})` : ''}</Text>
            {total > 0 && <Text style={styles.pedidoTotal}>Total: ${total.toFixed(2)}</Text>}
          </View>

          {pedido.length === 0 ? (
            <View style={styles.pedidoVacio}>
              <Text style={styles.pedidoVacioText}>Tocá un producto para agregarlo</Text>
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pedidoScrollContent}>
              {pedido.map((item) => (
                <View key={item.productoId} style={styles.pedidoChip}>
                  {item.fotoUrl
                    ? <Image source={{ uri: item.fotoUrl }} style={styles.chipFoto} />
                    : <Text style={styles.chipEmoji}>{item.emoji}</Text>
                  }
                  <Text style={styles.chipNombre} numberOfLines={1}>{item.nombre}</Text>
                  <Text style={styles.chipSubtotal}>${(item.precio * item.cantidad).toFixed(2)}</Text>
                  <View style={styles.chipControls}>
                    <TouchableOpacity style={styles.chipBtn} onPress={() => cambiarCantidad(item.productoId, -1)}>
                      <Text style={styles.chipBtnText}>−</Text>
                    </TouchableOpacity>
                    <Text style={styles.chipCantidad}>{item.cantidad}</Text>
                    <TouchableOpacity style={styles.chipBtn} onPress={() => cambiarCantidad(item.productoId, 1)}>
                      <Text style={styles.chipBtnText}>+</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </ScrollView>
          )}
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          {pedido.length > 0 && (
            <TouchableOpacity style={styles.cerrarBtn} onPress={cerrarMesa}>
              <Text style={styles.cerrarBtnText}>💰 Cerrar mesa</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.guardarBtn} onPress={() => { void guardarPedido(); }}>
            <Text style={styles.guardarBtnText}>
              Guardar{total > 0 ? ` · $${total.toFixed(2)}` : ''}
            </Text>
          </TouchableOpacity>
        </View>

      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 16, paddingTop: 20,
    backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  mesaTitle: { fontSize: 24, fontWeight: '800', color: Colors.text },
  mesaSubtitle: { fontSize: 13, color: Colors.textLight, marginTop: 2 },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.card, justifyContent: 'center', alignItems: 'center' },
  closeBtnText: { fontSize: 14, color: Colors.text, fontWeight: '700' },
  productosSection: { flex: 1, backgroundColor: Colors.background },
  productosTitleRow: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: Colors.text },
  catScroll: { flexGrow: 0 },
  catScrollContent: { paddingHorizontal: 16, paddingBottom: 12, gap: 8, flexDirection: 'row' },
  catChip: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20, backgroundColor: Colors.white, borderWidth: 1.5, borderColor: Colors.border },
  catChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  catChipText: { fontSize: 13, color: Colors.textLight, fontWeight: '600' },
  catChipTextActive: { color: Colors.white, fontWeight: '700' },
  flatListStyle: { overflow: 'visible' },
  gridContent: { paddingHorizontal: 8, paddingBottom: 8, paddingTop: 6 },
  tileWrapper: { flex: 1, paddingHorizontal: 4, paddingTop: 8, overflow: 'visible' },
  tileWrapperFirst: { paddingLeft: 8 },
  tileWrapperLast: { paddingRight: 8 },
  productoTile: {
    backgroundColor: Colors.white, borderRadius: 16, padding: 8,
    alignItems: 'center', borderWidth: 1.5, borderColor: Colors.border,
    minHeight: 100, justifyContent: 'center',
  },
  productoTileActive: { borderColor: Colors.primary, backgroundColor: '#FFF3E8' },
  tileBadge: {
    position: 'absolute', top: -8, right: -8, zIndex: 10,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: Colors.secondary, justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: Colors.white,
  },
  tileBadgeText: { fontSize: 11, fontWeight: '800', color: Colors.white },
  tileFoto: { width: 44, height: 44, borderRadius: 10, marginBottom: 4 },
  tileEmoji: { fontSize: 26, marginBottom: 4 },
  tileNombre: { fontSize: 11, fontWeight: '600', color: Colors.text, textAlign: 'center', lineHeight: 14 },
  tilePrecio: { fontSize: 12, fontWeight: '700', color: Colors.primary, marginTop: 3 },
  tileLowStock: { fontSize: 10, color: Colors.error, marginTop: 2 },
  emptyProductos: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyEmoji: { fontSize: 40, marginBottom: 8 },
  emptyText: { fontSize: 14, color: Colors.textLight, textAlign: 'center' },
  pedidoSection: {
    backgroundColor: Colors.white, borderTopWidth: 1, borderTopColor: Colors.border,
    paddingTop: 10, paddingBottom: 4, minHeight: 110, maxHeight: 150,
  },
  pedidoHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, marginBottom: 8 },
  pedidoTitle: { fontSize: 13, fontWeight: '700', color: Colors.text, textTransform: 'uppercase', letterSpacing: 0.8 },
  pedidoTotal: { fontSize: 14, fontWeight: '800', color: Colors.primary },
  pedidoVacio: { paddingHorizontal: 16, paddingVertical: 16, alignItems: 'center' },
  pedidoVacioText: { fontSize: 13, color: Colors.textLight },
  pedidoScrollContent: { paddingHorizontal: 12, paddingBottom: 4, gap: 8, flexDirection: 'row' },
  pedidoChip: { backgroundColor: Colors.card, borderRadius: 14, padding: 10, alignItems: 'center', width: 85, borderWidth: 1.5, borderColor: Colors.border },
  chipFoto: { width: 36, height: 36, borderRadius: 8 },
  chipEmoji: { fontSize: 20 },
  chipNombre: { fontSize: 11, fontWeight: '600', color: Colors.text, textAlign: 'center', marginTop: 3 },
  chipSubtotal: { fontSize: 11, fontWeight: '700', color: Colors.primary, marginTop: 2 },
  chipControls: { flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 4 },
  chipBtn: { width: 22, height: 22, borderRadius: 11, backgroundColor: Colors.white, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  chipBtnText: { fontSize: 14, fontWeight: '800', color: Colors.text, lineHeight: 18 },
  chipCantidad: { fontSize: 13, fontWeight: '800', color: Colors.text, minWidth: 16, textAlign: 'center' },
  footer: {
    flexDirection: 'row', gap: 10, padding: 16, paddingBottom: 32,
    backgroundColor: Colors.white, borderTopWidth: 1, borderTopColor: Colors.border,
  },
  cerrarBtn: { flex: 1, padding: 14, borderRadius: 14, borderWidth: 1.5, borderColor: Colors.primary, alignItems: 'center', backgroundColor: '#FFF3E8' },
  cerrarBtnText: { color: Colors.primary, fontWeight: '700', fontSize: 14 },
  guardarBtn: { flex: 2, padding: 14, borderRadius: 14, backgroundColor: Colors.primary, alignItems: 'center', shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 8, elevation: 5 },
  guardarBtnText: { color: Colors.white, fontWeight: '800', fontSize: 15 },
});