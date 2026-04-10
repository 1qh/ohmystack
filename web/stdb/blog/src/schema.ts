import { s } from '@a/be-spacetimedb/s'
const createBlog = s.blog.omit({ published: true })
const editBlog = s.blog.partial()
const profileSchema = s.blogProfile
export { createBlog, editBlog, profileSchema }
