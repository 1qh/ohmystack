import { owned, singleton } from '@a/be-convex/t'
const createBlog = owned.blog.omit({ published: true })
const editBlog = owned.blog.partial()
const profileSchema = singleton.blogProfile
export { createBlog, editBlog, profileSchema }
