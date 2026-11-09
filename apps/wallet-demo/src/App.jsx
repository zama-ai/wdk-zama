import './polyfills.js'

import { useCallback, useEffect, useRef, useState } from 'react'

import {
  CUSDT, ENV_SEED, USDT, addressUrl, createWallet, forgetSeed, formatAmount, formatEth, formatFee, generateSeed,
  isValidSeed, loadSeed, mintTestUsdt, parseAmount, saveSeed, shortAddress, txUrl
} from './wallet.js'

const FAUCET_URL = 'https://cloud.google.com/application/web3/faucet/ethereum/sepolia'
const ACCOUNTS = [0, 1, 2]
const MINT_AMOUNT = 100_000_000n // 100 USD₮
const TABS = [
  { id: 'send', label: 'Send' },
  { id: 'shield', label: 'Shield' },
  { id: 'unshield', label: 'Unshield' },
  { id: 'swap', label: 'Swap' },
  { id: 'activity', label: 'Activity' }
]

export default function App () {
  const [wallet, setWallet] = useState(null)

  const unlock = useCallback(seed => {
    saveSeed(seed)
    setWallet(createWallet(seed))
  }, [])

  const lock = useCallback(() => {
    wallet?.dispose()
    forgetSeed()
    setWallet(null)
  }, [wallet])

  useEffect(() => {
    if (ENV_SEED && !isValidSeed(ENV_SEED)) {
      console.error('NEXT_PUBLIC_DEMO_SEED_PHRASE in .env.local is not a valid recovery phrase. Ignoring it.')
    }

    const seed = ENV_SEED && isValidSeed(ENV_SEED) ? ENV_SEED : loadSeed()

    if (seed && isValidSeed(seed)) setWallet(createWallet(seed))
  }, [])

  return (
    <div className='shell'>
      <TopBar />
      {wallet ? <Wallet wallet={wallet} onLock={lock} /> : <Onboarding onUnlock={unlock} />}
      <footer className='footer'>
        Built with <a href='https://docs.wdk.tether.io/' target='_blank' rel='noreferrer'>Tether WDK</a>,{' '}
        <code>@zama-fhe/wdk-wallet-evm-zama</code> and <code>@zama-fhe/wdk-protocol-swidge-zama</code>.
        Sepolia testnet only.
      </footer>
    </div>
  )
}

function TopBar () {
  return (
    <header className='topbar'>
      <div className='brand'>
        <span className='logo'>₮</span>
        <div>
          <div className='brand-name'>Confidential Wallet</div>
          <div className='brand-sub'>Tether WDK × Zama FHE</div>
        </div>
      </div>
      <span className='network'><span className='dot' /> Sepolia</span>
    </header>
  )
}

// ---------------------------------------------------------------------------------------------
// Onboarding

function Onboarding ({ onUnlock }) {
  const [mode, setMode] = useState('choose')
  const [seed, setSeed] = useState('')
  const [input, setInput] = useState('')
  const [error, setError] = useState('')

  if (mode === 'created') {
    return (
      <main className='card onboarding'>
        <h1>Your recovery phrase</h1>
        <p className='muted'>Write these 12 words down. This demo stores them in your browser, so only use it on testnet.</p>
        <ol className='seed'>
          {seed.split(' ').map((word, i) => <li key={i}><span>{i + 1}</span>{word}</li>)}
        </ol>
        <button className='primary wide' onClick={() => onUnlock(seed)}>I saved it, open my wallet</button>
      </main>
    )
  }

  if (mode === 'import') {
    const submit = () => {
      const phrase = input.trim().toLowerCase().split(/\s+/).join(' ')

      if (!isValidSeed(phrase)) return setError('This is not a valid BIP-39 recovery phrase.')
      onUnlock(phrase)
    }

    return (
      <main className='card onboarding'>
        <h1>Import a wallet</h1>
        <textarea rows={3} placeholder='twelve or twenty-four words…' value={input} onChange={e => { setInput(e.target.value); setError('') }} />
        {error && <p className='error'>{error}</p>}
        <div className='row'>
          <button className='ghost' onClick={() => setMode('choose')}>Back</button>
          <button className='primary' onClick={submit}>Import</button>
        </div>
      </main>
    )
  }

  return (
    <main className='card onboarding hero'>
      <h1>USD₮ with private balances</h1>
      <p className='muted'>
        A self-custodial WDK wallet that holds <b>confidential USD₮ (cUSDT)</b>. Balances and transfer
        amounts are encrypted on-chain with Zama's fully homomorphic encryption; only you can decrypt them.
      </p>
      <ul className='features'>
        <li><b>Shield</b> USD₮ into cUSDT</li>
        <li><b>Send</b> with an encrypted amount</li>
        <li><b>Unshield</b> back to public USD₮</li>
        <li><b>Swap</b> through the WDK swidge interface</li>
      </ul>
      <button className='primary wide' onClick={() => { setSeed(generateSeed()); setMode('created') }}>Create a new wallet</button>
      <button className='ghost wide' onClick={() => setMode('import')}>I already have a recovery phrase</button>
    </main>
  )
}

