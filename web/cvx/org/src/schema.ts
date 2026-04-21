import { org, singleton } from '@a/be-convex/s'
import { file } from 'noboil/convex/schema'
import { boolean, email, object, string } from 'zod/v4'
const orgTeam = org.team.omit({ avatarId: true })
const invite = object({ email: email(), isAdmin: boolean() })
const joinRequest = object({ message: string().optional() })
const profileStep = singleton.orgProfile.pick({ avatar: true, bio: true, displayName: true })
const orgStep = object({
  name: string().min(1),
  slug: string()
    .min(1)
    .regex(/^[a-z0-9-]+$/u)
})
const appearanceStep = object({
  orgAvatar: file().nullable().optional()
})
const preferencesStep = singleton.orgProfile.pick({ notifications: true, theme: true })
export { appearanceStep, invite, joinRequest, orgStep, orgTeam, preferencesStep, profileStep }
