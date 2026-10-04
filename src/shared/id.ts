import { ID } from './types'

/** Hem ana süreçte hem arayüzde çalışan benzersiz kimlik üretici. */
export function newId(): ID {
  return globalThis.crypto.randomUUID()
}
