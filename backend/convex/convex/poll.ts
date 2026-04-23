import { api } from '../lazy'
const {
  auth: { list },
  create,
  rm,
  update
} = api.poll
export { create, list, rm, update }
