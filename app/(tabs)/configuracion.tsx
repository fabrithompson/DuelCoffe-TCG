import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  updateEmail,
  updatePassword,
  updateProfile,
  reauthenticateWithCredential,
  EmailAuthProvider,
} from 'firebase/auth';
import { auth } from '../../config/firebase';
import { useSidebar } from '../../contexts/SidebarContext';
import Colors from '../../constants/colors';

type Seccion = 'menu' | 'nombre' | 'email' | 'password';

// ─── Reautenticación ──────────────────────────────────────────────────────────

async function reautenticar(passwordActual: string): Promise<void> {
  const user = auth.currentUser;
  if (!user?.email) throw new Error('No hay usuario autenticado.');
  const credential = EmailAuthProvider.credential(user.email, passwordActual);
  await reauthenticateWithCredential(user, credential);
}

// ─── Sección cambiar nombre ───────────────────────────────────────────────────

function CambiarNombre({ onBack }: { readonly onBack: () => void }) {
  const [nombre, setNombre] = useState(auth.currentUser?.displayName ?? '');
  const [loading, setLoading] = useState(false);

  const guardar = async () => {
    if (!nombre.trim()) { Alert.alert('Error', 'El nombre no puede estar vacío.'); return; }
    setLoading(true);
    try {
      await updateProfile(auth.currentUser!, { displayName: nombre.trim() });
      Alert.alert('✅ Listo', 'Nombre actualizado correctamente.');
      onBack();
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'No se pudo actualizar el nombre.');
    } finally { setLoading(false); }
  };

  return (
    <View style={styles.seccionContainer}>
      <Text style={styles.seccionTitulo}>Cambiar nombre</Text>
      <Text style={styles.formLabel}>Nombre de usuario</Text>
      <TextInput
        style={styles.input}
        value={nombre}
        onChangeText={setNombre}
        placeholder="Tu nombre"
        placeholderTextColor={Colors.textLight}
        autoFocus
      />
      <TouchableOpacity style={styles.primaryBtn} onPress={() => { void guardar(); }} disabled={loading}>
        {loading ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.primaryBtnText}>Guardar nombre</Text>}
      </TouchableOpacity>
    </View>
  );
}

// ─── Sección cambiar email ────────────────────────────────────────────────────

function CambiarEmail({ onBack }: { readonly onBack: () => void }) {
  const [email, setEmail] = useState('');
  const [passwordActual, setPasswordActual] = useState('');
  const [loading, setLoading] = useState(false);

  const guardar = async () => {
    if (!email.trim() || !passwordActual) { Alert.alert('Error', 'Completá todos los campos.'); return; }
    if (!email.includes('@')) { Alert.alert('Error', 'Email inválido.'); return; }
    setLoading(true);
    try {
      await reautenticar(passwordActual);
      await updateEmail(auth.currentUser!, email.trim());
      Alert.alert('✅ Listo', 'Email actualizado correctamente.');
      onBack();
    } catch (error: unknown) {
      console.error(error);
      const msg = error instanceof Error && error.message.includes('wrong-password')
        ? 'Contraseña actual incorrecta.'
        : 'No se pudo actualizar el email.';
      Alert.alert('Error', msg);
    } finally { setLoading(false); }
  };

  return (
    <View style={styles.seccionContainer}>
      <Text style={styles.seccionTitulo}>Cambiar email</Text>
      <View style={styles.infoBox}>
        <Text style={styles.infoText}>Email actual: {auth.currentUser?.email ?? '—'}</Text>
      </View>
      <Text style={styles.formLabel}>Nuevo email</Text>
      <TextInput
        style={styles.input}
        value={email}
        onChangeText={setEmail}
        placeholder="nuevo@email.com"
        placeholderTextColor={Colors.textLight}
        keyboardType="email-address"
        autoCapitalize="none"
        autoFocus
      />
      <Text style={styles.formLabel}>Contraseña actual (para verificar)</Text>
      <TextInput
        style={styles.input}
        value={passwordActual}
        onChangeText={setPasswordActual}
        placeholder="Tu contraseña actual"
        placeholderTextColor={Colors.textLight}
        secureTextEntry
      />
      <TouchableOpacity style={styles.primaryBtn} onPress={() => { void guardar(); }} disabled={loading}>
        {loading ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.primaryBtnText}>Actualizar email</Text>}
      </TouchableOpacity>
    </View>
  );
}

