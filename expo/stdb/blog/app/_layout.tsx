// oxlint-disable-next-line import/no-unassigned-import
import '../global.css'
import SpacetimeDBProvider from '@a/fe-mobile/spacetimedb-provider'
import { NAV_THEME } from '@a/rnr/lib/theme'
import { ThemeProvider } from '@react-navigation/native'
import { PortalHost } from '@rn-primitives/portal'
import { Stack } from 'expo-router'
import { useColorScheme, View } from 'react-native'
const moduleName = String(process.env.EXPO_PUBLIC_SPACETIMEDB_MODULE ?? 'noboil'),
  uri = String(process.env.EXPO_PUBLIC_SPACETIMEDB_URI ?? 'ws://localhost:3000'),
  SCREEN_OPTIONS = { headerShown: false } as const,
  Layout = () => {
    const colorScheme = useColorScheme(),
      theme = colorScheme === 'dark' ? NAV_THEME.dark : NAV_THEME.light
    return (
      <SpacetimeDBProvider moduleName={moduleName} uri={uri}>
        <ThemeProvider value={theme}>
          <View className='flex-1 bg-background'>
            <Stack screenOptions={SCREEN_OPTIONS} />
            <PortalHost />
          </View>
        </ThemeProvider>
      </SpacetimeDBProvider>
    )
  }
export default Layout
