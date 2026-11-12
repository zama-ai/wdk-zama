// Fails when a production dependency of a published package has a license that
// .github/license-policy.json does not allow. The allow list matches zama-ai/sdk.
// Needs installed node_modules (run `npm ci` first).
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const PUBLISHED = ['@zama-fhe/wdk-wallet-evm-zama', '@zama-fhe/wdk-protocol-swidge-zama']

const policy = JSON.parse(readFileSync(new URL('../.github/license-policy.json', import.meta.url), 'utf8'))
const allowed = new Set(policy.allow)

const selector = `.workspace:is(${PUBLISHED.map((name) => `[name="${name}"]`).join(',')}) .prod`
const deps = JSON.parse(execFileSync('npm', ['query', selector], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }))

// SPDX expressions: "A OR B" passes if one side is allowed, "A AND B" only if both are.
function isAllowed (expression) {
  const spdx = expression.replace(/[()]/g, '').trim()
  if (spdx.includes(' OR ')) return spdx.split(' OR ').some(isAllowed)
  if (spdx.includes(' AND ')) return spdx.split(' AND ').every(isAllowed)
  return allowed.has(spdx)
}

function licenseOf (pkg) {
  if (typeof pkg.license === 'string') return pkg.license
  if (pkg.license?.type) return pkg.license.type
  if (Array.isArray(pkg.licenses)) return pkg.licenses.map((l) => l.type ?? l).join(' OR ')
  return 'UNKNOWN'
}

const violations = []
for (const pkg of deps) {
  if (PUBLISHED.includes(pkg.name)) continue
  const license = licenseOf(pkg)
  if (isAllowed(license)) continue
  if (policy.exceptions?.[pkg.name]) {
    console.log(`exception: ${pkg.name}@${pkg.version} (${license}): ${policy.exceptions[pkg.name]}`)
    continue
  }
  violations.push(`${pkg.name}@${pkg.version}: ${license} (${pkg.location})`)
}

if (violations.length > 0) {
  console.error(`${violations.length} production dependencies have a license that is not allowed:`)
  for (const v of violations) console.error(`  ${v}`)
  console.error('Replace the dependency, or add a reviewed exception to .github/license-policy.json.')
  process.exit(1)
}
console.log(`License check passed: ${deps.length} production dependencies.`)
