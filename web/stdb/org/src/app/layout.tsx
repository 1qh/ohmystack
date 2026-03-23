/* eslint-disable @eslint-react/dom/no-dangerously-set-innerhtml, react/no-danger, @eslint-react/hooks-extra/no-direct-set-state-in-use-effect */
// biome-ignore-all lint/security/noDangerouslySetInnerHtml: controlled redirect
// biome-ignore-all lint/nursery/useGlobalThis: browser API
// biome-ignore-all lint/style/noProcessEnv: intentional process.env access
"use client";
import { tables } from "@a/be-spacetimedb/spacetimedb";
import type { Org, OrgMember } from "@a/be-spacetimedb/spacetimedb/types";
import AuthLayout from "@a/fe/spacetimedb-auth-layout";
import SpacetimeProvider from "@a/fe/spacetimedb-provider";
import { sameIdentity } from "@a/fe/utils";
import type { OrgRole } from "@noboil/spacetimedb";
import { BetterspaceDevtools } from "@noboil/spacetimedb/react";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useSpacetimeDB, useTable } from "spacetimedb/react";
import OrgLayoutClient from "./layout-client";

const ORG_PATHS = ["/dashboard", "/members", "/projects", "/wiki", "/settings"],
	needsOrgLayout = (pathname: string) => {
		for (const p of ORG_PATHS)
			if (pathname === p || pathname.startsWith(`${p}/`)) return true;
		return false;
	},
	toOrgId = (id: number) => `${id}`,
	OrgRedirect = ({
		orgId,
		slug,
		to,
	}: {
		orgId: string;
		slug: string;
		to: string;
	}) => (
		<script
			// oxlint-disable-next-line react/no-danger, react-perf/jsx-no-new-object-as-prop
			dangerouslySetInnerHTML={{
				__html: `window.location.href="/api/set-org?orgId=${encodeURIComponent(orgId)}&slug=${encodeURIComponent(slug)}&to=${encodeURIComponent(to)}"`,
			}}
		/>
	),
	readActiveOrgId = () => {
		if (typeof document === "undefined") return null;
		const cookies = document.cookie.split("; ");
		for (const c of cookies) {
			if (c.startsWith("activeOrgId=")) return c.slice("activeOrgId=".length);
			if (c.startsWith("active_org=")) return c.slice("active_org=".length);
		}
		return null;
	},
	toLegacyOrg = (org: Org) => ({ ...org, _id: toOrgId(org.id) }),
	// eslint-disable-next-line @typescript-eslint/promise-function-async
	OrgLayoutInner = ({ children }: { children: ReactNode }) => {
		const pathname = usePathname(),
			router = useRouter(),
			{ identity } = useSpacetimeDB(),
			[orgs, orgsReady] = useTable(tables.org),
			[members, membersReady] = useTable(tables.orgMember),
			isPlaywright = process.env.NEXT_PUBLIC_PLAYWRIGHT === "1",
			activeOrgId = readActiveOrgId(),
			[playwrightWaitExpired, setPlaywrightWaitExpired] = useState(false);
		/** biome-ignore lint/correctness/useExhaustiveDependencies: retrigger on navigation */
		useEffect(() => {
			if (!isPlaywright) return;
			setPlaywrightWaitExpired(false);
			const timer = window.setTimeout(
				() => setPlaywrightWaitExpired(true),
				5000,
			);
			return () => window.clearTimeout(timer);
		}, [activeOrgId, isPlaywright, pathname]);
		if (!pathname) return children;
		if (!needsOrgLayout(pathname)) return children;
		if (!(identity || isPlaywright)) return null;
		if (!((orgsReady && membersReady) || playwrightWaitExpired)) return null;
		// oxlint-disable-next-line react-perf/jsx-no-new-array-as-prop
		const ownedOrgs = identity
				? orgs.filter((o: Org) => sameIdentity(o.userId, identity))
				: [],
			memberOrgs = identity
				? members
						.filter(
							(m: OrgMember) =>
								m.userId.toHexString() === identity.toHexString(),
						)
						.map((m: OrgMember) => {
							const org = orgs.find((o: Org) => o.id === m.orgId);
							if (!org) return null;
							const role: OrgRole = sameIdentity(org.userId, identity)
								? "owner"
								: m.isAdmin
									? "admin"
									: "member";
							return { org: toLegacyOrg(org), role };
						})
						.filter((item) => item !== null)
				: [],
			ownedItems = ownedOrgs
				.filter((o: Org) => !memberOrgs.some((m) => m.org._id === String(o.id)))
				.map((o: Org) => ({ org: toLegacyOrg(o), role: "owner" as OrgRole })),
			myOrgItems = identity
				? [...ownedItems, ...memberOrgs]
				: orgs.map((o: Org) => ({
						org: toLegacyOrg(o),
						role: "owner" as OrgRole,
					}));
		if (myOrgItems.length === 0) {
			if (isPlaywright && !playwrightWaitExpired) return null;
			router.replace("/");
			return null;
		}
		const active =
			(activeOrgId
				? myOrgItems.find((item) => item.org._id === activeOrgId)
				: null) ?? myOrgItems[0];
		if (!active) {
			router.replace("/");
			return null;
		}
		if (activeOrgId !== active.org._id)
			return (
				<OrgRedirect
					orgId={active.org._id}
					slug={active.org.slug}
					to={pathname}
				/>
			);
		return (
			<OrgLayoutClient
				membership={null}
				org={active.org}
				orgs={myOrgItems}
				role={active.role}
			>
				{children}
			</OrgLayoutClient>
		);
	},
	renderSpacetimeProvider = (inner: ReactNode): ReactNode => (
		<SpacetimeProvider fileApi>{inner}</SpacetimeProvider>
	),
	LayoutContent = ({ children }: { children: ReactNode }) => (
		<>
			<OrgLayoutInner>{children}</OrgLayoutInner>
			<BetterspaceDevtools position="bottom-right" />
		</>
	),
	Layout = ({ children }: { children: ReactNode }) => (
		<AuthLayout provider={renderSpacetimeProvider}>
			<LayoutContent>{children}</LayoutContent>
		</AuthLayout>
	);

export { OrgRedirect };
export default Layout;
