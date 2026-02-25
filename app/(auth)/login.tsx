import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../../config/firebase';
import Colors from '../../constants/colors';

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Campos vacíos', 'Por favor completá tu email y contraseña.');
      return;
    }
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      router.replace('/(tabs)/mesas');
    } catch (error: unknown) {
      const firebaseError = error as { code?: string };
      let msg = 'Hubo un error al iniciar sesión. Intentá de nuevo.';
      if (firebaseError.code === 'auth/user-not-found') {
        msg = 'No existe una cuenta con ese email.';
      } else if (firebaseError.code === 'auth/wrong-password') {
        msg = 'Contraseña incorrecta.';
      } else if (firebaseError.code === 'auth/invalid-email') {
        msg = 'El email no es válido.';
      } else if (firebaseError.code === 'auth/invalid-credential') {
        msg = 'Email o contraseña incorrectos.';
      } else if (firebaseError.code === 'auth/too-many-requests') {
        msg = 'Demasiados intentos fallidos. Esperá unos minutos e intentá de nuevo.';
      } else if (firebaseError.code === 'auth/network-request-failed') {
        msg = 'Error de conexión. Verificá tu internet.';
      }
      Alert.alert('Error al iniciar sesión', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

        {/* Logo */}
        <View style={styles.header}>
          <View style={styles.logoCircle}>
            <Text style={styles.logoText}>D</Text>
          </View>
          <Text style={styles.appName}>Duel</Text>
          <Text style={styles.subtitle}>Café & TCG</Text>
        </View>

        {/* Card */}
        <View style={styles.card}>
          <Text style={styles.title}>¡Bienvenido de nuevo!</Text>

          <Text style={styles.label}>Email</Text>
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="tu@email.com"
              placeholderTextColor={Colors.textLight}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <Text style={styles.label}>Contraseña</Text>
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.inputFlex}
              placeholder="••••••••"
              placeholderTextColor={Colors.textLight}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
            />
            <TouchableOpacity
              onPress={() => setShowPassword(!showPassword)}
              style={styles.eyeBtn}
            >
              <Text style={styles.eyeText}>{showPassword ? '🙈' : '👁️'}</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.forgotBtn}>
            <Text style={styles.forgotText}>¿Olvidaste tu contraseña?</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.loginBtn, loading && styles.loginBtnDisabled]}
            onPress={() => { void handleLogin(); }}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color={Colors.white} />
              : <Text style={styles.loginBtnText}>Ingresar</Text>
            }
          </TouchableOpacity>

          {/* Próximamente */}
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>próximamente</Text>
            <View style={styles.dividerLine} />
          </View>

          <TouchableOpacity style={styles.socialBtnDisabled} disabled>
            <Text style={styles.socialIcon}>G</Text>
            <Text style={styles.socialTextDisabled}>Continuar con Google</Text>
            <View style={styles.comingSoonBadge}>
              <Text style={styles.comingSoonText}>Pronto</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.socialBtnDisabled} disabled>
            <Text style={styles.socialIcon}>🍎</Text>
            <Text style={styles.socialTextDisabled}>Continuar con Apple</Text>
            <View style={styles.comingSoonBadge}>
              <Text style={styles.comingSoonText}>Pronto</Text>
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.registerRow}>
          <Text style={styles.registerText}>¿No tenés cuenta? </Text>
          <TouchableOpacity onPress={() => router.push('/(auth)/register')}>
            <Text style={styles.registerLink}>Registrate</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  header: { alignItems: 'center', marginBottom: 32 },
  logoCircle: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center',
    marginBottom: 12, shadowColor: Colors.secondary,
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
  },
  logoText: { fontSize: 40, fontWeight: 'bold', color: Colors.white },
  appName: { fontSize: 32, fontWeight: 'bold', color: Colors.text, letterSpacing: 2 },
  subtitle: { fontSize: 14, color: Colors.textLight, marginTop: 4 },
  card: {
    backgroundColor: Colors.white, borderRadius: 24, padding: 24,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 12, elevation: 4,
  },
  title: { fontSize: 22, fontWeight: '700', color: Colors.text, marginBottom: 20, textAlign: 'center' },
  label: { fontSize: 13, fontWeight: '600', color: Colors.text, marginBottom: 6, marginTop: 12 },
  inputContainer: {
    flexDirection: 'row', alignItems: 'center', borderWidth: 1.5,
    borderColor: Colors.border, borderRadius: 12,
    backgroundColor: Colors.background, paddingHorizontal: 14,
  },
  input: { flex: 1, paddingVertical: 14, fontSize: 15, color: Colors.text },
  inputFlex: { flex: 1, paddingVertical: 14, fontSize: 15, color: Colors.text },
  eyeBtn: { padding: 8 },
  eyeText: { fontSize: 16 },
  forgotBtn: { alignSelf: 'flex-end', marginTop: 8, marginBottom: 20 },
  forgotText: { fontSize: 13, color: Colors.primary, fontWeight: '500' },
  loginBtn: {
    backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 16, alignItems: 'center',
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 8, elevation: 5,
  },
  loginBtnDisabled: { opacity: 0.7 },
  loginBtnText: { color: Colors.white, fontSize: 16, fontWeight: '700', letterSpacing: 0.5 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 20 },
  dividerLine: { flex: 1, height: 1, backgroundColor: Colors.border },
  dividerText: { marginHorizontal: 12, fontSize: 12, color: Colors.textLight },
  socialBtnDisabled: {
    flexDirection: 'row', alignItems: 'center', borderWidth: 1.5,
    borderColor: Colors.border, borderRadius: 14, paddingVertical: 13,
    paddingHorizontal: 20, marginBottom: 10, backgroundColor: Colors.background, opacity: 0.5,
  },
  socialIcon: { fontSize: 18, marginRight: 12, fontWeight: 'bold', color: Colors.textLight, width: 24, textAlign: 'center' },
  socialTextDisabled: { fontSize: 15, color: Colors.textLight, fontWeight: '500', flex: 1 },
  comingSoonBadge: {
    backgroundColor: Colors.card, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
  },
  comingSoonText: { fontSize: 11, color: Colors.textLight, fontWeight: '600' },
  registerRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 24 },
  registerText: { color: Colors.textLight, fontSize: 14 },
  registerLink: { color: Colors.primary, fontSize: 14, fontWeight: '700' },
});