// ---------------------------------------------------------------------------------------------
// Wallet

function Wallet ({ wallet, onLock }) {
  const [index, setIndex] = useState(0)
  const [account, setAccount] = useState(null)
  const [address, setAddress] = useState('')
  const [addresses, setAddresses] = useState({})
  const [balances, setBalances] = useState({ eth: null, usdt: null, cusdt: null })
  const [permit, setPermit] = useState(false)
  const [decrypting, setDecrypting] = useState(false)
  const [pending, setPending] = useState(null)
  const [tab, setTab] = useState('send')
  const [activity, setActivity] = useActivity(address)
  const [toast, setToast] = useState(null)
  const [minting, setMinting] = useState(false)
  const current = useRef(null)

  useEffect(() => {
    let cancelled = false

    Promise.all(ACCOUNTS.map(i => wallet.getAccount(i).then(a => a.getAddress())))
      .then(list => !cancelled && setAddresses(Object.fromEntries(list.map((a, i) => [i, a]))))

    return () => { cancelled = true }
  }, [wallet])

  useEffect(() => {
    let cancelled = false

    setAccount(null)
    setBalances({ eth: null, usdt: null, cusdt: null })
    setPermit(false)
    setPending(null)

    wallet.getAccount(index).then(async next => {
      if (cancelled) return
      current.current = next
      setAccount(next)
      setAddress(await next.getAddress())
    })

    return () => { cancelled = true }
  }, [wallet, index])

  const refreshPublic = useCallback(async () => {
    const acc = current.current

    if (!acc) return
    const [eth, usdt] = await Promise.all([acc.getBalance(), acc.getTokenBalance(USDT)])

    if (current.current === acc) setBalances(b => ({ ...b, eth, usdt }))
  }, [])

  const refreshConfidential = useCallback(async () => {
    const acc = current.current

    if (!acc || !(await acc.hasDecryptPermit([CUSDT]))) return
    setDecrypting(true)
    try {
      const cusdt = await acc.getConfidentialBalance(CUSDT)

      if (current.current === acc) setBalances(b => ({ ...b, cusdt }))
    } finally {
      setDecrypting(false)
    }
  }, [])

  const refreshAll = useCallback(async () => {
    await Promise.all([refreshPublic(), refreshConfidential()])
  }, [refreshPublic, refreshConfidential])

  useEffect(() => {
    if (!account) return

    // Never decrypt on render: only when a permit already exists. Otherwise the user opts in.
    account.hasDecryptPermit([CUSDT]).then(has => {
      setPermit(has)
      if (has) refreshConfidential().catch(e => setToast({ kind: 'error', text: e.message }))
    })
    account.getPendingUnshield(CUSDT).then(setPending).catch(() => {})
    refreshPublic().catch(e => setToast({ kind: 'error', text: e.message }))
  }, [account, refreshPublic, refreshConfidential])

  const reveal = async () => {
    setDecrypting(true)
    try {
      await account.grantDecryptPermit([CUSDT])
      setPermit(true)
      await refreshConfidential()
    } catch (e) {
      setToast({ kind: 'error', text: e.message })
    } finally {
      setDecrypting(false)
    }
  }

  const hide = async () => {
    await account.revokeDecryptPermits()
    setPermit(false)
    setBalances(b => ({ ...b, cusdt: null }))
  }

  const log = entry => setActivity(list => [{ time: Date.now(), ...entry }, ...list].slice(0, 50))

  const mint = async () => {
    setMinting(true)
    try {
      const { hash } = await mintTestUsdt(account, MINT_AMOUNT)

      setToast({ kind: 'info', text: `Minting ${formatAmount(MINT_AMOUNT, 6, 0)} test USD₮…` })
      await account.waitForTransaction(hash)
      log({ type: 'Mint test USD₮', amount: MINT_AMOUNT, hashes: [hash] })
      await refreshPublic()
      setToast({ kind: 'info', text: `Minted ${formatAmount(MINT_AMOUNT, 6, 0)} test USD₮. Shield it to make it confidential.` })
    } catch (e) {
      setToast({ kind: 'error', text: e.message })
    } finally {
      setMinting(false)
    }
  }

  const ctx = { account, address, addresses, index, balances, permit, refreshAll, log, setToast, setPending }

  return (
    <main className='wallet'>
      <section className='card account'>
        <div className='account-row'>
          <select value={index} onChange={e => setIndex(Number(e.target.value))} aria-label='Account'>
            {ACCOUNTS.map(i => <option key={i} value={i}>Account {i + 1}{addresses[i] ? ` · ${shortAddress(addresses[i])}` : ''}</option>)}
          </select>
          <button className='link' onClick={onLock} title='Remove the seed from this browser'>Sign out</button>
        </div>
        <div className='address'>
          <code>{address || 'loading…'}</code>
          {address && <CopyButton text={address} />}
          {address && <a href={addressUrl(address)} target='_blank' rel='noreferrer' className='link'>Blockscout ↗</a>}
        </div>

        <div className='balances'>
          <Balance label='Sepolia ETH' value={balances.eth === null ? null : formatEth(balances.eth)} unit='ETH' visibility='public' />
          <Balance label='USD₮ (test)' value={balances.usdt === null ? null : formatAmount(balances.usdt)} unit='USDT' visibility='public'>
            <div className='balance-actions'>
              <button className='small primary' onClick={mint} disabled={!account || minting || balances.eth === 0n} title='Mint test USD₮ from the public Sepolia mock'>
                {minting ? 'Minting…' : `+ Mint ${formatAmount(MINT_AMOUNT, 6, 0)}`}
              </button>
            </div>
          </Balance>
          <div className='balance confidential'>
            <div className='balance-label'>Confidential USD₮ <Tag kind='private' /></div>
            {permit && balances.cusdt !== null && !decrypting && (
              <div className='balance-value'>{formatAmount(balances.cusdt)} <span>cUSDT</span></div>
            )}
            {decrypting && <div className='balance-value shimmer'>decrypting…</div>}
            {!decrypting && (!permit || balances.cusdt === null) && (
              <div className='balance-value cipher'>•••••• <span>cUSDT</span></div>
            )}
            <div className='balance-actions'>
              {!permit && <button className='small primary' onClick={reveal} disabled={!account || decrypting}>Decrypt balance</button>}
              {permit && <button className='small ghost' onClick={() => refreshConfidential().catch(e => setToast({ kind: 'error', text: e.message }))} disabled={decrypting}>Refresh</button>}
              {permit && <button className='small ghost' onClick={hide} disabled={decrypting}>Hide</button>}
            </div>
          </div>
        </div>

        {balances.eth === 0n && (
          <div className='notice'>
            This account has no Sepolia ETH for gas. Get some from a{' '}
            <a href={FAUCET_URL} target='_blank' rel='noreferrer'>Sepolia faucet</a> for <code>{shortAddress(address)}</code>.
          </div>
        )}
        {pending && <PendingUnshield ctx={ctx} unwrapHash={pending} />}
      </section>

      <nav className='tabs'>
        {TABS.map(t => <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>{t.label}</button>)}
      </nav>

      <section className='card panel'>
        {tab === 'send' && <SendPanel ctx={ctx} />}
        {tab === 'shield' && <ShieldPanel ctx={ctx} />}
        {tab === 'unshield' && <UnshieldPanel ctx={ctx} />}
        {tab === 'swap' && <SwapPanel ctx={ctx} />}
        {tab === 'activity' && <ActivityPanel activity={activity} />}
      </section>

      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
    </main>
  )
}

