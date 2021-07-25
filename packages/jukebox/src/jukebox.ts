import { NetEvents, NetworkSession, RakServer } from '@jukebox/raknet'

import { BinaryStream } from '@jukebox/binarystream'
import { BlockManager } from './block/block-manager'
import { Config } from './config'
import { Encryption } from './encryption'
import { EntityPlayer } from './entity/entity-player'
import { Logger } from '@jukebox/logger'
import { PacketRegistry } from './network/packet-registry'
import { PlayerConnection } from './network/player-connection'
import { RemoteInfo } from 'dgram'
import { ResourceManager } from './resources/resource-manager'
import { resolve } from 'path'
import { GeneratorManager } from './world/generator/generator-manager'
import { EventEmitter } from 'events'
import { World } from './world/world'

export class Jukebox extends EventEmitter {
  private static instance: Jukebox
  private server: RakServer
  private config: Required<Config>
  private connections: Map<RemoteInfo, PlayerConnection> = new Map()
  private encryption: Encryption | null = null
  private playerList: Array<EntityPlayer> = []
  private world: World
  private running = true

  public constructor(config: Required<Config>) {
    super()
    if (Jukebox.instance) {
      Jukebox.getLogger().fatal(
        'Attempted to start the server twice on a single node process.'
      )
    }

    this.config = config

    Jukebox.instance = this
    this.start()
  }

  private start(): void {
    Jukebox.getLogger().info(
      'Bootstrapping Jukebox server for Minecraft bedrock edition...'
    )

    this.server = new RakServer(
      Jukebox.getConfig().server.port ?? 19132,
      Jukebox.getConfig().server.maxPlayers ?? 20,
      Jukebox.getLogger()
    )

    // Init packet registry
    PacketRegistry.init()
    ResourceManager.init()
    BlockManager.init()
    GeneratorManager.init()

    // TODO: cleanup this mess
    this.world = new World(
      Jukebox.getConfig().defaultWorld ?? 'world',
      GeneratorManager.getGenerator('flat')
    )

    // Init encryption
    if (Jukebox.getConfig().encryption != false) {
      this.encryption = new Encryption()
      Jukebox.getLogger().info(
        `Encryption is enabled, preparing server keys...`
      )
    }

    // Start the actual server
    this.server.addListener(NetEvents.GAME_PACKET, this.handleRawNetwork)
    this.server.on(NetEvents.CLOSE_SESSION, (rinfo: RemoteInfo) => {
      // We already know that connection is close, so we're safe doing it
      if (this.connections.has(rinfo)) {
        this.connections.delete(rinfo)
      }
    })

    try {
      this.server.start()
      Jukebox.getLogger().info('Succesfully loaded Jukebox software!')
    } catch (err) {
      Jukebox.getLogger().fatal(err)
    }

    // Main server tick (every 1/20 seconds)
    const tick = setInterval(() => {
      this.running == false && clearInterval(tick)
      // TODO: tick worlds that will tick entities and players
      this.emit('tick', process.hrtime()[1])
    }, 50)
  }

  /**
   * Handles the raw packet buffer
   * received from the RakNet session.
   *
   * @param stream
   * @param session
   */
  private handleRawNetwork(
    stream: BinaryStream,
    session: NetworkSession
  ): void {
    const rinfo = session.getRemoteInfo()
    if (!Jukebox.instance.connections.has(rinfo)) {
      Jukebox.instance.connections.set(rinfo, new PlayerConnection(session))
    }

    const conn = Jukebox.instance.connections.get(rinfo)!
    conn.handleWrapper(stream)
  }

  public getOnlinePlayers(): EntityPlayer[] {
    return Array.from(this.connections.values())
      .filter(conn => conn.isInitialized())
      .map(conn => conn.getPlayerInstance())
  }

  public getOnlinePlayer(username: string): EntityPlayer | null {
    return (
      this.getOnlinePlayers().find(
        player => player.getUsername() === username
      ) ?? null
    )
  }

  public getPlayerList(): Array<EntityPlayer> {
    return this.playerList
  }

  public shutdown(): void {
    // Close network provider
    this.server.close()
    // Stop ticking connections
    this.running = false
    // Remove all connections
    this.connections.clear()
    Jukebox.getLogger().info('Successfully closed the server socket!')

    process.exit(0)
  }

  public static getServer(): Jukebox {
    return Jukebox.instance
  }

  public static getRakServer(): RakServer {
    return Jukebox.instance.server
  }

  public static getConfig(): Required<Config> {
    return Jukebox.instance.config
  }

  public static getLogger(): Logger {
    return Jukebox.instance.config.logger
  }

  public static getEncryption(): Encryption | null {
    return Jukebox.instance.encryption
  }

  public static getWorld(): World {
    return Jukebox.instance.world
  }
}

;(async () => {
  // node <file> <config>
  if (process.argv.length < 3) {
    console.error('Usage: node jukebox.js <config>')
    process.exit(1)
  }

  const configPath = resolve(process.argv[2])
  let config

  try {
    // TODO: Check config correctness
    config = await import(configPath)
  } catch (err) {
    console.error('Could not load the configuration file', err)
    process.exit(1)
  }

  new Jukebox((config as any).default)
})()
