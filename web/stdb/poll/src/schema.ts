import { s } from '@a/be-spacetimedb/s'
const createPoll = s.poll.pick({ options: true, question: true })
export { createPoll }
