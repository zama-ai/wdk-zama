// Copyright 2026 Zama
// SPDX-License-Identifier: BSD-3-Clause-Clear
'use strict'

import 'bare-node-runtime/global'

export * from './index.js' with { imports: 'bare-node-runtime/imports' }

export { default } from './index.js' with { imports: 'bare-node-runtime/imports' }
