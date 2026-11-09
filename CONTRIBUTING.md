# Contributing

Thank you for your interest in the Zama modules for Tether WDK.

## How to contribute

There are two ways to contribute:

- [Open an issue](https://github.com/zama-ai/wdk-zama/issues/new) to report a bug or a typo, or to suggest an idea.
- Ask to become an official contributor by emailing <hello@zama.ai>.

Becoming an approved contributor involves signing our Contributor License Agreement (CLA). Only approved contributors can send pull requests, so please get in touch before you do.

To report a security vulnerability, follow [SECURITY.md](SECURITY.md). Do not open a public issue.

## Development setup

You need Node.js 22.13 or newer.

```bash
git clone https://github.com/zama-ai/wdk-zama.git
cd wdk-zama
npm install
npm run lint          # standard, all workspaces
npm test              # jest unit tests (no network)
npm run build:types   # regenerate packages/*/types from JSDoc
```

To run the Sepolia examples and integration tests, see [Development](README.md#development) in the README.

## Pull requests

- Keep each pull request focused on one change.
- Add or update unit tests for any behavior change.
- Run `npm run lint`, `npm test` and `npm run build:types` before you push. CI fails if the generated types in `packages/*/types` are out of date.
- Use [Conventional Commits](https://www.conventionalcommits.org/) for commit messages, for example `fix(wallet-evm-zama): ...`.
- Pin new dependencies to exact versions.

Every pull request needs an approval from a code owner (see [`.github/CODEOWNERS`](.github/CODEOWNERS)).

## License

By contributing, you agree that your contributions are licensed under the [BSD-3-Clause-Clear license](LICENSE).
