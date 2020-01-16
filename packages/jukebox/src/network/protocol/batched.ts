import { Datagram } from './datagram'
import { BinaryStream } from '@jukebox/binarystream'
import { Jukebox } from '../../jukebox'
import * as Zlib from 'zlib' // https://github.com/nodeca/pako
import { PacketHandler } from '../packet-handler'
import { RemoteInfo } from 'dgram'
import { McpeLogin } from '../packets/mcpe-login'

export class Batched extends Datagram {
  public pid: number = 0xfe

  public allowBatching: boolean = false
  public allowBeforeLogin: boolean = true
  protected compressionLevel: number = 7

  public payload = new BinaryStream()

  public decodeHeader() {
    let decodedPID = this.getByte()
    if (decodedPID !== this.pid) {
      Jukebox.getLogger().error(
        `Got a packet with wrong PID, expecting: ${this.pid}, got: ${decodedPID}!`
      )
    }
  }

  public decodePayload() {
    let packedData = this.getRemaining()
    this.payload = new BinaryStream(Zlib.unzipSync(packedData))
  }

  public encodeHeader() {
    this.putByte(this.pid)
  }

  public encodePayload() {
    let packedData = Zlib.deflateSync(this.payload.getBuffer(), {
      level: this.compressionLevel,
    })
    this.append(packedData)
  }

  public handle(rinfo: RemoteInfo, packetHandler: PacketHandler) {
    // make a packet pool or something
    // to create packet by packet id, so get packet class
    // and set to packet class the buffer given
    if (this.payload.getBuffer().length === 0) {
      return
    }

    let pid = this.getBuffer()[0]

    let pk = McpeLogin

    if (pk instanceof Datagram) {
      if (!pk.allowBatching) {
        Jukebox.getLogger().error(`Invalid batched ${pk.getName()}`)
      }

      pk.setBuffer(this.getBuffer(), 1)
      packetHandler.handleDatagram(pk)
    }
    if (pid === 0x01) {
    }
  }
}
