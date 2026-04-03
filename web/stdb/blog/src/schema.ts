import { s } from '@a/be-spacetimedb/t'
const createBlog = s.blog.omit({ published: true })
const editBlog = s.blog.partial()
const profileSchema = s.blogProfile
export { createBlog, editBlog, profileSchema }
