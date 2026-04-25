import { owned, singleton } from '@a/be-convex/s'
const createPoll = owned.poll.pick({ options: true, question: true })
const profileSchema = singleton.pollProfile
export { createPoll, profileSchema }
