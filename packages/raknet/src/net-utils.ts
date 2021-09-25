import { assert } from 'console'
import { RemoteInfo } from 'dgram'

import { BinaryStream, WriteStream } from '@jukebox/binarystream'

import { Info } from './info'

export class NetUtils {
  public static readString(stream: BinaryStream): string {
    const length = stream.readUnsignedShort()
    const data = stream.read(length)
    return data.toString('utf-8')
  }

  public static writeString(stream: WriteStream, v: string): void {
    const data = Buffer.from(v, 'utf-8')
    stream.writeUnsignedShort(data.length)
    stream.write(data)
  }

  public static readAddress(stream: BinaryStream): RemoteInfo {
    const version = stream.readByte()
    if (version == 4) {
      const complement = ~stream.readUnsignedInt()
      const hostname = `${(complement >> 24) & 0xff}.${
        (complement >> 16) & 0xff
      }.${(complement >> 8) & 0xff}.${complement & 0xff}`
      const port = stream.readUnsignedShort()
      return { address: hostname, port: port, family: 'IPv4' } as RemoteInfo
    } else {
      stream.skip(2)
      const port = stream.readUnsignedShort()
      stream.skip(4)
      const hostname = stream.read(16).toString()
      stream.skip(4)
      return { address: hostname, port: port, family: 'IPv6' } as RemoteInfo
    }
  }

  public static writeAddress(stream: WriteStream, rinfo: RemoteInfo): void {
    assert(['IPv4', 'IPv6'].includes(rinfo.family), {
      family: rinfo.family,
      error: 'Unknown address family',
    })
    stream.writeByte(rinfo.family === 'IPv4' ? Info.IPV4 : Info.IPV6)
    if (rinfo.family === 'IPv4') {
      const splittedAddress = rinfo.address.split('.', 4)
      for (const split of splittedAddress) {
        stream.writeByte(-split - 1)
      }
      stream.writeUnsignedShort(rinfo.port)
    } else if (rinfo.family === 'IPv6') {
      // TODO: support IPv6
      // stream.writeLShort(Info.AF_INET6)
      stream.writeUnsignedShort(rinfo.port)
      stream.writeInt(0) // Flow info
      NetUtils.writeString(stream, rinfo.address)
      stream.writeInt(0) // Scope ID
    }
  }

  public static readMagic(stream: BinaryStream): Buffer {
    const magic = stream.read(16)
    assert(Info.MAGIC.equals(magic), 'RakNet magic is not correct')
    return magic
  }

  public static writeMagic(stream: WriteStream): void {
    stream.write(Info.MAGIC)
  }
}