// ─── Sección cambiar contraseña ───────────────────────────────────────────────

function CambiarPassword({ onBack }: { readonly onBack: () => void }) {
  const [passwordActual, setPasswordActual] = useState('');
  const [passwordNuevo, setPasswordNuevo] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  const guardar = async () => {
    if (!passwordActual || !passwordNuevo || !passwordConfirm) {
      Alert.alert('Error', 'Completá todos los campos.'); return;
    }
    if (passwordNuevo.length < 6) { Alert.alert('Error', 'La nueva contraseña debe tener al menos 6 caracteres.'); return; }
    if (passwordNuevo !== passwordConfirm) { Alert.alert('Error', 'Las contraseñas nuevas no coinciden.'); return; }
    setLoading(true);
    try {
      await reautenticar(passwordActual);
      await updatePassword(auth.currentUser!, passwordNuevo);
      Alert.alert('✅ Listo', 'Contraseña actualizada correctamente.');
      onBack();
    } catch (error: unknown) {
      console.error(error);
      const msg = error instanceof Error && error.message.includes('wrong-password')
        ? 'Contraseña actual incorrecta.'
        : 'No se pudo actualizar la contraseña.';
      Alert.alert('Error', msg);
    } finally { setLoading(false); }
  };

  return (
    <View style={styles.seccionContainer}>
      <Text style={styles.seccionTitulo}>Cambiar contraseña</Text>
      <Text style={styles.formLabel}>Contraseña actual</Text>
      <TextInput style={styles.input} value={passwordActual} onChangeText={setPasswordActual} placeholder="Contraseña actual" placeholderTextColor={Colors.textLight} secureTextEntry autoFocus />
      <Text style={styles.formLabel}>Nueva contraseña</Text>
      <TextInput style={styles.input} value={passwordNuevo} onChangeText={setPasswordNuevo} placeholder="Mínimo 6 caracteres" placeholderTextColor={Colors.textLight} secureTextEntry />
      <Text style={styles.formLabel}>Confirmar nueva contraseña</Text>
      <TextInput style={styles.input} value={passwordConfirm} onChangeText={setPasswordConfirm} placeholder="Repetir nueva contraseña" placeholderTextColor={Colors.textLight} secureTextEntry />
      <TouchableOpacity style={styles.primaryBtn} onPress={() => { void guardar(); }} disabled={loading}>
        {loading ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.primaryBtnText}>Actualizar contraseña</Text>}
      </TouchableOpacity>
    </View>
  );
}

// ─── Pantalla principal ───────────────────────────────────────────────────────

