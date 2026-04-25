import { s } from '@a/be-spacetimedb/s'
const createPoll = s.poll.pick({ options: true, question: true })
const profileSchema = s.pollProfile
export { createPoll, profileSchema }
