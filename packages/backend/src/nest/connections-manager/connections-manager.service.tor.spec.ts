import { type DirResult } from 'tmp'
import crypto from 'crypto'
import { type PeerId, isPeerId } from '@libp2p/interface'
import { communities, getFactory, identity, prepareStore, Store } from '@quiet/state-manager'
import { createPeerId, createTmpDir, removeFilesFromDir, tmpQuietDirPath } from '../common/utils'
import { NetworkStats, type Community, type Identity } from '@quiet/types'
import { TestingModule, Test } from '@nestjs/testing'
import { FactoryGirl } from 'factory-girl'
import { TestModule } from '../common/test.module'
import { TOR_PASSWORD_PROVIDER, QUIET_DIR } from '../const'
import { Libp2pModule } from '../libp2p/libp2p.module'
import { Libp2pService } from '../libp2p/libp2p.service'
import { LocalDbModule } from '../local-db/local-db.module'
import { LocalDbService } from '../local-db/local-db.service'
import { RegistrationModule } from '../registration/registration.module'
import { RegistrationService } from '../registration/registration.service'
import { SocketModule } from '../socket/socket.module'
import { WebSockets } from '../websocketOverTor'
import { ConnectionsManagerModule } from './connections-manager.module'
import { ConnectionsManagerService } from './connections-manager.service'
import { TorModule } from '../tor/tor.module'
import { Tor } from '../tor/tor.service'
import { TorControl } from '../tor/tor-control.service'
import { LocalDBKeys } from '../local-db/local-db.types'
import { DateTime } from 'luxon'
import waitForExpect from 'wait-for-expect'
import { Libp2pEvents } from '../libp2p/libp2p.types'
import { sleep } from '../common/sleep'
import { createLibp2pAddress } from '@quiet/common'
import { createLogger } from '../common/logger'
import { createFromJSON } from '@libp2p/peer-id-factory'

const logger = createLogger('connectionsManager:test')

jest.setTimeout(100_000)

let tmpDir: DirResult
let tmpAppDataPath: string

let module: TestingModule
let connectionsManagerService: ConnectionsManagerService
let tor: Tor
let localDbService: LocalDbService
let registrationService: RegistrationService
let libp2pService: Libp2pService
let quietDir: string
let store: Store
let factory: FactoryGirl
let community: Community
let userIdentity: Identity
let communityRootCa: string
let peerId: PeerId
let torControl: TorControl

beforeEach(async () => {
  jest.clearAllMocks()
  tmpDir = createTmpDir()
  tmpAppDataPath = tmpQuietDirPath(tmpDir.name)
  store = prepareStore().store
  factory = await getFactory(store)
  communityRootCa = 'rootCa'
  community = await factory.create<ReturnType<typeof communities.actions.addNewCommunity>['payload']>('Community', {
    rootCa: communityRootCa,
  })
  userIdentity = await factory.create<ReturnType<typeof identity.actions.addNewIdentity>['payload']>('Identity', {
    id: community.id,
    nickname: 'john',
  })

  module = await Test.createTestingModule({
    imports: [
      TestModule,
      ConnectionsManagerModule,
      LocalDbModule,
      RegistrationModule,
      SocketModule,
      Libp2pModule,
      TorModule,
    ],
  })
    .overrideProvider(TOR_PASSWORD_PROVIDER)
    .useValue({
      torPassword: 'b5e447c10b0d99e7871636ee5e0839b5',
      torHashedPassword: '16:FCFFE21F3D9138906021FAADD9E49703CC41848A95F829E0F6E1BDBE63',
    })
    .compile()

  connectionsManagerService = await module.resolve(ConnectionsManagerService)
  localDbService = await module.resolve(LocalDbService)
  registrationService = await module.resolve(RegistrationService)
  tor = await module.resolve(Tor)
  await tor.init()

  const torPassword = crypto.randomBytes(16).toString('hex')
  torControl = await module.resolve(TorControl)
  torControl.authString = 'AUTHENTICATE ' + torPassword + '\r\n'
  quietDir = await module.resolve(QUIET_DIR)

  const pskBase64 = Libp2pService.generateLibp2pPSK().psk
  await localDbService.put(LocalDBKeys.PSK, pskBase64)
  await localDbService.put(LocalDBKeys.CURRENT_COMMUNITY_ID, community.id)
  await localDbService.setCommunity(community)
})

afterEach(async () => {
  if (connectionsManagerService) {
    await connectionsManagerService.closeAllServices()
  }
  removeFilesFromDir(quietDir)
})

