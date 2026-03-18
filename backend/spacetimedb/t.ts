import { child, cvFile, cvFiles, schema } from '@noboil/spacetimedb/schema'
import { array, boolean, number, object, string, union, enum as zenum } from 'zod/v4'

const file = cvFile(),
  files = cvFiles(),
  messagePart = union([
    object({ text: string(), type: zenum(['text']) }),
    object({ image: file, type: zenum(['image']) }),
    object({ file, name: string(), type: zenum(['file']) })
  ]),
  profileShape = {
    avatar: file.nullable().optional(),
    bio: string().max(500).optional(),
    displayName: string().trim().min(1),
    notifications: boolean(),
    theme: zenum(['light', 'dark', 'system'])
  },
  s = schema({
    base: {
      movie: object({
        backdropPath: string().optional(),
        budget: number().optional(),
        genres: array(object({ id: number(), name: string() })),
        originalTitle: string(),
        overview: string(),
        posterPath: string().optional(),
        releaseDate: string(),
        revenue: number().optional(),
        runtime: number().optional(),
        tagline: string().optional(),
        title: string(),
        tmdbId: number(),
        voteAverage: number(),
        voteCount: number()
      })
    },
    children: {
      message: child(
        'chat',
        object({
          parts: array(messagePart),
          role: zenum(['user', 'assistant', 'system'])
        })
      )
    },
    org: {
      team: object({
        avatarId: file.optional(),
        name: string(),
        slug: string().regex(/^[a-z0-9-]+$/u)
      })
    },
    orgScoped: {
      project: object({
        description: string().optional(),
        name: string().min(1),
        status: zenum(['active', 'archived', 'completed']).optional()
      }),
      task: object({
        completed: boolean().optional(),
        priority: zenum(['low', 'medium', 'high']).optional(),
        title: string().min(1)
      }),
      wiki: object({
        content: string().optional(),
        slug: string()
          .min(1)
          .regex(/^[a-z0-9-]+$/u),
        status: zenum(['draft', 'published']),
        title: string().min(1)
      })
    },
    owned: {
      blog: object({
        attachments: files.max(5).optional(),
        category: zenum(['tech', 'life', 'tutorial'], { error: 'Select a category' }),
        content: string().min(3, 'At least 3 characters'),
        coverImage: file.nullable().optional(),
        published: boolean(),
        tags: array(string()).max(5, 'Max 5 tags').optional(),
        title: string().min(1, 'Required')
      }),
      chat: object({
        isPublic: boolean(),
        title: string().min(1)
      })
    },
    singleton: {
      blogProfile: object(profileShape),
      orgProfile: object(profileShape)
    }
  })

export { messagePart, profileShape, s }
