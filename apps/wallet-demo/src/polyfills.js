// bip39 and sodium-universal read the Node globals Buffer and process when they load: import this module first.
import { Buffer } from 'buffer'
import process from 'process'

globalThis.Buffer ??= Buffer
globalThis.process ??= process
