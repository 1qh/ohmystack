import { org, singleton } from '@a/be-convex/t'
import { cvFile } from '@noboil/convex/schema'
import { boolean, email, object, string } from 'zod/v4'

const orgTeam = org.team.omit({ avatarId: true }),
  invite = object({ email: email(), isAdmin: boolean() }),
  joinRequest = object({ message: string().optional() }),
  profileStep = singleton.orgProfile.pick({ avatar: true, bio: true, displayName: true }),
  orgStep = object({
    name: string().min(1),
    slug: string()
      .min(1)
      .regex(/^[a-z0-9-]+$/u)
  }),
  appearanceStep = object({
    orgAvatar: cvFile().nullable().optional()
  }),
  preferencesStep = singleton.orgProfile.pick({ notifications: true, theme: true })

export { appearanceStep, invite, joinRequest, orgStep, orgTeam, preferencesStep, profileStep }
