import { Jukebox } from '@jukebox/core'
import { createSocket, RemoteInfo, Socket as DSocket } from 'dgram'
import { BinaryStream } from '@jukebox/binarystream'
import { Identifiers } from './identifiers'
import { join } from 'path'
import { promisify } from 'util'
import { readdir } from 'fs'
import { IPacketConstructor, Datagram } from './packet'
import { RakNetSession } from './session'

export class Socket {
  private static socket: DSocket
  private static handlers: Map<number, IPacketConstructor> = new Map<
    number,
    IPacketConstructor
  >()
  //private static packetsList: Map<number, Object>

  // imports all files from the src/packets folder
  // and adds them to the handling map
  private async loadPackets() {
    try {
      const dir = join(__dirname, 'packets')
      const files = await promisify(readdir)(dir)

      const imports = await Promise.all(
        files
          .filter(filename => filename.endsWith('.js'))
          .map(filename => join(dir, filename))
          .map(async filepath => import(filepath))
      )

      imports
        .map(i => i.default)
        // Ignore modules that don't export a default class
        // and packets with undefined `pid`
        .filter(i => !!i && i.pid != Identifiers.ID_NOT_SET)
        .forEach(i =>
          Socket.handlers.set(i.pid as number, i as IPacketConstructor)
        )

      Jukebox.getLogger().info(`Loaded ${Socket.handlers.size} handlers`)
    } catch (err) {
      Jukebox.getLogger().fatal('Could not load packets', err)
    }
  }

  private handle(msg: Buffer, rinfo: RemoteInfo) {
    let [stream, pid] = [new BinaryStream(msg), msg[0]]
    Jukebox.getLogger().debug(
      `Recived a packet from ${rinfo.address}:${rinfo.port} with id: ${pid} and lentgh of ${msg.length}!`
    )

    if (Socket.handlers.has(pid)) {
      const packetClass = Socket.handlers.get(pid)
      if (packetClass == undefined) {
        Jukebox.getLogger().fatal('Found an undefined handler, quitting')
        return // useless but it's to make typescript happy
      }
      const packet = new packetClass(rinfo, stream)
      packet.encode()
      Socket.sendBuffer(packet.getBuffer(), rinfo.port, rinfo.address)
    } else if (RakNetSession.sessions.has(rinfo.address)) {
      // handle encapsulated packets
      let session = RakNetSession.sessions.get(rinfo.address)
      if (session instanceof RakNetSession) {
        session.handlePacket(rinfo, new Datagram(rinfo, stream))
      }
    } else {
      Jukebox.getLogger().debug(`Unhandled packet with id ${pid}`)
    }
  }

  constructor() {
    this.loadPackets()

    Socket.socket = createSocket('udp4').on('error', err => {
      Jukebox.getLogger().fatal(`Could not listen on :${port}`, err)
      Socket.socket.close()
    })

    const { port } = Jukebox.getConfig().server
    Socket.socket.bind(port, () =>
      Jukebox.getLogger().info(`Listening on :${port}`)
    )

    Socket.socket.on('message', this.handle.bind(this))
  }

  public static getSocket(): DSocket {
    return Socket.socket
  }

  //public static getPacketsList(): Map<number, Object> {
  //return this.packetsList
  //}

  public static sendBuffer(buffer: Buffer, port: number, address: string) {
    Socket.socket.send(buffer, 0, buffer.length, port, address)
  }
}
