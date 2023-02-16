import { serve } from "std/http/server.ts";
import { Server } from "socket.io";

const io = new Server({
  cors: {
    origin: [
      "chrome-extension://gnamlmikgmaojlmahgcdopbmdfpibhfk",
    ],
  },
});
const getActiveWindow = async () => {
  const p = Deno.run({ cmd: ["tmux", "lsw"], stdout: "piped" });
  await p.status();
  const stdout = new TextDecoder().decode(await p.output());
  const lines = stdout.split("\n");
  const activeLine = lines.find((line) => line.includes("(active)"));
  const windowNameMatcher =
    /(?<index>[0-9]{1}): (?<name>[\w/:%#\$&\?~\.=\+\-]+)(?<prefix>\*?Z?) \((?<panel>[0-9]{1}) panes\)/;
  const groups = activeLine?.match(windowNameMatcher)?.groups;
  const name = groups?.name;
  if (!name) console.warn("nameが取得できませんでした", activeLine, name);
  return name;
};
io.on("connection", async (socket) => {
  console.log(`socket ${socket.id} connected`);

  const name = await getActiveWindow();
  console.log(name);
  // window名を送信
  socket.emit("tmux", name);

  socket.on("disconnect", (reason) => {
    console.log(`socket ${socket.id} disconnected due to ${reason}`);
  });
});

await serve(io.handler(), {
  port: 4000,
});
