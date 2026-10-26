// Shield USDT into cUSDT and back through the WDK swidge interface, on Sepolia with the mock
// tokens and a plain WDK EVM account.
//
//   npm run example:swidge            (reads .env at the repo root, see .env.example)
//
// Variables: SEPOLIA_SEED or SEPOLIA_PRIVATE_KEY (the account needs Sepolia ETH; the USDT mock
// is minted on demand), optional SEPOLIA_RPC_URL, ZAMA_RELAYER_API_KEY.

import WalletManagerEvm, { WalletAccountEvm } from '@tetherto/wdk-wallet-evm'
import { MemoryStorage } from '@zama-fhe/sdk'
import { CUSDT_MOCK_SEPOLIA, USDT_MOCK_SEPOLIA } from '@zama-fhe/wdk-wallet-evm-zama'
import { Interface } from 'ethers'

import ZamaShieldProtocol from '@zama-fhe/wdk-protocol-swidge-zama'

const ONE = 1_000_000n // USDT has 6 decimals

const walletConfig = {
  provider: process.env.SEPOLIA_RPC_URL ?? 'https://ethereum-sepolia-rpc.publicnode.com',
  transactionMaxFee: 10n ** 16n // 0.01 ETH per transaction
}

let manager, account, shield

if (process.env.SEPOLIA_SEED) {
  manager = new WalletManagerEvm(process.env.SEPOLIA_SEED, walletConfig)
  account = await manager.getAccount(0)
} else if (process.env.SEPOLIA_PRIVATE_KEY) {
  account = WalletAccountEvm.fromPrivateKey(process.env.SEPOLIA_PRIVATE_KEY, walletConfig)
} else {
  throw new Error('Set SEPOLIA_SEED or SEPOLIA_PRIVATE_KEY (see .env.example).')
}

try {
  const address = await account.getAddress()

  console.log('Account:', address)

  // The Sepolia USDT mock has a public mint: top up when the balance is short.
  if (await account.getTokenBalance(USDT_MOCK_SEPOLIA) < 10n * ONE) {
    const iface = new Interface(['function mint(address to, uint256 amount)'])
    const { hash } = await account.sendTransaction({ to: USDT_MOCK_SEPOLIA, value: 0, data: iface.encodeFunctionData('mint', [address, 100n * ONE]) })

    console.log('Minted 100 USDTMock:', hash)
    await account.waitForTransaction(hash)
  }

  // With WDK Core you would register it instead:
  //   account.registerProtocol('confidential', ZamaShieldProtocol, config)
  //   const shield = account.getSwidgeProtocol('confidential')
  shield = new ZamaShieldProtocol(account, {
    chain: 'sepolia',
    storage: new MemoryStorage(), // use a persistent, secure storage in production
    ...(process.env.ZAMA_RELAYER_API_KEY ? { relayerAuth: { __type: 'ApiKeyHeader', value: process.env.ZAMA_RELAYER_API_KEY } } : {})
  })

  console.log('Supported tokens:', await shield.getSupportedTokens())
  console.log('Quote:', await shield.quoteSwidge({ fromToken: USDT_MOCK_SEPOLIA, toToken: CUSDT_MOCK_SEPOLIA, fromTokenAmount: 10n * ONE }))

  // USDT -> cUSDT. Public amount: it is an ERC-20 transfer into the wrapper.
  const shielded = await shield.swidge({ fromToken: USDT_MOCK_SEPOLIA, toToken: CUSDT_MOCK_SEPOLIA, fromTokenAmount: 10n * ONE })
  console.log('Shield:', shielded)
  await account.waitForTransaction(shielded.hash)
  console.log('Status:', await shield.getSwidgeStatus(shielded.id))

  // cUSDT -> USDT. Two transactions; the second waits for the Zama KMS decryption.
  const unshielded = await shield.swidge({ fromToken: CUSDT_MOCK_SEPOLIA, toToken: USDT_MOCK_SEPOLIA, fromTokenAmount: 10n * ONE })
  console.log('Unshield:', unshielded)
  await account.waitForTransaction(unshielded.transactions.at(-1).hash)

  const status = await shield.getSwidgeStatus(unshielded.id)
  console.log('Status:', status)

  if (status.status === 'action-required') {
    // The finalize transaction failed; the id alone is enough to finish later.
    console.log('Resumed:', await shield.resumeSwidge(unshielded.id))
  }
} finally {
  await shield?.dispose()
  manager ? manager.dispose() : account.dispose()
}

// The FHE WASM worker pool keeps the event loop alive until @zama-fhe/sdk learns to terminate it.
process.exit(0)
