import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
  ScrollView,
  Alert,
} from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { signOut } from 'firebase/auth';
import { auth } from '../config/firebase';
import { useSidebar } from '../contexts/SidebarContext';
import Colors from '../constants/colors';

const { width } = Dimensions.get('window');
const SIDEBAR_W = width * 0.78;

interface NavItem {
  readonly label: string;
  readonly sublabel: string;
  readonly emoji: string;
  readonly route: string;
  readonly param?: string;
}

const SECCIONES: { readonly titulo: string; readonly items: readonly NavItem[] }[] = [
  {
    titulo: 'Cafetería',
    items: [
      { label: 'Mesas', sublabel: 'Gestión de mesas y pedidos', emoji: '🪑', route: '/(tabs)/mesas' },
      { label: 'Métricas del día', sublabel: 'Ganancias y consumo', emoji: '📊', route: '/(tabs)/metricas' },
    ],
  },
  {
    titulo: 'TCG',
    items: [
      { label: 'Torneos', sublabel: 'Juegos y torneos organizados', emoji: '⚔️', route: '/(tabs)/torneos', param: 'tcg' },
      { label: 'Inventario TCG', sublabel: 'Stock de productos TCG', emoji: '📦', route: '/(tabs)/torneos', param: 'inventario' },
    ],
  },
];

export default function GlobalSidebar() {
  const { isOpen, close } = useSidebar();
  const router = useRouter();
  const pathname = usePathname();
  const slideAnim = useRef(new Animated.Value(-SIDEBAR_W)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(slideAnim, {
        toValue: isOpen ? 0 : -SIDEBAR_W,
        useNativeDriver: true,
        tension: 90,
        friction: 12,
      }),
      Animated.timing(fadeAnim, {
        toValue: isOpen ? 1 : 0,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start();
  }, [isOpen, slideAnim, fadeAnim]);

  const navegar = (route: string, param?: string) => {
    close();
    const url = param ? `${route}?seccion=${param}` : route;
    router.push(url as never);
  };

  const handleLogout = () => {
    close();
    Alert.alert('Cerrar sesión', '¿Salir de la app?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Salir', style: 'destructive',
        onPress: () => {
          signOut(auth).then(() => router.replace('/(auth)/login')).catch(console.error);
        },
      },
    ]);
  };

  if (!isOpen) return null;

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
      <Animated.View style={[styles.overlay, { opacity: fadeAnim }]} pointerEvents="auto">
        <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={close} activeOpacity={1} />
      </Animated.View>

      <Animated.View style={[styles.panel, { transform: [{ translateX: slideAnim }] }]} pointerEvents="auto">
        <View style={styles.sidebarTop}>
          <View style={styles.logoRow}>
            <View style={styles.logoCircle}><Text style={styles.logoLetter}>D</Text></View>
            <View>
              <Text style={styles.logoName}>Duel</Text>
              <Text style={styles.logoSub}>Café & TCG</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.closeBtn} onPress={close}>
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.nav} showsVerticalScrollIndicator={false}>
          {SECCIONES.map((seccion) => (
            <View key={seccion.titulo} style={styles.seccion}>
              <Text style={styles.seccionTitulo}>{seccion.titulo}</Text>
              {seccion.items.map((item) => {
                const isActive = pathname.includes(item.route.replace('/(tabs)/', ''));
                return (
                  <TouchableOpacity
                    key={item.label}
                    style={[styles.navItem, isActive && styles.navItemActive]}
                    onPress={() => navegar(item.route, item.param)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.navEmoji, isActive && styles.navEmojiActive]}>
                      <Text style={styles.navEmojiText}>{item.emoji}</Text>
                    </View>
                    <View style={styles.navTexts}>
                      <Text style={[styles.navLabel, isActive && styles.navLabelActive]}>{item.label}</Text>
                      <Text style={styles.navSublabel}>{item.sublabel}</Text>
                    </View>
                    {isActive && <View style={styles.navActiveDot} />}
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}

          <View style={styles.divider} />

          <View style={styles.seccion}>
            <Text style={styles.seccionTitulo}>Cuenta</Text>

            <TouchableOpacity
              style={styles.navItem}
              onPress={() => navegar('/(tabs)/configuracion')}
              activeOpacity={0.7}
            >
              <View style={styles.navEmoji}>
                <Text style={styles.navEmojiText}>⚙️</Text>
              </View>
              <View style={styles.navTexts}>
                <Text style={styles.navLabel}>Mi cuenta</Text>
                <Text style={styles.navSublabel}>Email, contraseña y perfil</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.navItemLogout} onPress={handleLogout} activeOpacity={0.7}>
              <View style={styles.navEmojiLogout}>
                <Text style={styles.navEmojiText}>🚪</Text>
              </View>
              <Text style={styles.navLabelLogout}>Cerrar sesión</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>

        <View style={styles.footer}><Text style={styles.footerText}>Duel App · v1.0</Text></View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(30,15,5,0.5)' },
  panel: {
    position: 'absolute', left: 0, top: 0, bottom: 0, width: SIDEBAR_W,
    backgroundColor: Colors.white,
    shadowColor: '#000', shadowOffset: { width: 6, height: 0 }, shadowOpacity: 0.18, shadowRadius: 24, elevation: 24,
  },
  sidebarTop: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 60, paddingBottom: 20,
    borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: Colors.background,
  },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logoCircle: {
    width: 46, height: 46, borderRadius: 23, backgroundColor: Colors.primary,
    justifyContent: 'center', alignItems: 'center',
  },
  logoLetter: { fontSize: 22, fontWeight: '900', color: Colors.white },
  logoName: { fontSize: 20, fontWeight: '800', color: Colors.text },
  logoSub: { fontSize: 12, color: Colors.textLight },
  closeBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.card, justifyContent: 'center', alignItems: 'center' },
  closeBtnText: { fontSize: 13, color: Colors.text, fontWeight: '700' },
  nav: { flex: 1, paddingTop: 8 },
  seccion: { paddingHorizontal: 12, marginBottom: 6 },
  seccionTitulo: { fontSize: 11, fontWeight: '700', color: Colors.textLight, textTransform: 'uppercase', letterSpacing: 1.2, paddingHorizontal: 8, paddingVertical: 10 },
  navItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 11, borderRadius: 14, gap: 12, marginBottom: 3 },
  navItemActive: { backgroundColor: '#FFF3E8' },
  navEmoji: { width: 42, height: 42, borderRadius: 12, backgroundColor: Colors.background, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  navEmojiActive: { backgroundColor: Colors.card, borderColor: Colors.primary },
  navEmojiText: { fontSize: 20 },
  navTexts: { flex: 1 },
  navLabel: { fontSize: 15, fontWeight: '600', color: Colors.text },
  navLabelActive: { color: Colors.primary, fontWeight: '700' },
  navSublabel: { fontSize: 12, color: Colors.textLight, marginTop: 1 },
  navActiveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.primary },
  navItemLogout: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 11, borderRadius: 14, gap: 12, marginBottom: 3 },
  navEmojiLogout: { width: 42, height: 42, borderRadius: 12, backgroundColor: '#FEF2F2', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#FECACA' },
  navLabelLogout: { fontSize: 15, fontWeight: '600', color: Colors.error },
  divider: { height: 1, backgroundColor: Colors.border, marginHorizontal: 20, marginVertical: 4 },
  footer: { padding: 20, borderTopWidth: 1, borderTopColor: Colors.border, alignItems: 'center' },
  footerText: { fontSize: 12, color: Colors.textLight },
});