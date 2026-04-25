import { api } from '../lazy'
const {
  auth: { list, read },
  create,
  rm,
  update
} = api.poll
export { create, list, read, rm, update }
