import type { ReactNode } from 'react'
import { ConvexProvider as BaseProvider, ConvexReactClient as Client } from 'convex/react'
interface ConvexProviderProps {
  children: ReactNode
  convexUrl: string
}
const clients = new Map<string, Client>(),
  getClient = (url: string) => {
    let c = clients.get(url)
    if (!c) {
      c = new Client(url, { unsavedChangesWarning: false, verbose: true })
      clients.set(url, c)
    }
    return c
  },
  ConvexProvider = ({ children, convexUrl }: ConvexProviderProps) => {
    const client = getClient(convexUrl)
    return <BaseProvider client={client}>{children}</BaseProvider>
  }
export default ConvexProvider
