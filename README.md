# ☕🃏 DuelCoffe & TCG - Sistema de Gestión

¡Bienvenido al repositorio de **DuelCoffe & TCG**! 

Esta es una aplicación móvil integral desarrollada para gestionar un negocio híbrido: una moderna cafetería que también funciona como espacio para jugadores de TCG (Trading Card Games). La app centraliza desde la toma de pedidos en las mesas hasta el control de inventario y la organización de torneos.

## 🎯 Propósito del Proyecto
El objetivo principal de esta aplicación es resolver las necesidades de gestión de un negocio de doble rubro. A diferencia de los sistemas de cafetería tradicionales, **DuelCoffe & TCG** permite administrar tanto el consumo gastronómico en mesas como el alquiler de salas, el inventario de cartas/productos TCG, y la gestión de eventos para la comunidad de jugadores.

## ✨ Características Principales

- **🗺️ Gestión de Mesas y Salas:** Control en tiempo real del estado de las mesas (libres/ocupadas) y salas de juego.
- **🍔 Menú y Catálogo Dinámico:** Creación, edición y eliminación de productos (Bebidas, Comidas, Postres, TCG). 
- **📸 Soporte Multimedia:** Subida de imágenes personalizadas para cada producto desde la cámara o galería (o uso de emojis como alternativa visual rápida).
- **📦 Control de Stock Rápido:** Sistema de inventario integrado que permite descontar stock directamente al cerrar una mesa o vender un producto.
- **🏆 Gestión de Torneos:** (Módulo dedicado) Administración de eventos TCG, métricas y participación.
- **📊 Métricas y Estadísticas:** Panel para visualizar el rendimiento del negocio.
- **🔐 Autenticación Segura:** Sistema de Login y Registro para que solo el personal autorizado acceda a la gestión.

## 🛠️ Tecnologías y Lenguajes Usados

El proyecto está construido con un stack moderno y escalable, pensado para un alto rendimiento en dispositivos móviles:

- **Frontend / Mobile:** [React Native](https://reactnative.dev/) 
- **Framework:** [Expo](https://expo.dev/) (Utilizando **Expo Router** para una navegación basada en archivos)
- **Lenguaje:** [TypeScript](https://www.typescriptlang.org/) (Para un código seguro, tipado y predecible)
- **Backend as a Service (BaaS):** [Firebase](https://firebase.google.com/)
  - **Base de Datos:** Cloud Firestore (NoSQL, en tiempo real)
  - **Almacenamiento:** Firebase Storage (Para imágenes de productos)
  - **Autenticación:** Firebase Authentication

## 📂 Estructura del Proyecto

El código sigue una arquitectura modular y limpia, basada en las mejores prácticas de Expo Router:

```text
DuelCoffe-TCG/
├── app/                  # Rutas principales de la app (Expo Router)
│   ├── (auth)/           # Pantallas de autenticación (Login, Registro)
│   ├── (tabs)/           # Pantallas principales (Mesas, Torneos, Métricas, Config)
│   └── _layout.tsx       # Layout principal de navegación
├── components/           # Componentes UI reutilizables (Sidebar, Modales, Cards)
├── config/               # Archivos de configuración externa (Firebase)
├── constants/            # Constantes de diseño (Colores, Tipografías)
├── contexts/             # Gestión de estados globales (Context API)
└── assets/               # Imágenes estáticas, íconos y splash screen

🚀 Instalación y Configuración Local
Si deseas clonar y correr este proyecto en tu máquina local, sigue estos pasos:

Clona el repositorio:

git clone [https://github.com/fabrithompson/DuelCoffe-TCG.git](https://github.com/fabrithompson/DuelCoffe-TCG.git)

Instala las dependencias:

cd DuelCoffe-TCG
npm install

Configura las Variables de Entorno:

Crea un archivo llamado .env en la raíz del proyecto y agrega tus credenciales de Firebase (el archivo .env está ignorado en Git por seguridad):

Fragmento de código

EXPO_PUBLIC_FIREBASE_API_KEY=tu_api_key
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=tu_dominio
EXPO_PUBLIC_FIREBASE_PROJECT_ID=tu_project_id
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=tu_storage
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=tu_sender_id
EXPO_PUBLIC_FIREBASE_APP_ID=tu_app_id

Inicia el servidor de desarrollo:

npx expo start --clear

💡 Próximos Pasos (Posibilidades y Escalabilidad)
La arquitectura actual permite expandir la app fácilmente en el futuro:

Roles de Usuario: Diferenciar entre "Admin" (Dueño) y "Staff" (Meseros) limitando qué pantallas pueden ver.

Integración de Pagos: Conectar APIs de pago (MercadoPago, Stripe) para cobrar torneos por adelantado o cerrar cuentas de mesas.

Notificaciones Push: Avisar a los jugadores registrados en la app cuándo empieza un torneo o cuándo su pedido de cafetería está listo.

Desarrollado con ❤️ por @fabrithompson