function Balance ({ label, value, unit, visibility, children }) {
  return (
    <div className='balance'>
      <div className='balance-label'>{label} <Tag kind={visibility} /></div>
      <div className='balance-value'>{value ?? <span className='shimmer'>…</span>} <span>{unit}</span></div>
      {children}
    </div>
  )
}

function Tag ({ kind }) {
  return kind === 'private'
    ? <span className='tag private' title='Encrypted on-chain'>🔒 encrypted</span>
    : <span className='tag public' title='Visible to everyone on-chain'>public</span>
}

// ---------------------------------------------------------------------------------------------
// Actions

function useAction (ctx) {
  const [busy, setBusy] = useState(false)
  const [steps, setSteps] = useState([])

  const step = (text, hash) => setSteps(s => [...s.map(x => ({ ...x, done: true })), { text, hash }])

  const run = async (fn, { refresh = true } = {}) => {
    setBusy(true)
    setSteps([])
    try {
      await fn(step)
      setSteps(s => s.map(x => ({ ...x, done: true })))
      if (refresh) await ctx.refreshAll()
    } catch (e) {
      if (e.name === 'UnshieldPendingError') ctx.setPending(e.unwrapHash)
      setSteps(s => [...s, { text: e.message, error: true }])
    } finally {
      setBusy(false)
    }
  }

  return { busy, steps, run }
}

