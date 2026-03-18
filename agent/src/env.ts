// biome-ignore-all lint/style/noProcessEnv: env module

const env = {
  NEXT_PUBLIC_CONVEX_TEST_MODE: process.env.NEXT_PUBLIC_CONVEX_TEST_MODE ?? '',
  NEXT_PUBLIC_CONVEX_URL: process.env.NEXT_PUBLIC_CONVEX_URL ?? 'http://127.0.0.1:3212'
}

export default env
