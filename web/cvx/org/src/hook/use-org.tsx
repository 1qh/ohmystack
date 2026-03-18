'use client'

import { api } from '@a/be-convex'
import { createOrgHooks } from '@noboil/convex/react'

export const { useActiveOrg, useMyOrgs, useOrg } = createOrgHooks(api.org)