function AmountField ({ value, onChange, max, unit }) {
  return (
    <label className='field'>
      <span>Amount</span>
      <div className='amount'>
        <input inputMode='decimal' placeholder='0.00' value={value} onChange={e => onChange(e.target.value)} />
        <span className='unit'>{unit}</span>
        {max != null && <button type='button' className='small ghost' onClick={() => onChange(formatAmount(max, 6, 6).replace(/,/g, ''))}>Max</button>}
      </div>
    </label>
  )
}

function SendPanel ({ ctx }) {
  const [to, setTo] = useState('')
  const [amount, setAmount] = useState('')
  const { busy, steps, run } = useAction(ctx)
  const others = ACCOUNTS.filter(i => i !== ctx.index && ctx.addresses[i])

  const send = () => run(async step => {
    const value = parseAmount(amount)

    step('Encrypting the amount in your browser and sending…')
    const { hash } = await ctx.account.confidentialTransfer({ token: CUSDT, recipient: to.trim(), amount: value })

    step('Transfer submitted', hash)
    await ctx.account.waitForTransaction(hash)
    step('Confirmed. The amount is only visible to you and the recipient.')
    ctx.log({ type: 'Confidential send', amount: value, to: to.trim(), hashes: [hash] })
  })

  return (
    <div className='form'>
      <h2>Send cUSDT privately</h2>
      <p className='muted'>The amount is encrypted on your device before it leaves the wallet. Sender and recipient addresses stay public.</p>
      <label className='field'>
        <span>Recipient</span>
        <input placeholder='0x…' value={to} onChange={e => setTo(e.target.value)} spellCheck={false} />
      </label>
      {others.length > 0 && (
        <div className='chips'>
          {others.map(i => <button key={i} className='chip' onClick={() => setTo(ctx.addresses[i])}>Account {i + 1}</button>)}
        </div>
      )}
      <AmountField value={amount} onChange={setAmount} max={ctx.permit ? ctx.balances.cusdt : null} unit='cUSDT' />
      <Visibility rows={[['Sender & recipient', 'public'], ['Amount', 'private'], ['Your new balance', 'private']]} />
      <button className='primary wide' onClick={send} disabled={busy || !ctx.account || !to || !amount}>{busy ? 'Sending…' : 'Send confidentially'}</button>
      <Steps steps={steps} />
    </div>
  )
}

