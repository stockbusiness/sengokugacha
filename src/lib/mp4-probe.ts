// MP4(ISO BMFF)コンテナから、動画の長さ・解像度・音声トラック有無を取得する。
// ffmpeg等のネイティブバイナリに依存すると Vercel のサーバーレス環境で動かない
// リスクがあるため、moov/mvhd/tkhd/hdlr ボックスだけを読む最小限のパーサーとする。
// 解析に失敗した場合は例外を投げず null を返し、呼び出し側で「検証できないが
// アップロード自体は許可する」というフォールバックができるようにする。

export type Mp4Probe = {
  durationMs: number;
  width: number | null;
  height: number | null;
  hasAudio: boolean;
};

type Box = { type: string; start: number; end: number; payloadStart: number };

function readBoxes(buf: Buffer, start: number, end: number): Box[] {
  const boxes: Box[] = [];
  let offset = start;
  while (offset + 8 <= end) {
    let size = buf.readUInt32BE(offset);
    const type = buf.toString("ascii", offset + 4, offset + 8);
    let payloadStart = offset + 8;

    if (size === 1) {
      // 64bit extended size
      const high = buf.readUInt32BE(offset + 8);
      const low = buf.readUInt32BE(offset + 12);
      size = high * 2 ** 32 + low;
      payloadStart = offset + 16;
    } else if (size === 0) {
      size = end - offset;
    }

    if (size < 8 || offset + size > end) break;
    boxes.push({ type, start: offset, end: offset + size, payloadStart });
    offset += size;
  }
  return boxes;
}

function findBox(boxes: Box[], type: string): Box | undefined {
  return boxes.find((b) => b.type === type);
}

export function probeMp4(buf: Buffer): Mp4Probe | null {
  try {
    const topBoxes = readBoxes(buf, 0, buf.length);
    const moov = findBox(topBoxes, "moov");
    if (!moov) return null;

    const moovBoxes = readBoxes(buf, moov.payloadStart, moov.end);
    const mvhd = findBox(moovBoxes, "mvhd");
    if (!mvhd) return null;

    const version = buf.readUInt8(mvhd.payloadStart);
    let timescale: number;
    let duration: number;
    if (version === 1) {
      timescale = buf.readUInt32BE(mvhd.payloadStart + 20);
      const high = buf.readUInt32BE(mvhd.payloadStart + 24);
      const low = buf.readUInt32BE(mvhd.payloadStart + 28);
      duration = high * 2 ** 32 + low;
    } else {
      timescale = buf.readUInt32BE(mvhd.payloadStart + 12);
      duration = buf.readUInt32BE(mvhd.payloadStart + 16);
    }
    const durationMs = timescale > 0 ? Math.round((duration / timescale) * 1000) : 0;

    let width: number | null = null;
    let height: number | null = null;
    let hasAudio = false;

    for (const trak of moovBoxes.filter((b) => b.type === "trak")) {
      const trakBoxes = readBoxes(buf, trak.payloadStart, trak.end);
      const mdia = findBox(trakBoxes, "mdia");
      if (!mdia) continue;
      const mdiaBoxes = readBoxes(buf, mdia.payloadStart, mdia.end);
      const hdlr = findBox(mdiaBoxes, "hdlr");
      if (!hdlr) continue;
      const handlerType = buf.toString("ascii", hdlr.payloadStart + 8, hdlr.payloadStart + 12);

      if (handlerType === "soun") {
        hasAudio = true;
      } else if (handlerType === "vide" && width == null) {
        const tkhd = findBox(trakBoxes, "tkhd");
        if (tkhd) {
          const tkhdVersion = buf.readUInt8(tkhd.payloadStart);
          const widthOffset = tkhdVersion === 1 ? tkhd.payloadStart + 88 : tkhd.payloadStart + 76;
          // 16.16 fixed-point。上位16bitが整数部。
          width = buf.readUInt16BE(widthOffset);
          height = buf.readUInt16BE(widthOffset + 4);
        }
      }
    }

    return { durationMs, width, height, hasAudio };
  } catch {
    return null;
  }
}