export default function ConfiguracionScreen() {
  const { open: openNav } = useSidebar();
  const [seccion, setSeccion] = useState<Seccion>('menu');
  const user = auth.currentUser;

  const renderSeccion = () => {
    switch (seccion) {
      case 'nombre': return <CambiarNombre onBack={() => setSeccion('menu')} />;
      case 'email': return <CambiarEmail onBack={() => setSeccion('menu')} />;
      case 'password': return <CambiarPassword onBack={() => setSeccion('menu')} />;
      default: return null;
    }
  };

  const opciones = [
    { id: 'nombre' as Seccion, emoji: '👤', label: 'Nombre de usuario', sub: user?.displayName ?? 'Sin nombre', color: Colors.primary },
    { id: 'email' as Seccion, emoji: '📧', label: 'Correo electrónico', sub: user?.email ?? '—', color: '#4B90E2' },
    { id: 'password' as Seccion, emoji: '🔐', label: 'Contraseña', sub: '••••••••', color: '#9B6ED8' },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.hamburger} onPress={openNav}>
          <View style={styles.hamburgerLine} />
          <View style={styles.hamburgerLine} />
          <View style={styles.hamburgerLine} />
        </TouchableOpacity>
        {seccion !== 'menu' && (
          <TouchableOpacity style={styles.backBtn} onPress={() => setSeccion('menu')}>
            <Text style={styles.backBtnText}>← Volver</Text>
          </TouchableOpacity>
        )}
        <Text style={styles.headerTitle}>⚙️ Mi cuenta</Text>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {seccion === 'menu' ? (
            <>
              {/* Avatar */}
              <View style={styles.avatarSection}>
                <View style={styles.avatarCircle}>
                  <Text style={styles.avatarText}>
                    {(user?.displayName ?? user?.email ?? '?').charAt(0).toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.avatarName}>{user?.displayName ?? 'Usuario'}</Text>
                <Text style={styles.avatarEmail}>{user?.email ?? ''}</Text>
              </View>

              {/* Opciones */}
              <View style={styles.opcionesCard}>
                {opciones.map((op, idx) => (
                  <TouchableOpacity
                    key={op.id}
                    style={[styles.opcionRow, idx < opciones.length - 1 && styles.opcionRowBorder]}
                    onPress={() => setSeccion(op.id)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.opcionIcon, { backgroundColor: op.color + '18' }]}>
                      <Text style={styles.opcionEmoji}>{op.emoji}</Text>
                    </View>
                    <View style={styles.opcionTexts}>
                      <Text style={styles.opcionLabel}>{op.label}</Text>
                      <Text style={styles.opcionSub} numberOfLines={1}>{op.sub}</Text>
                    </View>
                    <Text style={styles.opcionArrow}>›</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Info sesión */}
              <View style={styles.infoCard}>
                <Text style={styles.infoCardLabel}>Información de sesión</Text>
                <Text style={styles.infoCardText}>UID: {user?.uid?.substring(0, 16)}...</Text>
                <Text style={styles.infoCardText}>
                  Verificado: {user?.emailVerified ? '✅ Sí' : '❌ No'}
                </Text>
              </View>
            </>
          ) : (
            renderSeccion()
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 12,
    backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border, gap: 10,
  },
  hamburger: { padding: 6, gap: 5, justifyContent: 'center' },
  hamburgerLine: { width: 22, height: 2.5, backgroundColor: Colors.text, borderRadius: 2 },
  backBtn: { paddingVertical: 4 },
  backBtnText: { fontSize: 14, color: Colors.primary, fontWeight: '600' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: Colors.text, flex: 1 },
  content: { padding: 20 },
  avatarSection: { alignItems: 'center', marginBottom: 28, marginTop: 12 },
  avatarCircle: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: Colors.primary,
    justifyContent: 'center', alignItems: 'center', marginBottom: 12,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
  },
  avatarText: { fontSize: 34, fontWeight: '900', color: Colors.white },
  avatarName: { fontSize: 22, fontWeight: '800', color: Colors.text },
  avatarEmail: { fontSize: 14, color: Colors.textLight, marginTop: 4 },
  opcionesCard: {
    backgroundColor: Colors.white, borderRadius: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 10, elevation: 3,
    marginBottom: 16, overflow: 'hidden',
  },
  opcionRow: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 14 },
  opcionRowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  opcionIcon: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  opcionEmoji: { fontSize: 20 },
  opcionTexts: { flex: 1 },
  opcionLabel: { fontSize: 15, fontWeight: '700', color: Colors.text },
  opcionSub: { fontSize: 12, color: Colors.textLight, marginTop: 2 },
  opcionArrow: { fontSize: 22, color: Colors.textLight, fontWeight: '300' },
  infoCard: {
    backgroundColor: Colors.white, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: Colors.border,
  },
  infoCardLabel: { fontSize: 12, fontWeight: '700', color: Colors.textLight, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },
  infoCardText: { fontSize: 13, color: Colors.textLight, marginTop: 4 },

  // Secciones de edición
  seccionContainer: { marginTop: 8 },
  seccionTitulo: { fontSize: 20, fontWeight: '800', color: Colors.text, marginBottom: 20 },
  infoBox: {
    backgroundColor: Colors.card, borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: Colors.border, marginBottom: 16,
  },
  infoText: { fontSize: 13, color: Colors.textLight },
  formLabel: { fontSize: 12, fontWeight: '700', color: Colors.textLight, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, marginTop: 14 },
  input: {
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: 14,
    padding: 14, fontSize: 15, color: Colors.text, backgroundColor: Colors.white,
  },
  primaryBtn: {
    backgroundColor: Colors.primary, borderRadius: 16, padding: 15,
    alignItems: 'center', marginTop: 24,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 5,
  },
  primaryBtnText: { color: Colors.white, fontWeight: '800', fontSize: 16 },
});