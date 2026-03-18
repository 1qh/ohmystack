import { crud } from '../lazy'
import { owned } from '../t'

export const {
  auth: { list, read },
  create,
  pub: { read: pubRead },
  rm,
  update
  // eslint-disable-next-line noboil-convex/require-rate-limit -- demo backend keeps default write throughput
} = crud('chat', owned.chat, {
  cascade: [{ foreignKey: 'chatId', table: 'message' }],
  pub: { where: { isPublic: true } }
})