function ShieldPanel ({ ctx }) {
  const [amount, setAmount] = useState('')
  const { busy, steps, run } = useAction(ctx)

  const shield = () => run(async step => {
    const value = parseAmount(amount)

    step('Moving USD₮ into the confidential wrapper…')
    const { hash, approvalHash } = await ctx.account.shield({ token: CUSDT, amount: value })

    if (approvalHash) step('Approval submitted', approvalHash)
    step('Shield submitted', hash)
    await ctx.account.waitForTransaction(hash)
    step('Confirmed. Your cUSDT balance is encrypted from now on.')
    ctx.log({ type: 'Shield', amount: value, hashes: [approvalHash, hash].filter(Boolean) })
  })

  const mint = () => run(async step => {
    step('Minting 100 test USD₮ from the Sepolia mock…')
    const { hash } = await mintTestUsdt(ctx.account, MINT_AMOUNT)

    step('Mint submitted', hash)
    await ctx.account.waitForTransaction(hash)
    step('Confirmed.')
    ctx.log({ type: 'Mint test USD₮', amount: MINT_AMOUNT, hashes: [hash] })
  })

  return (
    <div className='form'>
      <h2>Shield USD₮ → cUSDT</h2>
      <p className='muted'>Wraps public USD₮ 1:1 into confidential USD₮. The amount you shield is visible, since it is a normal token transfer; what you do with it afterwards is not.</p>
      <AmountField value={amount} onChange={setAmount} max={ctx.balances.usdt} unit='USDT' />
      <Visibility rows={[['Amount shielded', 'public'], ['Resulting cUSDT balance', 'private']]} />
      <button className='primary wide' onClick={shield} disabled={busy || !ctx.account || !amount}>{busy ? 'Working…' : 'Shield'}</button>
      <button className='ghost wide' onClick={mint} disabled={busy || !ctx.account}>Mint 100 test USD₮</button>
      <Steps steps={steps} />
    </div>
  )
}

function UnshieldPanel ({ ctx }) {
  const [amount, setAmount] = useState('')
  const { busy, steps, run } = useAction(ctx)

  const unshield = () => run(async step => {
    const value = parseAmount(amount)

    step('Encrypting the amount and requesting the unwrap…')
    const { unwrapHash, finalizeHash } = await ctx.account.unshield({ token: CUSDT, amount: value }, {
      onUnwrapSubmitted: hash => step('Unwrap submitted', hash),
      onFinalizing: () => step('Waiting for the Zama KMS to decrypt the amount…'),
      onFinalizeSubmitted: hash => step('Finalize submitted', hash)
    })

    await ctx.account.waitForTransaction(finalizeHash)
    step('Confirmed. USD₮ is back in your public balance.')
    ctx.log({ type: 'Unshield', amount: value, hashes: [unwrapHash, finalizeHash] })
  })

  return (
    <div className='form'>
      <h2>Unshield cUSDT → USD₮</h2>
      <p className='muted'>Two transactions: the unwrap request, then a finalize once the Zama KMS has publicly decrypted the requested amount. If the second step is interrupted, the wallet can resume it later.</p>
      <AmountField value={amount} onChange={setAmount} max={ctx.permit ? ctx.balances.cusdt : null} unit='cUSDT' />
      <Visibility rows={[['Amount unshielded', 'public'], ['Remaining cUSDT balance', 'private']]} />
      <button className='primary wide' onClick={unshield} disabled={busy || !ctx.account || !amount}>{busy ? 'Working…' : 'Unshield'}</button>
      <Steps steps={steps} />
    </div>
  )
}

