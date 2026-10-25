// 개발용: 마인크래프트 서버처럼 상태 응답만 하는 가짜 서버
const net = require('net');
const vi = (n) => { const o = []; do { let b = n & 0x7f; n >>>= 7; if (n) b |= 0x80; o.push(b); } while (n); return Buffer.from(o); };
const json = JSON.stringify({ version: { name: 'Paper 1.21.4', protocol: 769 }, players: { max: 50, online: 12 }, description: { text: '§b숨밈 테스트 서버' } });
net.createServer((s) => {
  s.once('data', () => {
    const str = Buffer.from(json, 'utf8');
    const body = Buffer.concat([vi(0), vi(str.length), str]);
    s.end(Buffer.concat([vi(body.length), body]));
  });
}).listen(Number(process.argv[2] || 25599), '127.0.0.1');