describe('Connections manager', () => {
  it('saves peer stats when peer has been disconnected', async () => {
    class RemotePeerEventDetail {
      peerId: string

      constructor(peerId: string) {
        this.peerId = peerId
      }

      toString = () => {
        return this.peerId
      }
    }
    const emitSpy = jest.spyOn(libp2pService, 'emit')

    // Peer connected
    await connectionsManagerService.init()
    await connectionsManagerService.launchCommunity({
      community,
      network: { peerId: userIdentity.peerId, hiddenService: userIdentity.hiddenService },
    })
    libp2pService.connectedPeers.set(peerId.toString(), {
      connectedAtSeconds: DateTime.utc().valueOf(),
      address: peerId.toString(),
    })

    // Peer disconnected
    const remoteAddr = `${peerId.toString()}`
    const peerDisconectEventDetail = {
      remotePeer: new RemotePeerEventDetail(peerId.toString()),
      remoteAddr: new RemotePeerEventDetail(remoteAddr),
    }
    await waitForExpect(async () => {
      expect(libp2pService.libp2pInstance).not.toBeUndefined()
    }, 2_000)
    libp2pService.libp2pInstance?.dispatchEvent(
      new CustomEvent('peer:disconnect', { detail: peerDisconectEventDetail })
    )
    await waitForExpect(async () => {
      expect(libp2pService.connectedPeers.size).toEqual(0)
    }, 2000)

    await waitForExpect(async () => {
      expect(await localDbService.get(LocalDBKeys.PEERS)).not.toBeNull()
    }, 2000)
    const peerStats: Record<string, NetworkStats> = await localDbService.get(LocalDBKeys.PEERS)
    expect(Object.keys(peerStats)[0]).toEqual(remoteAddr)
    expect(emitSpy).toHaveBeenCalledWith(Libp2pEvents.PEER_DISCONNECTED, {
      peer: peerStats[remoteAddr].peerId,
      connectionDuration: peerStats[remoteAddr].connectionTime,
      lastSeen: peerStats[remoteAddr].lastSeen,
    })
  })

  it('creates network', async () => {
    const spyOnDestroyHiddenService = jest.spyOn(tor, 'destroyHiddenService')
    await connectionsManagerService.init()
    const network = await connectionsManagerService.getNetwork()
    expect(network.hiddenService.onionAddress.split('.')[0]).toHaveLength(56)
    expect(network.hiddenService.privateKey).toHaveLength(99)
    const peerId = await createFromJSON(network.peerId)
    expect(isPeerId(peerId)).toBeTruthy()
    expect(await spyOnDestroyHiddenService.mock.results[0].value).toBeTruthy()
  })

  it('dials many peers on start', async () => {
    const store = prepareStore().store
    const factory = await getFactory(store)
    const community = await factory.create<Community>('Community', { rootCa: 'rootCa' })
    const userIdentity = await factory.create<Identity>('Identity', { id: community.id, nickname: 'john' })
    const spyOnDial = jest.spyOn(WebSockets.prototype, 'dial')

    const peerList: string[] = []
    const peersCount = 7
    for (let pCount = 0; pCount < peersCount; pCount++) {
      logger.info('pushing peer ', pCount)
      const peerId = await createPeerId()
      peerList.push(createLibp2pAddress(`${Math.random().toString(36).substring(2, 13)}.onion`, peerId.toString()))
    }

    const launchCommunityPayload = {
      community: {
        id: community.id,
        peerList,
      },
      network: {
        peerId: userIdentity.peerId,
        hiddenService: userIdentity.hiddenService,
      },
    }
    await connectionsManagerService.init()
    await connectionsManagerService.launchCommunity(launchCommunityPayload)
    await sleep(5000)
    // It looks LibP2P dials peers initially when it's started and
    // then IPFS service dials peers again when started, thus
    // peersCount-1 * 2 because we don't dial ourself (the first peer in the list)
    expect(spyOnDial).toHaveBeenCalledTimes((peersCount - 1) * 2)
    // Temporary fix for hanging test - websocketOverTor doesn't have abortController
    await sleep(5000)
  })

  it.skip('Bug reproduction - iOS app crashing because lack of data server', async () => {
    const store = prepareStore().store
    const factory = await getFactory(store)
    const community = await factory.create<Community>('Community', { rootCa: 'rootCa' })
    const userIdentity = await factory.create<Identity>('Identity', { id: community.id, nickname: 'john' })

    await connectionsManagerService.init()
    const spyOnDial = jest.spyOn(WebSockets.prototype, 'dial')

    const peerList: string[] = []
    const peersCount = 8
    for (let pCount = 0; pCount < peersCount; pCount++) {
      const peerId = await createPeerId()
      peerList.push(createLibp2pAddress(`${Math.random().toString(36).substring(2, 13)}.onion`, peerId.toString()))
    }

    const launchCommunityPayload = {
      community: {
        id: community.id,
        peerList,
      },
      network: {
        peerId: userIdentity.peerId,
        hiddenService: userIdentity.hiddenService,
      },
    }

    await connectionsManagerService.launchCommunity(launchCommunityPayload)
    expect(spyOnDial).toHaveBeenCalledTimes(peersCount)
    await connectionsManagerService.closeAllServices()
    await sleep(5000)

    const launchSpy = jest.spyOn(connectionsManagerService, 'launch')
    await connectionsManagerService.init()
    expect(launchSpy).toBeCalledTimes(1)
    // Temporary fix for hanging test - websocketOverTor doesn't have abortController
    await sleep(5000)
  })
})
