import { api } from '../lazy'
const {
  auth: { list, read },
  create,
  pub: { read: pubRead },
  rm,
  update
} = api.chat
export { create, list, pubRead, read, rm, update }
