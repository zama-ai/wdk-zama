// Shield USDT into cUSDT, read the confidential balance, send a confidential transfer and
// unshield, on Sepolia with the mock tokens.
//
//   npm run example:wallet            (reads .env at the repo root, see .env.example)
//
// Variables: SEPOLIA_SEED or SEPOLIA_PRIVATE_KEY (the account needs Sepolia ETH; the USDT mock
// is minted on demand), optional SEPOLIA_RPC_URL, ZAMA_RELAYER_API_KEY, RECIPIENT.

import { MemoryStorage } from '@zama-fhe/sdk'
import { Interface } from 'ethers'

import WalletManagerEvmZama, { WalletAccountEvmZama, CUSDT_MOCK_SEPOLIA, USDT_MOCK_SEPOLIA } from '@zama-fhe/wdk-wallet-evm-zama'

const ONE = 1_000_000n // USDT has 6 decimals

const config = {
  provider: process.env.SEPOLIA_RPC_URL ?? 'https://ethereum-sepolia-rpc.publicnode.com',
  transactionMaxFee: 10n ** 16n, // 0.01 ETH per transaction
  zama: {
    chain: 'sepolia',
    // In production pass a persistent, secure storage: it holds the decrypt permit and the
    // transport private key. MemoryStorage forgets them when the process exits.
    storage: new MemoryStorage(),
    ...(process.env.ZAMA_RELAYER_API_KEY ? { relayerAuth: { __type: 'ApiKeyHeader', value: process.env.ZAMA_RELAYER_API_KEY } } : {})
  }
}

let manager, account, recipient

if (process.env.SEPOLIA_SEED) {
  manager = new WalletManagerEvmZama(process.env.SEPOLIA_SEED, config)
  account = await manager.getAccount(0)
  recipient = process.env.RECIPIENT ?? await (await manager.getAccount(1)).getAddress()
} else if (process.env.SEPOLIA_PRIVATE_KEY) {
  account = WalletAccountEvmZama.fromPrivateKey(process.env.SEPOLIA_PRIVATE_KEY, config)
  recipient = process.env.RECIPIENT

  if (!recipient) {
    throw new Error('Set RECIPIENT when using SEPOLIA_PRIVATE_KEY.')
  }
} else {
  throw new Error('Set SEPOLIA_SEED or SEPOLIA_PRIVATE_KEY (see .env.example).')
}

try {
  const address = await account.getAddress()

  console.log('Account:', address)
  console.log('ETH balance:', await account.getBalance())

  // The Sepolia USDT mock has a public mint: top up when the balance is short.
  if (await account.getTokenBalance(USDT_MOCK_SEPOLIA) < 10n * ONE) {
    const iface = new Interface(['function mint(address to, uint256 amount)'])
    const { hash } = await account.sendTransaction({ to: USDT_MOCK_SEPOLIA, value: 0, data: iface.encodeFunctionData('mint', [address, 100n * ONE]) })

    console.log('Minted 100 USDTMock:', hash)
    await account.waitForTransaction(hash)
  }

  console.log('USDT balance (public):', await account.getTokenBalance(USDT_MOCK_SEPOLIA))

  // Reading a confidential balance needs a decrypt permit (one EIP-712 signature, cached in storage).
  if (!(await account.hasDecryptPermit([CUSDT_MOCK_SEPOLIA]))) {
    await account.grantDecryptPermit([CUSDT_MOCK_SEPOLIA])
  }
  console.log('cUSDT balance (decrypted):', await account.getConfidentialBalance(CUSDT_MOCK_SEPOLIA))

  // Shield: a public ERC-20 transfer into the wrapper. The amount is visible on-chain.
  const shielded = await account.shield({ token: CUSDT_MOCK_SEPOLIA, amount: 10n * ONE })
  console.log('Shielded 10 USDT:', shielded)
  await account.waitForTransaction(shielded.hash)

  // Confidential transfer: the amount is encrypted on the client; only sender, recipient and
  // the token contract can decrypt it. Addresses stay public.
  const transfer = await account.confidentialTransfer({ token: CUSDT_MOCK_SEPOLIA, recipient, amount: 3n * ONE })
  console.log('Sent 3 cUSDT confidentially to', recipient, transfer)
  await account.waitForTransaction(transfer.hash)

  console.log('cUSDT balance (decrypted):', await account.getConfidentialBalance(CUSDT_MOCK_SEPOLIA))

  // Unshield: two transactions. The second one waits for the Zama KMS to decrypt the amount.
  const unshielded = await account.unshield({ token: CUSDT_MOCK_SEPOLIA, amount: 7n * ONE }, {
    onUnwrapSubmitted: hash => console.log('  unwrap submitted', hash),
    onFinalizing: () => console.log('  waiting for the KMS decryption...'),
    onFinalizeSubmitted: hash => console.log('  finalize submitted', hash)
  })
  console.log('Unshielded 7 cUSDT:', unshielded)
  await account.waitForTransaction(unshielded.finalizeHash)

  console.log('cUSDT balance (decrypted):', await account.getConfidentialBalance(CUSDT_MOCK_SEPOLIA))
  console.log('USDT balance (public):', await account.getTokenBalance(USDT_MOCK_SEPOLIA))
} catch (error) {
  if (error.name === 'UnshieldPendingError') {
    console.error('The unshield was interrupted. Resume it later with:')
    console.error(`  account.resumeUnshield({ token: '${CUSDT_MOCK_SEPOLIA}', unwrapHash: '${error.unwrapHash}' })`)
  }

  throw error
} finally {
  manager ? manager.dispose() : account.dispose()
}

// The FHE WASM worker pool keeps the event loop alive until @zama-fhe/sdk learns to terminate it.
process.exit(0)
