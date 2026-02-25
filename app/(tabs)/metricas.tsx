import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { db } from '../../config/firebase';
import {
  collection,
  onSnapshot,
  query,
  where,
  deleteDoc,
  getDocs,
  orderBy,
} from 'firebase/firestore';
import { useSidebar } from '../../contexts/SidebarContext';
import Colors from '../../constants/colors';

interface VentaItem {
  productoId: string;
  nombre: string;
  precio: number;
  emoji: string;
  cantidad: number;
  fotoUrl?: string;
}

interface Venta {
  id: string;
  mesaNum: number;
  total: number;
  items: VentaItem[];
  fecha: string; // YYYY-MM-DD
  hora: string;
  creadoEn: number;
}

interface ResumenProducto {
  productoId: string;
  nombre: string;
  emoji: string;
  fotoUrl?: string;
  cantidadTotal: number;
  ingresoTotal: number;
}

function getFechaHoy(): string {
  return new Date().toISOString().split('T')[0];
}

function formatHora(hora: string): string {
  return hora ?? '—';
}

export default function MetricasScreen() {
  const { open: openNav } = useSidebar();
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [vistaActiva, setVistaActiva] = useState<'resumen' | 'detalle'>('resumen');

  const fechaHoy = getFechaHoy();

  useEffect(() => {
    const q = query(
      collection(db, 'ventas'),
      where('fecha', '==', fechaHoy),
      orderBy('creadoEn', 'desc')
    );
    const unsub = onSnapshot(q, (snap) => {
      setVentas(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Venta)));
    });
    return unsub;
  }, [fechaHoy]);

  const totalDelDia = ventas.reduce((acc, v) => acc + v.total, 0);
  const mesasAtendidas = ventas.length;
  const itemsVendidos = ventas.reduce((acc, v) => acc + v.items.reduce((a, i) => a + i.cantidad, 0), 0);

  // Agrupar por producto
  const resumenProductos = ventas.reduce<Record<string, ResumenProducto>>((acc, venta) => {
    venta.items.forEach((item) => {
      const key = item.productoId;
      if (!acc[key]) {
        acc[key] = {
          productoId: item.productoId,
          nombre: item.nombre,
          emoji: item.emoji,
          fotoUrl: item.fotoUrl,
          cantidadTotal: 0,
          ingresoTotal: 0,
        };
      }
      acc[key].cantidadTotal += item.cantidad;
      acc[key].ingresoTotal += item.precio * item.cantidad;
    });
    return acc;
  }, {});

  const ranking = Object.values(resumenProductos).sort((a, b) => b.cantidadTotal - a.cantidadTotal);

  const limpiarDia = () => {
    Alert.alert(
      'Limpiar métricas',
      '¿Borrar todas las ventas de hoy? No se puede deshacer.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Limpiar', style: 'destructive',
          onPress: async () => {
            try {
              const q2 = query(collection(db, 'ventas'), where('fecha', '==', fechaHoy));
              const snap = await getDocs(q2);
              await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
            } catch (error) {
              console.error('Error al limpiar métricas:', error);
              Alert.alert('Error', 'No se pudo limpiar.');
            }
          },
        },
      ]
    );
  };

  const fechaFormateada = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });

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
          <Text style={styles.headerTitle}>📊 Métricas</Text>
          <Text style={styles.headerSub}>{fechaFormateada}</Text>
        </View>
        {ventas.length > 0 && (
          <TouchableOpacity style={styles.limpiarBtn} onPress={limpiarDia}>
            <Text style={styles.limpiarText}>Limpiar</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Tabs */}
      <View style={styles.tabsBar}>
        <TouchableOpacity
          style={[styles.tab, vistaActiva === 'resumen' && styles.tabActive]}
          onPress={() => setVistaActiva('resumen')}
        >
          <Text style={[styles.tabText, vistaActiva === 'resumen' && styles.tabTextActive]}>Resumen</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, vistaActiva === 'detalle' && styles.tabActive]}
          onPress={() => setVistaActiva('detalle')}
        >
          <Text style={[styles.tabText, vistaActiva === 'detalle' && styles.tabTextActive]}>
            Mesas ({ventas.length})
          </Text>
        </TouchableOpacity>
      </View>

      {ventas.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>☀️</Text>
          <Text style={styles.emptyTitle}>Nada todavía hoy</Text>
          <Text style={styles.emptySub}>Las métricas aparecen al cerrar mesas</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* KPIs */}
          <View style={styles.kpiRow}>
            <View style={[styles.kpiCard, styles.kpiPrimary]}>
              <Text style={styles.kpiValue}>${totalDelDia.toFixed(0)}</Text>
              <Text style={styles.kpiLabel}>Total del día</Text>
            </View>
            <View style={styles.kpiCard}>
              <Text style={styles.kpiValueSmall}>{mesasAtendidas}</Text>
              <Text style={styles.kpiLabel}>Mesas</Text>
            </View>
            <View style={styles.kpiCard}>
              <Text style={styles.kpiValueSmall}>{itemsVendidos}</Text>
              <Text style={styles.kpiLabel}>Ítems</Text>
            </View>
          </View>

          {/* Ticket promedio */}
          <View style={styles.promedioCard}>
            <Text style={styles.promedioLabel}>Ticket promedio por mesa</Text>
            <Text style={styles.promedioValue}>
              ${mesasAtendidas > 0 ? (totalDelDia / mesasAtendidas).toFixed(2) : '0.00'}
            </Text>
          </View>

          {vistaActiva === 'resumen' ? (
            <>
              {/* Ranking productos */}
              <Text style={styles.seccionTitulo}>🏆 Productos más vendidos</Text>
              {ranking.map((item, idx) => (
                <View key={item.productoId} style={styles.rankCard}>
                  <View style={styles.rankPos}>
                    <Text style={styles.rankPosText}>{idx + 1}</Text>
                  </View>
                  <View style={styles.rankEmojiBg}>
                    <Text style={styles.rankEmoji}>{item.emoji}</Text>
                  </View>
                  <View style={styles.rankInfo}>
                    <Text style={styles.rankNombre}>{item.nombre}</Text>
                    <Text style={styles.rankSub}>{item.cantidadTotal} unidades vendidas</Text>
                  </View>
                  <View style={styles.rankRight}>
                    <Text style={styles.rankIngreso}>${item.ingresoTotal.toFixed(0)}</Text>
                    <Text style={styles.rankPct}>
                      {totalDelDia > 0 ? `${Math.round((item.ingresoTotal / totalDelDia) * 100)}%` : '—'}
                    </Text>
                  </View>
                </View>
              ))}
            </>
          ) : (
            <>
              {/* Detalle por mesa */}
              <Text style={styles.seccionTitulo}>🪑 Mesas cerradas hoy</Text>
              {ventas.map((venta) => (
                <View key={venta.id} style={styles.ventaCard}>
                  <View style={styles.ventaCardHeader}>
                    <Text style={styles.ventaMesa}>Mesa {venta.mesaNum}</Text>
                    <Text style={styles.ventaHora}>{formatHora(venta.hora)}</Text>
                    <Text style={styles.ventaTotal}>${venta.total.toFixed(2)}</Text>
                  </View>
                  {venta.items.map((item) => (
                    <View key={item.productoId} style={styles.ventaItem}>
                      <Text style={styles.ventaItemEmoji}>{item.emoji}</Text>
                      <Text style={styles.ventaItemNombre}>{item.nombre}</Text>
                      <Text style={styles.ventaItemQty}>×{item.cantidad}</Text>
                      <Text style={styles.ventaItemTotal}>${(item.precio * item.cantidad).toFixed(2)}</Text>
                    </View>
                  ))}
                </View>
              ))}
            </>
          )}

          <View style={styles.bottomPad} />
        </ScrollView>
      )}
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
  headerSub: { fontSize: 11, color: Colors.textLight, marginTop: 1, textTransform: 'capitalize' },
  limpiarBtn: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10,
    borderWidth: 1.5, borderColor: Colors.error,
  },
  limpiarText: { fontSize: 12, color: Colors.error, fontWeight: '700' },
  tabsBar: {
    flexDirection: 'row', backgroundColor: Colors.white,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
    paddingHorizontal: 16, gap: 8, paddingVertical: 8,
  },
  tab: {
    paddingHorizontal: 18, paddingVertical: 7, borderRadius: 20,
    backgroundColor: Colors.background, borderWidth: 1.5, borderColor: Colors.border,
  },
  tabActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  tabText: { fontSize: 13, fontWeight: '600', color: Colors.textLight },
  tabTextActive: { color: Colors.white },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyEmoji: { fontSize: 60, marginBottom: 14 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: Colors.text },
  emptySub: { fontSize: 14, color: Colors.textLight, marginTop: 6, textAlign: 'center' },
  scrollContent: { padding: 16 },
  bottomPad: { height: 60 },
  kpiRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  kpiCard: {
    flex: 1, backgroundColor: Colors.white, borderRadius: 16, padding: 14, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 6, elevation: 2,
  },
  kpiPrimary: { backgroundColor: Colors.primary, flex: 1.5 },
  kpiValue: { fontSize: 28, fontWeight: '900', color: Colors.white },
  kpiValueSmall: { fontSize: 24, fontWeight: '900', color: Colors.text },
  kpiLabel: { fontSize: 11, color: Colors.white, marginTop: 3, fontWeight: '600', opacity: 0.85 },
  promedioCard: {
    backgroundColor: Colors.white, borderRadius: 16, padding: 16,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 20, borderWidth: 1, borderColor: Colors.border,
  },
  promedioLabel: { fontSize: 14, color: Colors.textLight, fontWeight: '600' },
  promedioValue: { fontSize: 20, fontWeight: '800', color: Colors.primary },
  seccionTitulo: {
    fontSize: 14, fontWeight: '700', color: Colors.textLight,
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10,
  },
  rankCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.white, borderRadius: 14, padding: 12, marginBottom: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  rankPos: { width: 26, height: 26, borderRadius: 13, backgroundColor: Colors.card, justifyContent: 'center', alignItems: 'center' },
  rankPosText: { fontSize: 12, fontWeight: '800', color: Colors.textLight },
  rankEmojiBg: { width: 40, height: 40, borderRadius: 10, backgroundColor: Colors.background, justifyContent: 'center', alignItems: 'center' },
  rankEmoji: { fontSize: 20 },
  rankInfo: { flex: 1 },
  rankNombre: { fontSize: 14, fontWeight: '700', color: Colors.text },
  rankSub: { fontSize: 12, color: Colors.textLight, marginTop: 2 },
  rankRight: { alignItems: 'flex-end' },
  rankIngreso: { fontSize: 15, fontWeight: '800', color: Colors.primary },
  rankPct: { fontSize: 11, color: Colors.textLight, marginTop: 2 },
  ventaCard: {
    backgroundColor: Colors.white, borderRadius: 14, padding: 14, marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  ventaCardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 },
  ventaMesa: { fontSize: 15, fontWeight: '800', color: Colors.text, flex: 1 },
  ventaHora: { fontSize: 12, color: Colors.textLight },
  ventaTotal: { fontSize: 15, fontWeight: '800', color: Colors.primary },
  ventaItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, borderTopWidth: 1, borderTopColor: Colors.border, gap: 8 },
  ventaItemEmoji: { fontSize: 16 },
  ventaItemNombre: { flex: 1, fontSize: 13, color: Colors.text, fontWeight: '500' },
  ventaItemQty: { fontSize: 13, color: Colors.textLight, fontWeight: '600' },
  ventaItemTotal: { fontSize: 13, fontWeight: '700', color: Colors.primary },
});