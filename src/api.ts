import { Application, Router, RouterContext } from "oak";
import { oakCors } from "cors";
import fallback from "./fallback.json" assert { type: "json" };

const app = new Application();
const router = new Router();

app.addEventListener("listen", ({ hostname, port, secure }) => {
  console.log(
    `Listening on: ${secure ? "https://" : "http://"}${
      hostname ??
        "localhost"
    }:${port}`,
  );
});

app.addEventListener("error", (evt) => {
  console.log(evt.error);
});

router.get("/active", async (ctx: RouterContext) => {
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
  console.log(name);
  ctx.response.body = {
    window_name: name,
  };
});
// chromeからtmuxのwindowを切り替える
router.post("/switch", async (ctx: RouterContext) => {
  const body = ctx.request.body();
  const json = await body.value;
  const windowName = json.window_name;
  if (windowName) {
    Deno.run({ cmd: ["tmux", "selectw", "-t", windowName] });
  }
  ctx.response.body = "";
});
router.get("/fallback", (ctx: RouterContext) => {
  ctx.response.body = fallback;
});

app.use(oakCors());
app.use(router.routes());
app.use(router.allowedMethods());

await app.listen({ port: 9281 });
