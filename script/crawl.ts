/* eslint-disable @typescript-eslint/no-non-null-assertion, @typescript-eslint/no-unnecessary-condition, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/strict-void-return, no-console, no-continue */
/** biome-ignore-all lint/nursery/noContinue: crawler */
/** biome-ignore-all lint/nursery/noPlaywrightElementHandle: crawler */
/** biome-ignore-all lint/nursery/noPlaywrightEval: crawler */
/** biome-ignore-all lint/nursery/noPlaywrightWaitForTimeout: crawler */
/** biome-ignore-all lint/nursery/noShadow: crawler */
/** biome-ignore-all lint/nursery/useGlobalThis: crawler */
/** biome-ignore-all lint/performance/noAwaitInLoops: crawler */
/** biome-ignore-all lint/performance/useTopLevelRegex: crawler */
/** biome-ignore-all lint/style/noNonNullAssertion: crawler */
/** biome-ignore-all lint/style/useExplicitLengthCheck: crawler */
/** biome-ignore-all lint/suspicious/noControlCharactersInRegex: crawler */
/** biome-ignore-all lint/suspicious/noEmptyBlockStatements: crawler */
/* oxlint-disable no-empty, eslint-plugin-unicorn(no-process-exit) */
/* eslint-disable @typescript-eslint/max-params, @typescript-eslint/no-shadow, complexity, no-await-in-loop, no-control-regex, no-empty, no-promise-executor-return, no-useless-assignment */
/** biome-ignore-all lint/complexity/noExcessiveCognitiveComplexity: crawler */
/** biome-ignore-all lint/correctness/noUnusedVariables: crawler */
/* oxlint-disable unicorn/consistent-function-scoping */
/* oxlint-disable eslint(max-params), eslint(no-await-in-loop), eslint(no-control-regex), eslint(no-promise-executor-return), eslint(no-shadow), eslint(no-useless-assignment), eslint-plugin-promise(always-return), eslint-plugin-promise(param-names), eslint-plugin-promise(prefer-await-to-then), eslint-plugin-unicorn(no-process-exit), typescript-eslint(no-non-null-assertion) */
import type { Browser, BrowserContext, Page } from 'playwright'
import { appPort, urls } from '@a/config'
import { join } from 'node:path'
import { chromium } from 'playwright'
interface AppSpec {
  authedRoutes?: string[]
  devLog?: string
  kind?: 'cvx' | 'stdb'
  name: string
  port: number
  seedRoutes?: string[]
}
const logFor = (name: string) => join(import.meta.dirname, '..', '.cache/dev-logs', `${name}.log`)
const appMeta = (
  name: string,
  kind: 'cvx' | 'stdb' | undefined,
  seedRoutes: string[],
  authedRoutes?: string[]
): AppSpec => ({
  authedRoutes,
  devLog: logFor(name),
  kind,
  name,
  port: appPort(name),
  seedRoutes
})
interface Issue {
  kind: string
  msg: string
  route: string
}
interface Result {
  app: string
  issues: Issue[]
  port: number
  routes: string[]
}
const APPS: AppSpec[] = [
  appMeta('cvx-blog', 'cvx', ['/login', '/login/email'], ['/', '/profile', '/pagination', '/dev']),
  appMeta('cvx-chat', 'cvx', ['/login/email'], ['/']),
  appMeta('cvx-movie', 'cvx', ['/', '/fetch']),
  appMeta(
    'cvx-org',
    'cvx',
    ['/login', '/login/email'],
    ['/', '/onboarding', '/new', '/dashboard', '/members', '/projects', '/projects/new', '/wiki', '/wiki/new', '/settings']
  ),
  appMeta('stdb-blog', 'stdb', ['/', '/profile']),
  appMeta('stdb-chat', 'stdb', ['/login/email']),
  appMeta('stdb-movie', 'stdb', ['/', '/fetch']),
  appMeta('stdb-org', 'stdb', ['/login/email']),
  appMeta('doc', undefined, ['/'])
]
const argv = process.argv.slice(2)
const flag = (k: string) => {
  const i = argv.indexOf(k)
  return i === -1 ? undefined : argv[i + 1]
}
const onlyApps = flag('--apps')?.split(',')
const maxRoutes = Number(flag('--max') ?? '20')
const navTimeout = Number(flag('--timeout') ?? '8000')
const clickButtons = flag('--no-click') === undefined
const jsonOut = argv.includes('--json')
const headed = argv.includes('--headed')
const skipAuth = argv.includes('--no-auth')
const doForms = argv.includes('--forms')
const doDeep = argv.includes('--deep')
const doShots = argv.includes('--shots')
const doA11y = argv.includes('--a11y')
const SHOT_DIR = '/tmp/crawl-shots'
const TEST_EMAIL = `crawl${Date.now()}@test.com`
const TEST_PASSWORD = 'CrawlTest1234!'
const stripAnsi = (s: string) => s.replaceAll(/\u001B\[[0-9;]*[A-Za-z]/gu, '')
const IGNORED_PATTERNS = [
  /Failed to execute 'measure' on 'Performance'.*negative time stamp/u,
  /The above error occurred in the <\w+> component\. It was handled by the <SharedErrorBoundary>/u,
  /Encountered a script tag while rendering React component/u,
  /net::ERR_ABORTED/u,
  /^(?:\[x\d+\] )?(?:⨯ )?(?:uncaughtException: )?Error: aborted$/u,
  /^Warning: Each child in a list/u,
  /favicon\.ico/u,
  /Form submission canceled because the form is not connected/u,
  /Invalid password|validateDefaultPasswordRequirements/u,
  /EADDRINUSE: address already in use/u,
  /Failed to start server/u
]
const isIgnored = (msg: string) => IGNORED_PATTERNS.some(r => r.test(msg))
const trim = (s: string, n = 600) => stripAnsi(s).replaceAll(/\s+/gu, ' ').trim().slice(0, n)
const normUrl = (raw: string, port: number): null | string => {
  try {
    const u = new URL(raw, `http://localhost:${port}`)
    if (u.host !== `localhost:${port}` && u.host !== `127.0.0.1:${port}`) return null
    if (u.pathname.startsWith('/api') || u.pathname.startsWith('/_next')) return null
    return u.pathname + u.search
  } catch {
    return null
  }
}
const attachListeners = (page: Page, route: string, push: (i: Issue) => void, pendingArgs: Promise<unknown>[]) => {
  const safePush = (i: Issue) => {
    if (!isIgnored(i.msg)) push(i)
  }
  page.on('pageerror', e => safePush({ kind: 'pageerror', msg: trim(e.message), route }))
  page.on('console', m => {
    const t = m.type()
    if (t !== 'error' && t !== 'warning') return
    const text = m.text()
    safePush({ kind: t === 'warning' ? 'warn' : 'console', msg: trim(text), route })
    if (text.includes('%o') || text.includes('%s')) {
      const pending = Promise.all(m.args().map(async a => a.jsonValue().catch(() => null)))
        .then(vals => {
          const flat = vals.map(v => (typeof v === 'string' ? v : JSON.stringify(v ?? ''))).join(' ')
          if (flat && flat !== text && !isIgnored(flat)) safePush({ kind: 'full', msg: trim(flat, 800), route })
        })
        .catch(() => null)
      pendingArgs.push(pending)
    }
  })
  page.on('requestfailed', r => {
    const f = r.failure()
    if (f && !r.url().includes('_next/static') && !r.url().includes('favicon'))
      safePush({ kind: 'reqfail', msg: trim(`${r.method()} ${r.url()} ${f.errorText}`), route })
  })
  page.on('response', r => {
    const s = r.status()
    if (s >= 400 && !r.url().includes('_next/static') && !r.url().includes('favicon'))
      safePush({ kind: `http${s}`, msg: r.url(), route })
  })
  page.on('websocket', ws => {
    if (!ws.url().includes('webpack-hmr')) return
    try {
      ws.on('framereceived', f => {
        try {
          const raw = typeof f.payload === 'string' ? f.payload : ''
          if (!raw?.startsWith('{')) return
          const j = JSON.parse(raw) as { action?: string; type?: string }
          if (j.action === 'serverError' || j.type === 'issues')
            safePush({ kind: 'hmr', msg: trim(JSON.stringify(j)), route })
        } catch {}
      })
    } catch {}
  })
}
const pollOverlay = async (page: Page, route: string, push: (i: Issue) => void) => {
  const overlay = await page.evaluate(() => {
    const p = document.querySelector('nextjs-portal')
    if (!p?.shadowRoot) return null
    const root = p.shadowRoot
    const badge = root.querySelector('[data-next-badge]')
    const errCount = Number(badge.dataset.issuesCount ?? '0')
    if (errCount <= 0) return null
    const title = root
      .querySelector('[data-nextjs-dialog-header] h1, [data-nextjs-error-overlay-title]')
      ?.textContent?.trim()
    const desc = root
      .querySelector('[data-nextjs-dialog-body] p, [data-nextjs-error-overlay-description]')
      ?.textContent?.trim()
    const code = root.querySelector('[data-nextjs-codeframe]')?.textContent?.trim().split('\n').slice(0, 3).join(' ')
    const parts: string[] = [`[${errCount} issue(s)]`]
    if (title) parts.push(title)
    if (desc) parts.push(desc)
    if (code) parts.push(`@ ${code}`)
    return parts.join(' ')
  })
  if (overlay) push({ kind: 'overlay', msg: trim(overlay, 400), route })
}
const cvxCreateOrgViaApi = async (ctx: BrowserContext, app: AppSpec, issues: Issue[]): Promise<boolean> => {
  const cookies = await ctx.cookies()
  const jwt = cookies.find(c => c.name === '__convexAuthJWT')?.value
  if (!jwt) return false
  const hdrs = { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' }
  try {
    await fetch(`${urls().convexApi}/api/mutation`, {
      body: JSON.stringify({
        args: { displayName: 'Crawl User', notifications: false, theme: 'system' },
        format: 'json',
        path: 'orgProfile:upsert'
      }),
      headers: hdrs,
      method: 'POST'
    })
    const slug = `crawl-${Math.random().toString(36).slice(2, 8)}`
    const createRes = await fetch(`${urls().convexApi}/api/mutation`, {
      body: JSON.stringify({
        args: { data: { name: 'Crawl Org', slug } },
        format: 'json',
        path: 'org:create'
      }),
      headers: hdrs,
      method: 'POST'
    })
    const body = (await createRes.json()) as { status: string; value?: { orgId: string } }
    if (body.status !== 'success' || !body.value?.orgId) {
      issues.push({ kind: 'auth', msg: `org create failed: ${JSON.stringify(body)}`, route: '/onboarding' })
      return false
    }
    await ctx.addCookies([
      { domain: 'localhost', name: 'activeOrgId', path: '/', value: body.value.orgId },
      { domain: 'localhost', name: 'activeOrgSlug', path: '/', value: slug }
    ])
    const projRes = await fetch(`${urls().convexApi}/api/mutation`, {
      body: JSON.stringify({
        args: { name: 'Crawl Project', orgId: body.value.orgId, status: 'active' },
        format: 'json',
        path: 'project:create'
      }),
      headers: hdrs,
      method: 'POST'
    })
    const projVal = (await projRes.json()) as { status: string; value?: string | { id: string } }
    const projId = typeof projVal.value === 'string' ? projVal.value : projVal.value?.id
    if (projVal.status === 'success' && projId)
      (app.authedRoutes ?? []).push(`/projects/${projId}`, `/projects/${projId}/edit`)
    else
      issues.push({
        kind: 'auth',
        msg: `project create: ${JSON.stringify(projVal).slice(0, 120)}`,
        route: '/projects/new'
      })
    const wikiRes = await fetch(`${urls().convexApi}/api/mutation`, {
      body: JSON.stringify({
        args: { content: 'crawl', orgId: body.value.orgId, slug: 'crawl-page', status: 'draft', title: 'Crawl Wiki' },
        format: 'json',
        path: 'wiki:create'
      }),
      headers: hdrs,
      method: 'POST'
    })
    const wikiVal = (await wikiRes.json()) as { status: string; value?: string | { id: string } }
    const wikiId = typeof wikiVal.value === 'string' ? wikiVal.value : wikiVal.value?.id
    if (wikiVal.status === 'success' && wikiId) (app.authedRoutes ?? []).push(`/wiki/${wikiId}`, `/wiki/${wikiId}/edit`)
    else issues.push({ kind: 'auth', msg: `wiki create: ${JSON.stringify(wikiVal).slice(0, 120)}`, route: '/wiki/new' })
    return true
  } catch (error) {
    issues.push({
      kind: 'auth',
      msg: `org create error: ${(error as Error).message.split('\n')[0]}`,
      route: '/onboarding'
    })
    return false
  }
}
const cvxSignUp = async (ctx: BrowserContext, port: number, issues: Issue[]): Promise<boolean> => {
  const page = await ctx.newPage()
  try {
    await page.goto(`http://localhost:${port}/login/email`, { timeout: 15_000, waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1000)
    const toggle = page.locator('button[type="button"]', { hasText: /sign up|create account/iu }).first()
    if (await toggle.count()) await toggle.click().catch(() => null)
    await page.waitForTimeout(500)
    await page.locator('input[name="email"]').fill(TEST_EMAIL)
    await page.locator('input[name="password"]').fill(TEST_PASSWORD)
    const errors: string[] = []
    page.on('console', m => {
      if (m.type() === 'error') errors.push(m.text().slice(0, 150))
    })
    await page.locator('button[type="submit"]').first().click({ timeout: 5000 })
    await page.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 20_000 }).catch(() => null)
    const ok = !page.url().includes('/login')
    if (!ok)
      issues.push({
        kind: 'auth',
        msg: `signup did not redirect, final: ${page.url()}, errors: ${errors.slice(0, 2).join(' | ')}`,
        route: '/login/email'
      })
    await page.close().catch(() => null)
    return ok
  } catch (error) {
    issues.push({ kind: 'auth', msg: `signup error: ${(error as Error).message.split('\n')[0]}`, route: '/login/email' })
    await page.close().catch(() => null)
    return false
  }
}
const fillForm = async (page: Page, route: string, push: (i: Issue) => void) => {
  if (!doForms) return
  if (route.includes('/login') || route.includes('/fetch') || route === '/' || route === '/public') return
  const forms = await page.locator('form').all()
  if (forms.length === 0) return
  try {
    for (const form of forms.slice(0, 1)) {
      const inputs = await form
        .locator(
          'input:visible:not([type="hidden"]):not([type="submit"]):not([type="file"]):not([type="search"]), textarea:visible'
        )
        .all()
      for (const input of inputs.slice(0, 5)) {
        const type = (await input.getAttribute('type').catch(() => null)) ?? 'text'
        const name = (await input.getAttribute('name').catch(() => null)) ?? ''
        let val = `crawl-${Math.random().toString(36).slice(2, 8)}`
        if (type === 'email' || name === 'email') val = TEST_EMAIL
        else if (type === 'password' || name === 'password') val = TEST_PASSWORD
        else if (type === 'number') val = '42'
        else if (type === 'url') val = 'https://example.test'
        await input.fill(val, { timeout: 1500 }).catch(() => null)
      }
      const submit = form.locator('button[type="submit"]').first()
      if (await submit.count()) {
        await submit.click({ timeout: 2000 }).catch(() => null)
        await page.waitForTimeout(1500)
        await pollOverlay(page, `${route} (form-submit)`, push)
      }
    }
  } catch (error) {
    push({ kind: 'form', msg: `fill error: ${(error as Error).message.split('\n')[0]}`, route })
  }
}
const ORIG_AUTHED = new Map(APPS.map(a => [a.name, [...(a.authedRoutes ?? [])]]))
let sharedBrowser: Browser | null = null
const getBrowser = async (): Promise<Browser> => {
  if (sharedBrowser?.isConnected()) return sharedBrowser
  sharedBrowser = await chromium.launch({ args: ['--disable-dev-shm-usage'], headless: !headed })
  return sharedBrowser
}
const waitHealthy = async (port: number): Promise<boolean> => {
  for (let i = 0; i < 10; i += 1) {
    const ok = await fetch(`http://localhost:${port}/`, { signal: AbortSignal.timeout(3000) })
      .then(r => r.status < 500)
      .catch(() => false)
    if (ok) return true
    await new Promise(r => setTimeout(r, 1500))
  }
  return false
}
const crawlApp = async (app: AppSpec): Promise<Result> => {
  if (app.authedRoutes && ORIG_AUTHED.has(app.name)) app.authedRoutes = [...(ORIG_AUTHED.get(app.name) ?? [])]
  const healthOk = await waitHealthy(app.port)
  if (!healthOk)
    return {
      app: app.name,
      issues: [{ kind: 'app-down', msg: `app at :${app.port} not responding`, route: '?' }],
      port: app.port,
      routes: []
    }
  const browser = await getBrowser()
  const ctx: BrowserContext = await browser.newContext()
  const captured: string[] = []
  await ctx.exposeFunction('__crawlReport', (msg: string) => {
    captured.push(msg)
  })
  await ctx.addInitScript(() => {
    const orig = console.error
    console.error = (...args) => {
      try {
        const flat = args
          .map(a => {
            if (typeof a === 'string') return a
            try {
              return JSON.stringify(a).slice(0, 800)
            } catch {
              return String(a)
            }
          })
          .join(' ')
        const w = window as Window & { __crawlReport?: (s: string) => void }
        w.__crawlReport?.(flat)
      } catch {}
      return orig.apply(console, args)
    }
  })
  const issues: Issue[] = []
  const seen = new Set<string>()
  const queue: string[] = [...(app.seedRoutes ?? ['/'])]
  let authed = false
  if (!skipAuth && app.kind === 'cvx' && app.authedRoutes?.length) {
    authed = await cvxSignUp(ctx, app.port, issues)
    if (authed && app.name === 'cvx-org') await cvxCreateOrgViaApi(ctx, app, issues)
    if (authed) queue.push(...app.authedRoutes)
  }
  const processRoute = async (route: string) => {
    const page = await ctx.newPage().catch(() => null)
    if (!page) {
      issues.push({ kind: 'crash', msg: `context closed before route ${route}`, route })
      return false
    }
    const pendingArgs: Promise<unknown>[] = []
    attachListeners(page, route, i => issues.push(i), pendingArgs)
    try {
      await page
        .goto(`http://localhost:${app.port}${route}`, { timeout: navTimeout, waitUntil: 'commit' })
        .catch(() => null)
      await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => null)
      await page.waitForTimeout(1500)
      await pollOverlay(page, route, i => issues.push(i))
      if (doShots) {
        const slug = `${app.name}${route.replaceAll(/[^\w]+/gu, '_')}`.slice(0, 80)
        await page.screenshot({ fullPage: true, path: `${SHOT_DIR}/${slug}.png` }).catch(() => null)
      }
      await fillForm(page, route, i => issues.push(i))
      const links = await page.$$eval('a[href]', as => as.map(a => a.getAttribute('href') ?? ''))
      for (const l of links) {
        const n = normUrl(l, app.port)
        if (n && !seen.has(n) && !queue.includes(n)) queue.push(n)
      }
      if (doDeep && !route.includes('/login'))
        await page
          .evaluate(async () => {
            const sleep = async (ms: number) => new Promise(r => setTimeout(r, ms))
            const vis = (el: Element) => {
              const r = el.getBoundingClientRect()
              return r.width > 0 && r.height > 0 && !el.closest('nextjs-portal') && !el.closest('form')
            }
            const fire = async (sel: string, act: (el: Element) => void, w = 120) => {
              const els = [...document.querySelectorAll(sel)].filter(vis)
              for (const el of els.slice(0, 15))
                try {
                  act(el)
                  await sleep(w)
                } catch {}
            }
            await fire('[role="switch"]', el => (el as HTMLElement).click())
            await fire('[role="combobox"]', el => (el as HTMLElement).click(), 200)
            await fire('[role="option"]:not([aria-disabled="true"])', el => (el as HTMLElement).click(), 150)
            await fire('[role="checkbox"]', el => (el as HTMLElement).click())
            await fire('[role="radio"]', el => (el as HTMLElement).click())
            await fire('[role="tab"]', el => (el as HTMLElement).click())
            await fire('[role="menuitem"]', el => (el as HTMLElement).click())
            await fire('[role="menuitemcheckbox"]', el => (el as HTMLElement).click())
            await fire('summary', el => (el as HTMLElement).click())
            await fire('details', el => {
              ;(el as HTMLDetailsElement).open = !(el as HTMLDetailsElement).open
            })
            await fire(
              '[role="slider"]',
              el => {
                ;(el as HTMLElement).focus()
                el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowRight' }))
              },
              80
            )
            for (const el of [...document.querySelectorAll('button, a, [role="button"]')].slice(0, 10)) {
              if (!vis(el)) continue
              try {
                el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
                await sleep(50)
                el.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }))
              } catch {}
            }
            await sleep(500)
            document.body.click()
            await sleep(200)
          })
          .catch(() => null)
      if (clickButtons && !route.includes('/login')) {
        const buttons = await page.$$eval('button:not([type="submit"]):not([data-nextjs-dialog-close-btn])', bs =>
          bs
            .filter(b => {
              if (b.closest('nextjs-portal')) return false
              const r = b.getBoundingClientRect()
              return r.width > 0 && r.height > 0
            })
            .map((b, i) => ({ i, txt: (b.textContent ?? '').slice(0, 30) }))
        )
        for (const { i } of buttons.slice(0, 6)) {
          const handle = await page.$(`button:not([type="submit"]) >> nth=${i}`).catch(() => null)
          if (!handle) continue
          await handle
            .click({ timeout: 1500 })
            .then(async () => {
              await page.waitForTimeout(300)
              await pollOverlay(page, `${route} (btn${i})`, x => issues.push(x))
            })
            .catch(() => null)
        }
      }
      await Promise.race([Promise.all(pendingArgs).catch(() => null), new Promise(r => setTimeout(r, 3000))])
      if (doA11y)
        try {
          const axeSrc = await import('node:fs').then(m =>
            m.readFileSync('/Users/o/z/noboil/node_modules/axe-core/axe.min.js', 'utf8')
          )
          await page.evaluate(axeSrc)
          const violations = await page
            .evaluate(async () => {
              const win = window as Window & {
                axe?: {
                  run: (
                    ctx: Document,
                    opts: Record<string, unknown>
                  ) => Promise<{ violations: { id: string; impact: string; nodes: { target: string[] }[] }[] }>
                }
              }
              if (!win.axe) return []
              const r = await win.axe.run(document, {
                resultTypes: ['violations'],
                runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] }
              })
              return r.violations
                .filter(v => v.impact === 'critical' || v.impact === 'serious')
                .map(v => ({
                  id: v.id,
                  impact: v.impact,
                  sample: v.nodes
                    .slice(0, 2)
                    .map(n => n.target.join(' '))
                    .join(' | ')
                    .slice(0, 150)
                }))
            })
            .catch(() => [])
          for (const v of violations) issues.push({ kind: `a11y-${v.impact}`, msg: `${v.id}: ${v.sample}`, route })
        } catch {}
    } catch (error) {
      issues.push({ kind: 'goto', msg: trim((error as Error).message), route })
    }
    await page.close().catch(() => null)
    return true
  }
  while (queue.length > 0 && seen.size < maxRoutes) {
    const route = queue.shift()!
    if (seen.has(route)) continue
    seen.add(route)
    const ok = await Promise.race([processRoute(route), new Promise<boolean>(r => setTimeout(() => r(false), 20_000))])
    if (!ok) {
      issues.push({ kind: 'route-timeout', msg: `route ${route} exceeded 20s`, route })
      for (const p of ctx.pages()) await p.close({ runBeforeUnload: false }).catch(() => null)
    }
  }
  await Promise.race([ctx.close(), new Promise(r => setTimeout(r, 3000))]).catch(() => null)
  if (app.devLog)
    try {
      const { readFileSync, existsSync } = await import('node:fs')
      if (existsSync(app.devLog)) {
        const log = readFileSync(app.devLog, 'utf8')
        const lines = log.split('\n').filter(l => /⨯|\[browser\]|Error:|Warning:/u.test(l) && !isIgnored(l))
        const grouped = new Map<string, number>()
        for (const l of lines) {
          const key = stripAnsi(l).replaceAll(/\s+/gu, ' ').trim().slice(0, 200)
          grouped.set(key, (grouped.get(key) ?? 0) + 1)
        }
        for (const [k, n] of grouped) issues.push({ kind: 'stderr', msg: `[x${n}] ${k}`, route: '(server)' })
      }
    } catch {}
  return { app: app.name, issues, port: app.port, routes: [...seen] }
}
const printResult = ({ app, port, routes, issues }: Result) => {
  process.stdout.write(`\n=== ${app}:${port} === ${routes.length} routes, ${issues.length} issues\n`)
  process.stdout.write(`routes: ${routes.join(' ')}\n`)
  if (issues.length === 0) {
    process.stdout.write('clean\n')
    return
  }
  const grouped = new Map<string, { count: number; routes: Set<string> }>()
  for (const e of issues) {
    const key = `${e.kind} | ${e.msg.slice(0, 200)}`
    const v = grouped.get(key) ?? { count: 0, routes: new Set<string>() }
    v.count += 1
    v.routes.add(e.route)
    grouped.set(key, v)
  }
  for (const [key, { count, routes: rs }] of [...grouped.entries()].toSorted((a, b) => b[1].count - a[1].count))
    process.stdout.write(`  [x${count}] ${key}\n         on: ${[...rs].slice(0, 4).join(', ')}\n`)
}
const apps = onlyApps ? APPS.filter(a => onlyApps.includes(a.name)) : APPS
const results: Result[] = []
for (const a of apps) {
  process.stderr.write(`> crawling ${a.name}:${a.port} ...\n`)
  const r = await Promise.race([
    crawlApp(a),
    new Promise<Result>(resolve =>
      setTimeout(
        () =>
          resolve({
            app: a.name,
            issues: [{ kind: 'timeout', msg: 'app crawl exceeded 60s', route: '?' }],
            port: a.port,
            routes: []
          }),
        60_000
      )
    )
  ])
  results.push(r)
  if (!jsonOut) printResult(r)
  if (r.issues.some(i => i.kind === 'timeout' || i.kind === 'app-down')) {
    process.stderr.write(`  retrying ${a.name} after 5s...\n`)
    await new Promise(r => setTimeout(r, 5000))
    const retry = await Promise.race([crawlApp(a), new Promise<Result>(resolve => setTimeout(() => resolve(r), 60_000))])
    if (!retry.issues.some(i => i.kind === 'timeout' || i.kind === 'app-down')) {
      results[results.length - 1] = retry
      if (!jsonOut) printResult(retry)
    }
  }
  await new Promise(r => setTimeout(r, 500))
}
if (sharedBrowser !== null) {
  const b: Browser = sharedBrowser
  try {
    await Promise.race([b.close(), new Promise<void>(r => setTimeout(r, 3000))])
  } catch {}
}
if (jsonOut) process.stdout.write(JSON.stringify(results, null, 2))
const totalIssues = results.reduce((n, r) => n + r.issues.length, 0)
process.exit(totalIssues > 0 ? 1 : 0)
