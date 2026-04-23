#!/usr/bin/env bun
const doctor = async () => {
  const { runDoctorTui } = await import('./doctor-tui')
  const code = await runDoctorTui()
  if (code !== 0) process.exit(code)
}
export { doctor }
