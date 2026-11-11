# Security Policy

## Reporting a Vulnerability

If you find a security vulnerability in this project, please report it privately. Give us time to analyze it and release a fix before you disclose it.

**Do not open a public GitHub issue.** Use one of these private channels:

- **Preferred:** open a draft [GitHub Security Advisory](https://github.com/zama-ai/wdk-zama/security/advisories/new).
- **Alternate:** email <security@zama.ai>.

Please include:

- A description of the vulnerability
- Steps to reproduce it
- The potential impact
- A suggested fix, if you have one

## Response Timeline

We aim to acknowledge reports within **48 hours** and provide an initial assessment within **5 business days**.

## Scope

In scope:

- The `@zama-fhe/wdk-wallet-evm-zama` and `@zama-fhe/wdk-protocol-swidge-zama` packages in this repository.

Out of scope:

- The demo app in `apps/wallet-demo`. It is a Sepolia testnet example, not production software.
- Vulnerabilities in the Zama SDK (`@zama-fhe/sdk`). See the [Zama SDK security policy](https://github.com/zama-ai/sdk/security/policy).
- Vulnerabilities in the Zama Protocol contracts. See the [fhEVM security policy](https://github.com/zama-ai/fhevm/security/policy).
- Vulnerabilities in the Tether WDK (`@tetherto/*`) or other third-party dependencies. Please report those to the upstream projects.

## Bug Bounty

Eligible vulnerabilities may qualify for Zama's bug bounty program. See <https://www.zama.org/security> for the scope, rewards and submission process.

## Recognition

We credit reporters in our security advisories, unless they ask us not to.
