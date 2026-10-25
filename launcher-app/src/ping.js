// 마인크래프트 서버 상태 조회 (Server List Ping, 1.7+ 방식)
// 서버 목록 화면에서 접속자 수를 보여줄 때 쓰는 것과 같은 방식이에요.
const net = require('net');

function varInt(n) {
  const out = [];
  let v = n >>> 0;
  do {
    let b = v & 0x7f;
    v >>>= 7;
    if (v !== 0) b |= 0x80;
    out.push(b);
  } while (v !== 0);
  return Buffer.from(out);
}

function readVarInt(buf, offset) {
  let num = 0;
  let shift = 0;
  let pos = offset;
  while (true) {
    if (pos >= buf.length) return null; // 아직 다 안 받음
    const b = buf[pos++];
    num |= (b & 0x7f) << shift;
    if ((b & 0x80) === 0) break;
    shift += 7;
    if (shift > 35) throw new Error('VarInt too big');
  }
  return { value: num, size: pos - offset };
}

function packet(id, payload) {
  const body = Buffer.concat([varInt(id), payload]);
  return Buffer.concat([varInt(body.length), body]);
}

function mcString(s) {
  const b = Buffer.from(s, 'utf8');
  return Buffer.concat([varInt(b.length), b]);
}

function motdText(desc) {
  if (!desc) return '';
  if (typeof desc === 'string') return desc;
  let s = desc.text || '';
  if (Array.isArray(desc.extra)) s += desc.extra.map(motdText).join('');
  return s;
}

function ping(host, port = 25565, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const started = Date.now();
    const socket = net.createConnection({ host, port });
    let buf = Buffer.alloc(0);
    let done = false;
    let statusJson = null;

    const finish = (result) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeoutMs, () => finish({ online: false, error: 'timeout' }));
    socket.on('error', (e) => finish({ online: false, error: e.code || e.message }));

    socket.on('connect', () => {
      const portBuf = Buffer.alloc(2);
      portBuf.writeUInt16BE(port);
      // 핸드셰이크 (protocol -1 = 상태 조회용), 다음 상태 1 = status
      socket.write(packet(0x00, Buffer.concat([varInt(-1), mcString(host), portBuf, varInt(1)])));
      socket.write(packet(0x00, Buffer.alloc(0)));
    });

    socket.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      try {
        while (true) {
          const len = readVarInt(buf, 0);
          if (!len || buf.length < len.size + len.value) return;
          const body = buf.subarray(len.size, len.size + len.value);
          buf = buf.subarray(len.size + len.value);
          const id = readVarInt(body, 0);
          if (id.value === 0x00 && !statusJson) {
            const strLen = readVarInt(body, id.size);
            const start = id.size + strLen.size;
            statusJson = JSON.parse(body.subarray(start, start + strLen.value).toString('utf8'));
            const latency = Date.now() - started;
            finish({
              online: true,
              players: statusJson.players ? statusJson.players.online : 0,
              max: statusJson.players ? statusJson.players.max : 0,
              version: statusJson.version ? statusJson.version.name : '',
              motd: motdText(statusJson.description).replace(/§./g, ''),
              latency,
            });
            return;
          }
        }
      } catch (e) {
        finish({ online: false, error: 'bad_response' });
      }
    });
  });
}

module.exports = { ping };
