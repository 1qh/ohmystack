/** biome-ignore-all lint/style/noProcessEnv: env detection */
const isTestMode = () => process.env.CONVEX_TEST_MODE === 'true'

export { isTestMode }
