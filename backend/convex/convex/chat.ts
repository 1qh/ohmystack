import { crud } from '../lazy'
import { owned } from '../t'
export const {
  auth: { list, read },
  create,
  pub: { read: pubRead },
  rm,
  update
} = crud('chat', owned.chat, {
  cascade: [{ foreignKey: 'chatId', table: 'message' }],
  pub: { where: { isPublic: true } },
  rateLimit: { max: 30, window: 60_000 }
})
