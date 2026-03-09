/** biome-ignore-all lint/style/noProcessEnv: env detection */
/** Returns true when running in convex-test mode (CONVEX_TEST_MODE=true). */
const isTestMode = () => process.env.CONVEX_TEST_MODE === 'true'

export { isTestMode }
