/** biome-ignore-all lint/style/noProcessEnv: test helper */
/* eslint-disable no-await-in-loop */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";

const TOKEN_FILE = join(import.meta.dirname, ".stdb-test-token.json"),
	DEFAULT_HTTP_URL =
		process.env.SPACETIMEDB_URI?.replace("ws://", "http://").replace(
			"wss://",
			"https://",
		) ?? "http://localhost:3000",
	DEFAULT_MODULE = process.env.SPACETIMEDB_MODULE_NAME ?? "noboil",
	readTokenData = (): null | { identity: string; token: string } => {
		try {
			return JSON.parse(readFileSync(TOKEN_FILE, "utf8")) as {
				identity: string;
				token: string;
			};
		} catch {
			return null;
		}
	},
	ensureToken = async (): Promise<{ identity: string; token: string }> => {
		const existing = readTokenData();
		if (existing) return existing;
		const response = await fetch(`${DEFAULT_HTTP_URL}/v1/identity`, {
				method: "POST",
			}),
			data = (await response.json()) as { identity: string; token: string };
		writeFileSync(TOKEN_FILE, JSON.stringify(data));
		return data;
	},
	login = async (page?: Page): Promise<void> => {
		if (!page) return;
		const data = await ensureToken();
		await page.context().addCookies([
			{
				domain: "localhost",
				name: "spacetimedb_token",
				path: "/",
				value: encodeURIComponent(data.token),
			},
		]);
		await page.addInitScript(
			({ t }) => {
				window.localStorage.setItem("spacetimedb.token", t);
			},
			{ t: data.token },
		);
	},
	cleanupTestData = async () => {
		const data = await ensureToken(),
			tables = ["blog", "blog_profile"];
		for (const table of tables) {
			const response = await fetch(
				`${DEFAULT_HTTP_URL}/v1/database/${DEFAULT_MODULE}/sql`,
				{
					body: `SELECT * FROM ${table}`,
					headers: {
						Authorization: `Bearer ${data.token}`,
						"Content-Type": "text/plain",
					},
					method: "POST",
				},
			);
			if (!response.ok) continue;
			const results = (await response.json()) as {
				rows?: unknown[];
				schema?: { elements?: { name?: { some?: string } }[] };
			}[];
			if (!Array.isArray(results) || results.length === 0) continue;
			const rows = results[0]?.rows ?? [],
				elements = results[0]?.schema?.elements ?? [],
				idIdx = elements.findIndex((e) => e.name?.some === "id");
			if (idIdx === -1) continue;
			for (const row of rows) {
				if (!Array.isArray(row)) continue;
				const id = row[idIdx];
				if (typeof id !== "number") continue;
				try {
					await fetch(
						`${DEFAULT_HTTP_URL}/v1/database/${DEFAULT_MODULE}/call/rm_${table.replace("_profile", "Profile")}`,
						{
							body: JSON.stringify([id]),
							headers: {
								Authorization: `Bearer ${data.token}`,
								"Content-Type": "application/json",
							},
							method: "POST",
						},
					);
				} catch {
					/* Ignore */
				}
			}
		}
	};

export { cleanupTestData, login };
