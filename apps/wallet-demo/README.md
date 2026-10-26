# Confidential WDK wallet demo

A browser wallet built on [Tether WDK](https://docs.wdk.tether.io/) that holds **confidential USD₮ (cUSDT)** on Sepolia through the two Zama modules in this repo.

- **WDK Core** (`@tetherto/wdk`) manages the seed and accounts.
- **`@zama-fhe/wdk-wallet-evm-zama`** is registered as the `ethereum` wallet. It gives each account a decrypted cUSDT balance, confidential transfers, shield, unshield and resume of an interrupted unshield.
- **`@zama-fhe/wdk-protocol-swidge-zama`** is registered as the `confidential` swidge protocol. The Swap tab uses only the standard `quoteSwidge` / `swidge` / `getSwidgeStatus` calls.

All wallet code is in [`src/wallet.js`](src/wallet.js). The UI is in [`src/App.jsx`](src/App.jsx).

## Run

From the repo root:

```bash
npm install
npm run demo        # http://localhost:5173
```

Optional: set `VITE_SEPOLIA_RPC_URL` to use your own Sepolia RPC. The default is a public endpoint.

Then:

1. Create a wallet (or import a recovery phrase).
2. Get Sepolia ETH for gas from a faucet for the address shown.
3. Click **+ Mint 100** on the USD₮ card to mint test USD₮ from the public Sepolia mock. Then shield some of it on the **Shield** tab.
4. **Decrypt balance**: signs one decrypt permit (EIP-712) and shows your cUSDT balance.
5. **Send** a confidential transfer, for example to Account 2. Switch to Account 2 to see it arrive.
6. **Unshield** back to USD₮, or use **Swap** to do the same through the swidge interface.

## Browser setup notes

Things the [Vite config](vite.config.js) does that any browser integration needs:

- **Cross-origin isolation.** The Zama web relayer runs TFHE in a worker with `SharedArrayBuffer`, so the page must be served with `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`.
- **`@zama-fhe/sdk` is excluded from dependency pre-bundling**, so its `new URL('./encrypt.worker.js', import.meta.url)` worker resolves.
- **`@zama-fhe/sdk/node` is aliased to a stub.** The wallet module imports the Node relayer lazily; the browser always uses `relayer: 'web'`.
- **`sodium-javascript` is installed and `Buffer`/`process` are polyfilled.** WDK's EVM signer uses `sodium-universal`, which needs `sodium-javascript` in browsers.

## Demo shortcuts

This is a testnet demo, not a production wallet:

- The recovery phrase is kept in `localStorage`. A real wallet keeps it in secure storage.
- Zama SDK state (decrypt permit, transport key pair, pending unshields) is kept in IndexedDB through `IndexedDBStorage`. "Sign out" removes the phrase but not this state.
- Activity is kept per address in `localStorage` and only shows what this browser did.
