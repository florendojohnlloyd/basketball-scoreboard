import * as fc from 'fast-check'

if (process.env.CI) {
  fc.configureGlobal({ seed: 42 })
}
