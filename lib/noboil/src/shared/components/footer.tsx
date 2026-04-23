import { Box, Text } from 'ink'
interface Shortcut {
  desc: string
  keys: string
}
const Footer = ({ shortcuts }: { shortcuts: Shortcut[] }) => (
  <Box marginTop={1}>
    <Text dimColor>{shortcuts.map(s => `${s.keys} ${s.desc}`).join(' · ')}</Text>
  </Box>
)
export type { Shortcut }
export { Footer }
