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
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  updateProfile,
} from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../../config/firebase';
import Colors from '../../constants/colors';

export default function RegisterScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleRegister = async () => {
    if (!name.trim() || !email.trim() || !password || !confirm) {
      Alert.alert('Campos vacíos', 'Por favor completá todos los campos.');
      return;
    }
    if (password !== confirm) {
      Alert.alert('Error', 'Las contraseñas no coinciden.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Error', 'La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    setLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email.trim(),
        password
      );
      const user = userCredential.user;

      await updateProfile(user, { displayName: name.trim() });

      await setDoc(doc(db, 'users', user.uid), {
        uid: user.uid,
        name: name.trim(),
        email: email.trim(),
        createdAt: serverTimestamp(),
        role: 'user',
      });

      // Email de verificación es opcional — no bloquea el flujo si falla
      try {
        await sendEmailVerification(user);
      } catch {
        console.warn('No se pudo enviar el email de verificación.');
      }

      Alert.alert(
        '¡Cuenta creada! 🎉',
        'Tu cuenta fue creada correctamente. Iniciá sesión para continuar.',
        [{ text: 'Ir al login', onPress: () => router.replace('/(auth)/login') }]
      );
    } catch (error: unknown) {
      const firebaseError = error as { code?: string };
      let msg = 'Hubo un error al crear la cuenta. Intentá de nuevo.';
      if (firebaseError.code === 'auth/email-already-in-use') {
        msg = 'Ya existe una cuenta con ese email. Podés iniciar sesión.';
      } else if (firebaseError.code === 'auth/invalid-email') {
        msg = 'El email ingresado no es válido.';
      } else if (firebaseError.code === 'auth/weak-password') {
        msg = 'La contraseña es muy débil. Usá al menos 6 caracteres.';
      } else if (firebaseError.code === 'auth/network-request-failed') {
        msg = 'Error de conexión. Verificá tu internet e intentá de nuevo.';
      }
      Alert.alert('Error al registrarse', msg);
    } finally {
      setLoading(false);
    }
  };

  const passwordsMatch = confirm.length > 0 && password !== confirm;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

        <View style={styles.header}>
          <View style={styles.logoCircle}>
            <Text style={styles.logoText}>D</Text>
          </View>
          <Text style={styles.appName}>Duel</Text>
          <Text style={styles.subtitle}>Café & TCG</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Crear cuenta</Text>

          <Text style={styles.label}>Nombre completo</Text>
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="Tu nombre"
              placeholderTextColor={Colors.textLight}
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              autoCorrect={false}
            />
          </View>

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
              placeholder="Mínimo 6 caracteres"
              placeholderTextColor={Colors.textLight}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPass}
              autoCapitalize="none"
            />
            <TouchableOpacity onPress={() => setShowPass(!showPass)} style={styles.eyeBtn}>
              <Text style={styles.eyeText}>{showPass ? '🙈' : '👁️'}</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>Confirmar contraseña</Text>
          <View style={[styles.inputContainer, passwordsMatch && styles.inputError]}>
            <TextInput
              style={styles.inputFlex}
              placeholder="Repetí tu contraseña"
              placeholderTextColor={Colors.textLight}
              value={confirm}
              onChangeText={setConfirm}
              secureTextEntry={!showConfirm}
              autoCapitalize="none"
            />
            <TouchableOpacity onPress={() => setShowConfirm(!showConfirm)} style={styles.eyeBtn}>
              <Text style={styles.eyeText}>{showConfirm ? '🙈' : '👁️'}</Text>
            </TouchableOpacity>
          </View>
          {passwordsMatch && (
            <Text style={styles.errorText}>Las contraseñas no coinciden</Text>
          )}

          <TouchableOpacity
            style={[styles.registerBtn, loading && styles.registerBtnDisabled]}
            onPress={() => { void handleRegister(); }}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color={Colors.white} />
              : <Text style={styles.registerBtnText}>Crear cuenta</Text>
            }
          </TouchableOpacity>
        </View>

        <View style={styles.loginRow}>
          <Text style={styles.loginText}>¿Ya tenés cuenta? </Text>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.loginLink}>Iniciá sesión</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  header: { alignItems: 'center', marginBottom: 28 },
  logoCircle: {
    width: 70, height: 70, borderRadius: 35,
    backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center',
    marginBottom: 10, shadowColor: Colors.secondary,
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
  },
  logoText: { fontSize: 34, fontWeight: 'bold', color: Colors.white },
  appName: { fontSize: 28, fontWeight: 'bold', color: Colors.text, letterSpacing: 2 },
  subtitle: { fontSize: 13, color: Colors.textLight, marginTop: 4 },
  card: {
    backgroundColor: Colors.white, borderRadius: 24, padding: 24,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 12, elevation: 4,
  },
  title: { fontSize: 22, fontWeight: '700', color: Colors.text, marginBottom: 16, textAlign: 'center' },
  label: { fontSize: 13, fontWeight: '600', color: Colors.text, marginBottom: 6, marginTop: 12 },
  inputContainer: {
    flexDirection: 'row', alignItems: 'center', borderWidth: 1.5,
    borderColor: Colors.border, borderRadius: 12, backgroundColor: Colors.background, paddingHorizontal: 14,
  },
  inputError: { borderColor: Colors.error },
  input: { flex: 1, paddingVertical: 14, fontSize: 15, color: Colors.text },
  inputFlex: { flex: 1, paddingVertical: 14, fontSize: 15, color: Colors.text },
  eyeBtn: { padding: 8 },
  eyeText: { fontSize: 16 },
  errorText: { color: Colors.error, fontSize: 12, marginTop: 4, marginLeft: 4 },
  registerBtn: {
    backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', marginTop: 24, shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 5,
  },
  registerBtnDisabled: { opacity: 0.7 },
  registerBtnText: { color: Colors.white, fontSize: 16, fontWeight: '700', letterSpacing: 0.5 },
  loginRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 24 },
  loginText: { color: Colors.textLight, fontSize: 14 },
  loginLink: { color: Colors.primary, fontSize: 14, fontWeight: '700' },
});