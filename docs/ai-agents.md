# Building with AI agents

Both modules are plain JavaScript ES modules with JSDoc types and generated `.d.ts` files, so coding assistants pick up their signatures from `node_modules`.

Pointers for an LLM-assisted integration:

- **Zama protocol and SDK:** the agent index at `https://raw.githubusercontent.com/zama-ai/sdk/main/llms.txt` lists the `@zama-fhe/sdk` documentation pages; the hosted docs live at https://docs.zama.org/protocol/sdk. The modules wrap that SDK: `WrappedToken.shield` / `unshield`, `Token.balanceOf` / `confidentialTransfer`, `sdk.permits`.
- **WDK:** https://docs.wdk.tether.io/ describes `WalletAccountEvm`, `SwidgeProtocol`, protocol registration and policies. The WDK MCP toolkit exposes the same documentation to agents that support the Model Context Protocol.
- **These modules:** the READMEs in `packages/*/README.md` and the pages in this folder.

Prompts that work well: "add a show-balance button that grants a Zama decrypt permit on click", "register `ZamaShieldProtocol` under the label `confidential` on the ethereum wallet", "handle `UnshieldPendingError` by offering a resume action".

Things to tell the agent explicitly:

- amounts are `bigint` base units, and `token` arguments are the **confidential** token address;
- never decrypt on render; gate `getConfidentialBalance` behind `hasDecryptPermit` / `grantDecryptPermit`;
- shield and unshield amounts are public; only confidential balances and transfers are encrypted;
- production apps need a persistent, secure `storage` and must not ship the relayer API key in client code.