function PendingUnshield ({ ctx, unwrapHash }) {
  const { busy, steps, run } = useAction(ctx)

  const resume = () => run(async step => {
    step('Finalizing the earlier unwrap…')
    const { finalizeHash } = await ctx.account.resumeUnshield({ token: CUSDT, unwrapHash })

    if (finalizeHash) {
      step('Finalize submitted', finalizeHash)
      await ctx.account.waitForTransaction(finalizeHash)
    }
    step('Done.')
    ctx.setPending(null)
    ctx.log({ type: 'Resume unshield', hashes: [unwrapHash, finalizeHash].filter(Boolean) })
  })

  return (
    <div className='notice warn'>
      <div>An unshield was interrupted after its <a href={txUrl(unwrapHash)} target='_blank' rel='noreferrer'>unwrap transaction</a>. Your funds are safe; finish it to receive the USD₮.</div>
      <button className='small primary' onClick={resume} disabled={busy}>{busy ? 'Resuming…' : 'Resume'}</button>
      <Steps steps={steps} />
    </div>
  )
}

function SwapPanel ({ ctx }) {
  const [direction, setDirection] = useState('shield')
  const [amount, setAmount] = useState('')
  const [quote, setQuote] = useState(null)
  const [status, setStatus] = useState(null)
  const { busy, steps, run } = useAction(ctx)
  const [fromToken, toToken] = direction === 'shield' ? [USDT, CUSDT] : [CUSDT, USDT]
  const [fromLabel, toLabel] = direction === 'shield' ? ['USDT', 'cUSDT'] : ['cUSDT', 'USDT']

  // The same swidge interface any WDK wallet already uses for swaps and bridges.
  const protocol = () => ctx.account.getSwidgeProtocol('confidential')

  useEffect(() => { setQuote(null); setStatus(null) }, [direction, amount, ctx.account])

  const getQuote = () => run(async () => {
    setQuote(await protocol().quoteSwidge({ fromToken, toToken, fromTokenAmount: parseAmount(amount) }))
  }, { refresh: false })

  const execute = () => run(async step => {
    const value = parseAmount(amount)

    step(`swidge(${fromLabel} → ${toLabel})…`)
    const result = await protocol().swidge({ fromToken, toToken, fromTokenAmount: value })

    for (const tx of result.transactions ?? []) step(`${tx.type ?? 'transaction'} submitted`, tx.hash)
    const last = result.transactions?.at(-1)?.hash ?? result.hash

    await ctx.account.waitForTransaction(last)
    ctx.log({ type: `Swap ${fromLabel} → ${toLabel}`, amount: value, hashes: (result.transactions ?? []).map(t => t.hash) })

    // A load-balanced RPC can briefly serve a block before the finalize: poll before asking the
    // user to resume.
    let s = await protocol().getSwidgeStatus(result.id)

    for (let i = 0; i < 10 && (s.status === 'pending' || s.status === 'action-required'); i++) {
      await new Promise(resolve => setTimeout(resolve, 3000))
      s = await protocol().getSwidgeStatus(result.id)
    }

    setStatus({ id: result.id, ...s })
    step(`getSwidgeStatus → ${s.status}`)
  })

  const resume = () => run(async step => {
    step('resumeSwidge…')
    const result = await protocol().resumeSwidge(status.id)
    const finalize = result.transactions.find(t => t.type === 'destination')

    if (finalize) step('Finalized', finalize.hash)
    setStatus({ id: status.id, ...(await protocol().getSwidgeStatus(status.id)) })
  })

  const networkFee = quote?.fees?.filter(f => f.type === 'network').reduce((sum, f) => sum + f.amount, 0n)

  return (
    <div className='form'>
      <h2>Swap via the WDK swidge interface</h2>
      <p className='muted'>
        <code>@zama-fhe/wdk-protocol-swidge-zama</code> exposes shield and unshield as a same-chain swap, so any WDK wallet with a swap screen gets confidential USD₮ with no new UI.
      </p>
      <div className='swap'>
        <div className='swap-side'><span className='muted'>From</span><b>{fromLabel}</b></div>
        <button className='flip' onClick={() => setDirection(d => d === 'shield' ? 'unshield' : 'shield')} title='Flip direction'>⇄</button>
        <div className='swap-side'><span className='muted'>To</span><b>{toLabel}</b></div>
      </div>
      <AmountField value={amount} onChange={setAmount} max={direction === 'shield' ? ctx.balances.usdt : (ctx.permit ? ctx.balances.cusdt : null)} unit={fromLabel} />
      {quote && (
        <dl className='quote'>
          <dt>You receive</dt><dd>{formatAmount(quote.toTokenAmount)} {toLabel}</dd>
          <dt>Minimum received</dt><dd>{formatAmount(quote.toTokenAmountMin)} {toLabel}</dd>
          <dt>Network fee (est.)</dt><dd>{networkFee != null ? formatFee(networkFee) : '—'}</dd>
          <dt>Protocol fee</dt><dd>none</dd>
        </dl>
      )}
      <div className='row'>
        <button className='ghost' onClick={getQuote} disabled={busy || !ctx.account || !amount}>Get quote</button>
        <button className='primary' onClick={execute} disabled={busy || !ctx.account || !amount}>{busy ? 'Working…' : 'Swap'}</button>
      </div>
      {status && <p className='muted small'>Swidge id <code>{status.id}</code> · status <b>{status.status}</b></p>}
      {status?.status === 'action-required' && (
        <div className='notice warn'>
          The unshield is waiting for its finalize transaction.
          <button className='small primary' onClick={resume} disabled={busy}>Resume with resumeSwidge</button>
        </div>
      )}
      <Steps steps={steps} />
    </div>
  )
}

