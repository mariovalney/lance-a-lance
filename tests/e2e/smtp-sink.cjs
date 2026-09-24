// A throwaway SMTP server that accepts anything and writes each message to a
// file, so the reset flow can be tested end to end without a real mailbox.
//
//   node tests/e2e/smtp-sink.cjs [port] [outfile]
//
// Speaks just enough of RFC 5321 for nodemailer: the greeting, EHLO, AUTH,
// MAIL FROM, RCPT TO, DATA and QUIT. No TLS, no real auth. Never point
// anything but a test at it.
const net = require("node:net");
const fs = require("node:fs");

const port = Number(process.argv[2] ?? 2525);
const outFile = process.argv[3] ?? "/tmp/smtp-sink.json";

const messages = [];

const server = net.createServer((socket) => {
  let buffer = "";
  let inData = false;
  let body = "";
  let envelope = { to: [] };

  const say = (line) => socket.write(line + "\r\n");
  say("220 sink ESMTP ready");

  socket.on("data", (chunk) => {
    buffer += chunk.toString("utf8");
    let index;
    while ((index = buffer.indexOf("\r\n")) !== -1) {
      const line = buffer.slice(0, index);
      buffer = buffer.slice(index + 2);

      if (inData) {
        if (line === ".") {
          inData = false;
          messages.push({ ...envelope, body, at: new Date().toISOString() });
          fs.writeFileSync(outFile, JSON.stringify(messages, null, 2));
          envelope = { to: [] };
          body = "";
          say("250 2.0.0 stored");
        } else {
          // Dot-stuffing: a leading dot in the body is doubled on the wire.
          body += (line.startsWith("..") ? line.slice(1) : line) + "\n";
        }
        continue;
      }

      const command = line.slice(0, 4).toUpperCase();
      if (command === "EHLO") say("250-sink\r\n250-AUTH PLAIN LOGIN\r\n250 8BITMIME");
      else if (command === "HELO") say("250 sink");
      else if (command === "AUTH") say("235 2.7.0 accepted");
      else if (command === "MAIL") {
        envelope.from = /<([^>]*)>/.exec(line)?.[1] ?? "";
        say("250 2.1.0 ok");
      } else if (command === "RCPT") {
        envelope.to.push(/<([^>]*)>/.exec(line)?.[1] ?? "");
        say("250 2.1.5 ok");
      } else if (command === "DATA") {
        inData = true;
        say("354 go ahead");
      } else if (command === "QUIT") {
        say("221 2.0.0 bye");
        socket.end();
      } else if (command === "RSET") {
        envelope = { to: [] };
        say("250 2.0.0 ok");
      } else {
        say("250 2.0.0 ok");
      }
    }
  });

  socket.on("error", () => undefined);
});

fs.writeFileSync(outFile, "[]");
server.listen(port, "127.0.0.1", () => console.log(`smtp sink on 127.0.0.1:${port} -> ${outFile}`));
