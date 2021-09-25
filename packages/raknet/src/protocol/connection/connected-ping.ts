import { BinaryStream, WriteStream } from '@jukebox/binarystream'

import { Identifiers } from '../../identifiers'
import { Packet } from '../../packet'

export class ConnectedPing extends Packet {
  public timestamp: bigint

  public constructor() {
    super(Identifiers.CONNECTED_PING)
  }

  public encode(stream: WriteStream): void {
    stream.writeLong(this.timestamp)
  }

  public decode(stream: BinaryStream): void {
    this.timestamp = stream.readLong()
  }
}
