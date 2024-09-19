/**
 * @namespace Databases-KeyValue
 * @memberof module:Databases
 * @description
 * Key-Value database
 *
 * Key-value pairs are stored to the configured storage.
 **/
import { type AccessController, KeyValue, type Identity, type Log, type LogEntry } from '@orbitdb/core'
import { type Helia } from 'helia'
import { createLogger } from '../../common/logger'
import { OrbitDbService } from './orbitDb.service'

const logger = createLogger('orbitdb:keyValueWrapper')

/**
 * Defines a KeyValueIndexed database.
 * @param {module:Storage} [storage=LevelStorage] A compatible storage where
 * the key/value pairs are indexed.
 * @return {module:Databases.Databases-KeyValueIndexed} A KeyValueIndexed
 * function.
 * @memberof module:Databases
 */
export const KeyValueWithStorage =
  () =>
  async ({
    ipfs,
    identity,
    address,
    name,
    access,
    directory,
    meta,
    referencesCount,
    syncAutomatically,
    onUpdate,
  }: {
    ipfs: Helia
    identity: Identity
    address: string
    name: string
    access: typeof AccessController
    directory: string
    meta: Record<string, any>
    referencesCount: number
    syncAutomatically: boolean
    onUpdate: (log: Log, entry: LogEntry) => Promise<void>
  }) => {
    logger.info(`Initializing KeyValue OrbitDB database using custom storage`)

    const { entryStorage, indexStorage, headsStorage } = await OrbitDbService.createDefaultStorage(
      directory,
      address,
      ipfs
    )

    // Set up the underlying KeyValue database
    return await KeyValue()({
      ipfs,
      identity,
      address,
      name,
      access,
      directory,
      meta,
      headsStorage,
      entryStorage,
      indexStorage,
      referencesCount,
      syncAutomatically,
      onUpdate,
    })
  }

KeyValueWithStorage.type = 'keyvalue'
