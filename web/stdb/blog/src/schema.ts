import { s } from '@a/be-spacetimedb/t'

const createBlog = s.blog.omit({ published: true }),
  editBlog = s.blog.partial(),
  profileSchema = s.blogProfile

export { createBlog, editBlog, profileSchema }
