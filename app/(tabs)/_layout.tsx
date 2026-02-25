import { Tabs } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import { SidebarProvider } from '../../contexts/SidebarContext';
import GlobalSidebar from '../../components/GlobalSidebar';
import Colors from '../../constants/colors';

function TabsWithSidebar() {
  return (
    <View style={styles.container}>
      <Tabs screenOptions={{ headerShown: false, tabBarStyle: styles.tabBarHidden }}>
        <Tabs.Screen name="mesas" />
        <Tabs.Screen name="torneos" />
        <Tabs.Screen name="configuracion" />
        <Tabs.Screen name="metricas" />
      </Tabs>
      <GlobalSidebar />
    </View>
  );
}

export default function TabsLayout() {
  return (
    <SidebarProvider>
      <TabsWithSidebar />
    </SidebarProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  tabBarHidden: { display: 'none' },
});