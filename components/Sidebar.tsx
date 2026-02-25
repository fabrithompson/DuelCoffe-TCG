import React, { useRef, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
  ScrollView,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Image,
  ActivityIndicator,
} from 'react-native';
import { db, storage } from '../config/firebase';
import {
  collection,
  addDoc,
  onSnapshot,
  deleteDoc,
  doc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import * as ImagePicker from 'expo-image-picker';
import Colors from '../constants/colors';

const { width } = Dimensions.get('window');
const SIDEBAR_WIDTH = width * 0.82;

interface Producto {
  id: string;
  nombre: string;
  precio: number;
  descripcion: string;
  emoji: string;
  categoria: string;
  fotoUrl?: string;
  stock?: number;          // stock actual en cafetería
  controlStock?: boolean;  // si el usuario quiere controlar stock
}

interface SidebarProps {
  readonly visible: boolean;
  readonly onClose: () => void;
}

const EMOJIS = ['☕', '🧃', '🎂', '🥐'] as const;
const CATEGORIAS = ['Bebidas', 'Comidas', 'Postres'] as const;

async function subirFoto(uri: string, productoId: string): Promise<string> {
  const response = await fetch(uri);
  const blob = await response.blob();
  const storageRef = ref(storage, `productos/${productoId}_${Date.now()}.jpg`);
  await uploadBytes(storageRef, blob);
  return getDownloadURL(storageRef);
}

export default function Sidebar({ visible, onClose }: SidebarProps) {
  const slideAnim = useRef(new Animated.Value(SIDEBAR_WIDTH)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const [productos, setProductos] = useState<Producto[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editando, setEditando] = useState<Producto | null>(null);
  const [uploading, setUploading] = useState(false);

  const [nombre, setNombre] = useState('');
  const [precio, setPrecio] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [emoji, setEmoji] = useState<string>('☕');
  const [categoria, setCategoria] = useState<string>('Bebidas');
  const [fotoUri, setFotoUri] = useState<string | null>(null);   // local preview
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);   // firestore url
  const [controlStock, setControlStock] = useState(false);
  const [stock, setStock] = useState('');

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'productos'), (snap) => {
      setProductos(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Producto)));
    });
    return unsub;
  }, []);

  useEffect(() => {
    Animated.parallel([
      Animated.spring(slideAnim, {
        toValue: visible ? 0 : SIDEBAR_WIDTH,
        useNativeDriver: true,
        tension: 100,
        friction: 12,
      }),
      Animated.timing(fadeAnim, {
        toValue: visible ? 1 : 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, [visible, slideAnim, fadeAnim]);

  const resetForm = () => {
    setNombre(''); setPrecio(''); setDescripcion('');
    setEmoji('☕'); setCategoria('Bebidas');
    setFotoUri(null); setFotoUrl(null);
    setControlStock(false); setStock('');
    setEditando(null);
  };

  const abrirEditar = (p: Producto) => {
    setEditando(p);
    setNombre(p.nombre); setPrecio(String(p.precio));
    setDescripcion(p.descripcion); setEmoji(p.emoji); setCategoria(p.categoria);
    setFotoUri(null); setFotoUrl(p.fotoUrl ?? null);
    setControlStock(p.controlStock ?? false);
    setStock(p.stock === undefined ? '' : String(p.stock));
    setShowForm(true);
  };

  const pickFoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permiso denegado', 'Necesitamos acceso a tu galería para subir fotos.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      setFotoUri(result.assets[0].uri);
    }
  };

  const tomarFoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permiso denegado', 'Necesitamos acceso a la cámara.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      setFotoUri(result.assets[0].uri);
    }
  };

  const mostrarOpcionesFoto = () => {
    Alert.alert('Foto del producto', 'Elegí de dónde subir la foto', [
      { text: '📷 Cámara', onPress: () => { void tomarFoto(); } },
      { text: '🖼️ Galería', onPress: () => { void pickFoto(); } },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  };

  const guardarProducto = async () => {
    if (!nombre || !precio) {
      Alert.alert('Campos requeridos', 'El nombre y precio son obligatorios.'); return;
    }
    const precioNum = Number.parseFloat(precio);
    if (Number.isNaN(precioNum) || precioNum <= 0) {
      Alert.alert('Precio inválido', 'Ingresá un precio válido mayor a 0.'); return;
    }
    setUploading(true);
    try {
      let fotoFinal = fotoUrl;
      // Subir nueva foto si fue seleccionada
      if (fotoUri) {
        const tempId = editando?.id ?? `temp_${Date.now()}`;
        fotoFinal = await subirFoto(fotoUri, tempId);
      }

      const stockNum = controlStock && stock ? Number.parseInt(stock, 10) : undefined;
      const data = {
        nombre: nombre.trim(),
        precio: precioNum,
        descripcion: descripcion.trim(),
        emoji,
        categoria,
        fotoUrl: fotoFinal ?? null,
        controlStock,
        stock: Number.isFinite(stockNum ?? Number.NaN) ? stockNum : null,
      };

      if (editando) {
        await updateDoc(doc(db, 'productos', editando.id), data);
      } else {
        await addDoc(collection(db, 'productos'), { ...data, creadoEn: serverTimestamp() });
      }
      resetForm();
      setShowForm(false);
    } catch (error) {
      console.error('Error al guardar producto:', error);
      Alert.alert('Error', 'No se pudo guardar el producto.');
    } finally { setUploading(false); }
  };

  const eliminarProducto = (id: string, nombreProducto: string) => {
    Alert.alert('Eliminar producto', `¿Eliminar "${nombreProducto}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar', style: 'destructive',
        onPress: () => { deleteDoc(doc(db, 'productos', id)).catch(console.error); },
      },
    ]);
  };

  const cambiarStockDirecto = (id: string, delta: number, stockActual: number) => {
    const nuevo = Math.max(0, stockActual + delta);
    updateDoc(doc(db, 'productos', id), { stock: nuevo }).catch(console.error);
  };

  const fotoPreview = fotoUri ?? fotoUrl ?? null;

  if (!visible) return null;

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
      <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
        <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={onClose} />
      </Animated.View>

      <Animated.View style={[styles.sidebar, { transform: [{ translateX: slideAnim }] }]}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>

          {/* Header */}
          <View style={styles.sidebarHeader}>
            <View>
              <Text style={styles.sidebarTitle}>Productos</Text>
              <Text style={styles.sidebarSubtitle}>{productos.length} en el menú</Text>
            </View>
            <TouchableOpacity style={styles.addBtn} onPress={() => { resetForm(); setShowForm(true); }}>
              <Text style={styles.addBtnText}>+ Nuevo</Text>
            </TouchableOpacity>
          </View>

          {/* Formulario */}
          {showForm && (
            <ScrollView style={styles.formScroll} keyboardShouldPersistTaps="handled">
              <View style={styles.formContainer}>
                <Text style={styles.formTitle}>{editando ? 'Editar producto' : 'Nuevo producto'}</Text>

                {/* Foto del producto */}
                <Text style={styles.formLabel}>Foto del producto</Text>
                <View style={styles.fotoRow}>
                  <TouchableOpacity style={styles.fotoBtn} onPress={mostrarOpcionesFoto}>
                    {fotoPreview ? (
                      <Image source={{ uri: fotoPreview }} style={styles.fotoPrev} />
                    ) : (
                      <View style={styles.fotoPlaceholder}>
                        <Text style={styles.fotoPlaceholderIcon}>📷</Text>
                        <Text style={styles.fotoPlaceholderText}>Subir foto</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                  {fotoPreview && (
                    <TouchableOpacity
                      style={styles.fotoRemove}
                      onPress={() => { setFotoUri(null); setFotoUrl(null); }}
                    >
                      <Text style={styles.fotoRemoveText}>✕ Quitar foto</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Ícono emoji (alternativa a foto) */}
                <Text style={styles.formLabel}>Ícono (si no hay foto)</Text>
                <View style={styles.emojiRow}>
                  {EMOJIS.map((e) => (
                    <TouchableOpacity
                      key={e}
                      style={[styles.emojiOption, emoji === e && styles.emojiSelected]}
                      onPress={() => setEmoji(e)}
                    >
                      <Text style={styles.emojiOptionText}>{e}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.formLabel}>Nombre *</Text>
                <TextInput style={styles.formInput} placeholder="Ej: Cappuccino" placeholderTextColor={Colors.textLight} value={nombre} onChangeText={setNombre} />

                <Text style={styles.formLabel}>Precio *</Text>
                <TextInput style={styles.formInput} placeholder="0.00" placeholderTextColor={Colors.textLight} value={precio} onChangeText={setPrecio} keyboardType="decimal-pad" />

                <Text style={styles.formLabel}>Descripción</Text>
                <TextInput style={[styles.formInput, styles.formInputMultiline]} placeholder="Descripción opcional..." placeholderTextColor={Colors.textLight} value={descripcion} onChangeText={setDescripcion} multiline />

                <Text style={styles.formLabel}>Categoría</Text>
                <View style={styles.catRow}>
                  {CATEGORIAS.map((c) => (
                    <TouchableOpacity
                      key={c}
                      style={[styles.catChip, categoria === c && styles.catChipActive]}
                      onPress={() => setCategoria(c)}
                    >
                      <Text style={[styles.catChipText, categoria === c && styles.catChipTextActive]}>{c}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Control de stock cafetería */}
                <TouchableOpacity
                  style={styles.stockToggleRow}
                  onPress={() => setControlStock(!controlStock)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.stockToggle, controlStock && styles.stockToggleOn]}>
                    <View style={[styles.stockToggleDot, controlStock && styles.stockToggleDotOn]} />
                  </View>
                  <View>
                    <Text style={styles.stockToggleLabel}>Controlar stock</Text>
                    <Text style={styles.stockToggleSub}>Descontar al cerrar mesa</Text>
                  </View>
                </TouchableOpacity>

                {controlStock && (
                  <>
                    <Text style={styles.formLabel}>Stock actual</Text>
                    <TextInput
                      style={styles.formInput}
                      placeholder="Ej: 50"
                      placeholderTextColor={Colors.textLight}
                      value={stock}
                      onChangeText={setStock}
                      keyboardType="number-pad"
                    />
                  </>
                )}

                <View style={styles.formBtns}>
                  <TouchableOpacity style={styles.cancelBtn} onPress={() => { setShowForm(false); resetForm(); }}>
                    <Text style={styles.cancelBtnText}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.saveBtn} onPress={() => { void guardarProducto(); }} disabled={uploading}>
                    {uploading
                      ? <ActivityIndicator color={Colors.white} />
                      : <Text style={styles.saveBtnText}>Guardar</Text>
                    }
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>
          )}

          {/* Lista de productos */}
          {!showForm && (
            <ScrollView style={styles.productList} showsVerticalScrollIndicator={false}>
              {CATEGORIAS.map((cat) => {
                const prods = productos.filter((p) => p.categoria === cat);
                if (prods.length === 0) return null;
                return (
                  <View key={cat}>
                    <Text style={styles.catHeader}>{cat}</Text>
                    {prods.map((p) => (
                      <View key={p.id} style={styles.productCard}>
                        {/* Imagen o emoji */}
                        <TouchableOpacity style={styles.productImgBox} onPress={() => abrirEditar(p)}>
                          {p.fotoUrl
                            ? <Image source={{ uri: p.fotoUrl }} style={styles.productImg} />
                            : (
                              <View style={styles.productEmoji}>
                                <Text style={styles.productEmojiText}>{p.emoji}</Text>
                              </View>
                            )
                          }
                        </TouchableOpacity>

                        <View style={styles.productInfo}>
                          <Text style={styles.productName}>{p.nombre}</Text>
                          {p.descripcion ? <Text style={styles.productDesc} numberOfLines={1}>{p.descripcion}</Text> : null}
                          <Text style={styles.productPrice}>${p.precio.toFixed(2)}</Text>
                          {/* Stock badge */}
                          {p.controlStock && (
                            <View style={[styles.stockBadge, (p.stock ?? 0) <= 5 && styles.stockBadgeLow]}>
                              <Text style={styles.stockBadgeText}>
                                Stock: {p.stock ?? 0} {(p.stock ?? 0) <= 5 ? '⚠️' : ''}
                              </Text>
                            </View>
                          )}
                        </View>

                        <View style={styles.productRight}>
                          {/* Control stock rápido */}
                          {p.controlStock && (
                            <View style={styles.stockControl}>
                              <TouchableOpacity
                                style={styles.stockBtn}
                                onPress={() => cambiarStockDirecto(p.id, -1, p.stock ?? 0)}
                              >
                                <Text style={styles.stockBtnText}>−</Text>
                              </TouchableOpacity>
                              <Text style={styles.stockNum}>{p.stock ?? 0}</Text>
                              <TouchableOpacity
                                style={styles.stockBtn}
                                onPress={() => cambiarStockDirecto(p.id, 1, p.stock ?? 0)}
                              >
                                <Text style={styles.stockBtnText}>+</Text>
                              </TouchableOpacity>
                            </View>
                          )}
                          <View style={styles.productActions}>
                            <TouchableOpacity style={styles.actionBtn} onPress={() => abrirEditar(p)}>
                              <Text style={styles.actionBtnText}>✏️</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.actionBtn} onPress={() => eliminarProducto(p.id, p.nombre)}>
                              <Text style={styles.actionBtnText}>🗑️</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      </View>
                    ))}
                  </View>
                );
              })}
              {productos.length === 0 && (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyEmoji}>🍽️</Text>
                  <Text style={styles.emptyText}>No hay productos aún</Text>
                  <Text style={styles.emptySubtext}>Tocá "+ Nuevo" para agregar</Text>
                </View>
              )}
              <View style={styles.bottomPad} />
            </ScrollView>
          )}
        </KeyboardAvoidingView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(61,43,31,0.4)' },
  sidebar: {
    position: 'absolute', right: 0, top: 0, bottom: 0, width: SIDEBAR_WIDTH,
    backgroundColor: Colors.background,
    shadowColor: '#000', shadowOffset: { width: -4, height: 0 }, shadowOpacity: 0.15, shadowRadius: 20, elevation: 20,
  },
  sidebarHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 20, paddingTop: 60,
    backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  sidebarTitle: { fontSize: 22, fontWeight: '800', color: Colors.text },
  sidebarSubtitle: { fontSize: 13, color: Colors.textLight, marginTop: 2 },
  addBtn: { backgroundColor: Colors.primary, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12 },
  addBtnText: { color: Colors.white, fontWeight: '700', fontSize: 14 },
  formScroll: { flex: 1 },
  formContainer: { padding: 16, backgroundColor: Colors.white },
  formTitle: { fontSize: 16, fontWeight: '700', color: Colors.text, marginBottom: 12 },
  formLabel: { fontSize: 12, fontWeight: '600', color: Colors.textLight, marginBottom: 4, marginTop: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  formInput: { borderWidth: 1.5, borderColor: Colors.border, borderRadius: 10, padding: 10, fontSize: 14, color: Colors.text, backgroundColor: Colors.background },
  formInputMultiline: { height: 60, textAlignVertical: 'top' },

  // Foto
  fotoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  fotoBtn: {
    width: 80, height: 80, borderRadius: 16, overflow: 'hidden',
    borderWidth: 2, borderColor: Colors.border, borderStyle: 'dashed',
  },
  fotoPrev: { width: '100%', height: '100%', borderRadius: 14 },
  fotoPlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background },
  fotoPlaceholderIcon: { fontSize: 24 },
  fotoPlaceholderText: { fontSize: 10, color: Colors.textLight, marginTop: 2 },
  fotoRemove: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: Colors.border },
  fotoRemoveText: { fontSize: 12, color: Colors.textLight },

  emojiRow: { flexDirection: 'row', gap: 10, marginBottom: 4, paddingVertical: 4 },
  emojiOption: { width: 52, height: 52, borderRadius: 14, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background, borderWidth: 1.5, borderColor: Colors.border },
  emojiSelected: { borderColor: Colors.primary, backgroundColor: Colors.card },
  emojiOptionText: { fontSize: 26 },
  catRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 4 },
  catChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: Colors.background, borderWidth: 1.5, borderColor: Colors.border },
  catChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  catChipText: { fontSize: 13, color: Colors.textLight, fontWeight: '500' },
  catChipTextActive: { color: Colors.white },

  // Stock toggle
  stockToggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16, padding: 12, borderRadius: 12, backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border },
  stockToggle: { width: 44, height: 24, borderRadius: 12, backgroundColor: Colors.border, justifyContent: 'center', paddingHorizontal: 3 },
  stockToggleOn: { backgroundColor: Colors.primary },
  stockToggleDot: { width: 18, height: 18, borderRadius: 9, backgroundColor: Colors.white, alignSelf: 'flex-start' },
  stockToggleDotOn: { alignSelf: 'flex-end' },
  stockToggleLabel: { fontSize: 14, fontWeight: '700', color: Colors.text },
  stockToggleSub: { fontSize: 11, color: Colors.textLight, marginTop: 1 },

  formBtns: { flexDirection: 'row', gap: 10, marginTop: 16, marginBottom: 8 },
  cancelBtn: { flex: 1, padding: 12, borderRadius: 12, borderWidth: 1.5, borderColor: Colors.border, alignItems: 'center' },
  cancelBtnText: { color: Colors.textLight, fontWeight: '600' },
  saveBtn: { flex: 2, padding: 12, borderRadius: 12, backgroundColor: Colors.primary, alignItems: 'center' },
  saveBtnText: { color: Colors.white, fontWeight: '700' },

  // Lista productos
  productList: { flex: 1, padding: 16 },
  catHeader: { fontSize: 12, fontWeight: '700', color: Colors.textLight, textTransform: 'uppercase', letterSpacing: 1, marginTop: 16, marginBottom: 8 },
  productCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.white, borderRadius: 14, padding: 10, marginBottom: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  productImgBox: { marginRight: 10 },
  productImg: { width: 52, height: 52, borderRadius: 12 },
  productEmoji: { width: 52, height: 52, borderRadius: 12, backgroundColor: Colors.card, justifyContent: 'center', alignItems: 'center' },
  productEmojiText: { fontSize: 26 },
  productInfo: { flex: 1 },
  productName: { fontSize: 14, fontWeight: '700', color: Colors.text },
  productDesc: { fontSize: 12, color: Colors.textLight, marginTop: 1 },
  productPrice: { fontSize: 13, fontWeight: '600', color: Colors.primary, marginTop: 2 },
  stockBadge: { marginTop: 4, backgroundColor: '#E8F5E9', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start' },
  stockBadgeLow: { backgroundColor: '#FFF3E0' },
  stockBadgeText: { fontSize: 10, fontWeight: '700', color: Colors.text },
  productRight: { alignItems: 'flex-end', gap: 4 },
  stockControl: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stockBtn: { width: 24, height: 24, borderRadius: 12, backgroundColor: Colors.card, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  stockBtnText: { fontSize: 14, fontWeight: '800', color: Colors.text },
  stockNum: { fontSize: 13, fontWeight: '800', color: Colors.text, minWidth: 20, textAlign: 'center' },
  productActions: { flexDirection: 'row', gap: 2 },
  actionBtn: { padding: 4 },
  actionBtnText: { fontSize: 16 },
  emptyState: { alignItems: 'center', paddingTop: 60 },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 16, fontWeight: '700', color: Colors.text },
  emptySubtext: { fontSize: 13, color: Colors.textLight, marginTop: 4 },
  bottomPad: { height: 40 },
});