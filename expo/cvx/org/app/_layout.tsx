import '../global.css'

import ConvexProvider from '@a/fe-mobile/convex-provider'
import { NAV_THEME } from '@a/rnr/lib/theme'
import { ThemeProvider } from '@react-navigation/native'
import { PortalHost } from '@rn-primitives/portal'
import { Stack } from 'expo-router'
import { useColorScheme, View } from 'react-native'

const convexUrl = String(process.env.EXPO_PUBLIC_CONVEX_URL ?? 'http://127.0.0.1:3210'),
  SCREEN_OPTIONS = { headerShown: false } as const,
  Layout = () => {
    const colorScheme = useColorScheme(),
      theme = colorScheme === 'dark' ? NAV_THEME.dark : NAV_THEME.light

    return (
      <ConvexProvider convexUrl={convexUrl}>
        <ThemeProvider value={theme}>
          <View className='flex-1 bg-background'>
            <Stack screenOptions={SCREEN_OPTIONS} />
            <PortalHost />
          </View>
        </ThemeProvider>
      </ConvexProvider>
    )
  }

export default Layout
