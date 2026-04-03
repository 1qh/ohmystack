/* eslint-disable @typescript-eslint/require-await */
import { httpRouter } from 'convex/server'
import env from '../env'
import { api } from './_generated/api'
import { httpAction } from './_generated/server'
import { auth } from './auth'
const http = httpRouter()
auth.addHttpRoutes(http)
const getAllowedOrigin = (request?: Request) => {
  const siteUrl = env.SITE_URL
  const allowed = siteUrl ? [siteUrl] : []
  const origin = request?.headers.get('Origin') ?? ''
  if (allowed.length === 0 || allowed.includes(origin)) return origin
  return allowed[0] ?? ''
}
const makeCorsHeaders = (request?: Request) => ({
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Origin': getAllowedOrigin(request)
})
http.route({
  handler: httpAction(async (_ctx, request) => new Response(null, { headers: makeCorsHeaders(request), status: 204 })),
  method: 'OPTIONS',
  path: '/api/auth/signin'
})
http.route({
  handler: httpAction(async (ctx, request) => {
    const body = (await request.json()) as {
      params?: Record<string, string>
      provider?: string
      verifier?: string
    }
    const result = await ctx.runAction(api.auth.signIn, {
      params: body.params,
      provider: body.provider,
      verifier: body.verifier
    })
    if (result.redirect)
      return Response.json(
        { redirect: result.redirect, verifier: result.verifier },
        {
          headers: { 'Content-Type': 'application/json', ...makeCorsHeaders(request) },
          status: 200
        }
      )
    if (result.tokens?.token)
      return Response.json(
        { token: result.tokens.token },
        {
          headers: { 'Content-Type': 'application/json', ...makeCorsHeaders(request) },
          status: 200
        }
      )
    return Response.json(
      { error: 'Authentication failed' },
      {
        headers: { 'Content-Type': 'application/json', ...makeCorsHeaders(request) },
        status: 401
      }
    )
  }),
  method: 'POST',
  path: '/api/auth/signin'
})
export default http