function ActivityPanel ({ activity }) {
  if (!activity.length) return <p className='muted center'>No activity yet in this browser.</p>

  return (
    <ul className='activity'>
      {activity.map((a, i) => (
        <li key={i}>
          <div>
            <b>{a.type}</b>
            {a.amount != null && <span className='muted'> · {formatAmount(BigInt(a.amount))}</span>}
            {a.to && <span className='muted'> → {shortAddress(a.to)}</span>}
          </div>
          <div className='muted small'>
            {new Date(a.time).toLocaleString()}{' '}
            {a.hashes.map(h => <a key={h} href={txUrl(h)} target='_blank' rel='noreferrer'>{h.slice(0, 10)}… ↗</a>)}
          </div>
        </li>
      ))}
    </ul>
  )
}

// ---------------------------------------------------------------------------------------------
// Bits

function Visibility ({ rows }) {
  return (
    <div className='visibility'>
      <div className='visibility-title'>What the chain sees</div>
      {rows.map(([label, kind]) => <div key={label} className='visibility-row'><span>{label}</span><Tag kind={kind} /></div>)}
    </div>
  )
}

function Steps ({ steps }) {
  if (!steps.length) return null

  return (
    <ol className='steps'>
      {steps.map((s, i) => (
        <li key={i} className={s.error ? 'error' : s.done ? 'done' : 'active'}>
          <span className='marker' />
          <span>{s.text}{s.hash && <> · <a href={txUrl(s.hash)} target='_blank' rel='noreferrer'>{s.hash.slice(0, 10)}… ↗</a></>}</span>
        </li>
      ))}
    </ol>
  )
}

function CopyButton ({ text }) {
  const [copied, setCopied] = useState(false)

  return (
    <button className='link' onClick={() => navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1200) })}>
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

function Toast ({ toast, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 6000)

    return () => clearTimeout(t)
  }, [toast, onClose])

  return <div className={`toast ${toast.kind}`} onClick={onClose}>{toast.text}</div>
}

// Activity is kept per address in localStorage, as plain JSON (bigints as strings).
function useActivity (address) {
  const key = `wdk-zama-demo:activity:${address}`
  const [list, setList] = useState([])

  useEffect(() => {
    if (!address) return setList([])
    try { setList(JSON.parse(localStorage.getItem(key)) ?? []) } catch { setList([]) }
  }, [key, address])

  const update = useCallback(fn => {
    setList(prev => {
      const next = fn(prev).map(a => ({ ...a, amount: a.amount != null ? String(a.amount) : undefined }))

      try { localStorage.setItem(key, JSON.stringify(next)) } catch {}

      return next
    })
  }, [key])

  return [list, update]
}
