'use client'

import type { OrgRole } from '@noboil/spacetimedb'
import type { OrgDoc } from '@noboil/spacetimedb/react'
import type { ReactNode } from 'react'

import { OrgProvider } from '@noboil/spacetimedb/react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { useOrg } from '~/hook/use-org'

import OrgSwitcher from './org-switcher'

const OrgNav = () => {
    const { isAdmin } = useOrg(),
      pathname = usePathname(),
      links = [
        { href: '/dashboard', label: 'Dashboard' },
        { href: '/projects', label: 'Projects' },
        { href: '/wiki', label: 'Wiki' },
        { href: '/members', label: 'Members' },
        ...(isAdmin ? [{ href: '/settings', label: 'Settings' }] : [])
      ]

    return (
      <nav className='flex items-center gap-4 border-b px-4 py-2'>
        <OrgSwitcher />
        <div className='flex gap-2'>
          {links.map(link => (
            <Link
              className={`rounded-sm px-3 py-1.5 text-sm ${pathname === link.href ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
              href={link.href}
              key={link.href}>
              {link.label}
            </Link>
          ))}
        </div>
      </nav>
    )
  },
  OrgLayoutClient = ({
    children,
    membership,
    org,
    orgs,
    role
  }: {
    children: ReactNode
    membership: null
    org: OrgDoc & { name: string }
    orgs?: { org: OrgDoc & { name: string }; role: OrgRole }[]
    role: OrgRole
  }) => (
    <OrgProvider membership={membership} org={org} orgs={orgs} role={role}>
      <OrgNav />
      <main className='p-4'>{children}</main>
    </OrgProvider>
  )

export default OrgLayoutClient
