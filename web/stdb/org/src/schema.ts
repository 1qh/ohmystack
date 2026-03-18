import { s } from '@a/be-spacetimedb/t'
import { cvFile } from '@noboil/spacetimedb/schema'
import { boolean, email, object, string } from 'zod/v4'

const { project, wiki: wikiSchema } = s,
  orgTeam = s.team.omit({ avatarId: true }),
  wiki = wikiSchema.omit({ content: true }).extend({ content: string().optional() }),
  invite = object({ email: email(), isAdmin: boolean() }),
  joinRequest = object({ message: string().optional() }),
  profileStep = s.orgProfile.pick({ avatar: true, bio: true, displayName: true }),
  orgStep = object({
    name: string().min(1),
    slug: string()
      .min(1)
      .regex(/^[a-z0-9-]+$/u)
  }),
  appearanceStep = object({
    orgAvatar: cvFile().nullable().optional()
  }),
  preferencesStep = s.orgProfile.pick({ notifications: true, theme: true })

export { appearanceStep, invite, joinRequest, orgStep, orgTeam, preferencesStep, profileStep, project, wiki }
