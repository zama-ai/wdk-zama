# Recover an interrupted unshield

An unshield is two transactions. If the app crashes, the user closes the wallet, or the finalize transaction fails after the unwrap was mined, the cUSDT is burned but the USD₮ is not released yet. Nothing is lost: the unwrap request stays on-chain until it is finalized.

## In the same session

`unshield` throws `UnshieldPendingError` with the unwrap hash:

```javascript
try {
  await account.unshield({ token: CUSDT_MAINNET, amount })
} catch (error) {
  if (error instanceof UnshieldPendingError) {
    await account.resumeUnshield({ token: CUSDT_MAINNET, unwrapHash: error.unwrapHash })
  } else {
    throw error
  }
}
```

## After a restart

The Zama SDK records the pending unwrap in the configured `storage`. On startup, check for it and let the user resume:

```javascript
const unwrapHash = await account.getPendingUnshield(CUSDT_MAINNET)

if (unwrapHash) {
  const { finalizeHash } = await account.resumeUnshield({ token: CUSDT_MAINNET, unwrapHash })
}
```

Nothing resumes automatically; the caller decides when. If the request was already finalized (for example from another device), `resumeUnshield` resolves with `finalizeHash: null` and clears the pointer.

This only works when `storage` is persistent. With the default in-memory storage, keep the unwrap hash yourself: it is all `resumeUnshield` needs.

## With the swidge module

`getSwidgeStatus(id)` reports `action-required` for an unfinalized unshield and `resumeSwidge(id)` finalizes it. The swidge id carries the unwrap hash, so no storage is needed there.
