import { httpRouter } from 'convex/server'

import { api } from './_generated/api'
import { httpAction } from './_generated/server'
import { auth } from './auth'

const http = httpRouter()

auth.addHttpRoutes(http)

const corsHeaders = {
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Origin': '*'
}

http.route({
  handler: httpAction(async () => new Response(null, { headers: corsHeaders, status: 204 })),
  method: 'OPTIONS',
  path: '/api/auth/signin'
})

http.route({
  handler: httpAction(async (ctx, request) => {
    const body = (await request.json()) as { params?: Record<string, string>; provider?: string; verifier?: string },
      result = await ctx.runAction(api.auth.signIn, {
        params: body.params,
        provider: body.provider,
        verifier: body.verifier
      })
    if (result.redirect)
      return Response.json(
        { redirect: result.redirect, verifier: result.verifier },
        {
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
          status: 200
        }
      )
    if (result.tokens?.token)
      return Response.json(
        { token: result.tokens.token },
        {
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
          status: 200
        }
      )

    return Response.json(
      { error: 'Authentication failed' },
      {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
        status: 401
      }
    )
  }),
  method: 'POST',
  path: '/api/auth/signin'
})

export default http
