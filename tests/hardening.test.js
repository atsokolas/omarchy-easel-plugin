// What the catalogue and the image service are trusted with: nothing. Ids
// are checked before they name a file or a URL, every download is capped
// while it streams, and every string reaches the screen as plain text. The
// shell commands run for real here, against a stand-in curl on PATH.

const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { spawnSync } = require("node:child_process")
const Model = require("../Model.js")

const IMG = "2c7e4b1a-6f0d-4a3e-9b8c-1d2e3f405a6b"
const ROOT = path.join(__dirname, "..")

// A home with a stand-in curl that ignores its arguments and prints
// $FAKE_BODY, so the cap, the checks and the rename are what is tested.
function sandbox() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "easel-test-"))
  const bin = path.join(home, "bin")
  fs.mkdirSync(bin)
  fs.writeFileSync(path.join(bin, "curl"), [
    "#!/bin/sh",
    "# Honours -o and --max-filesize the way curl does: stop at the cap, exit 63.",
    'out=; cap=; while [ $# -gt 0 ]; do case $1 in -o) out=$2; shift ;; --max-filesize) cap=$2; shift ;; esac; shift; done',
    'size=$(wc -c < "$FAKE_BODY")',
    'if [ -n "$cap" ] && [ "$size" -gt "$cap" ]; then head -c "$cap" "$FAKE_BODY" > "${out:-/dev/stdout}"; exit 63; fi',
    'cat "$FAKE_BODY" > "${out:-/dev/stdout}"'
  ].join("\n") + "\n", { mode: 0o755 })
  return { home, bin, done: () => fs.rmSync(home, { recursive: true, force: true }) }
}

function run(cmd, box, body) {
  const env = Object.assign({}, process.env, { PATH: box.bin + ":" + process.env.PATH, FAKE_BODY: body || "/dev/null" })
  return spawnSync(cmd[0], cmd.slice(1), { env, encoding: "utf8" })
}

function write(box, name, bytes) {
  const p = path.join(box.home, name)
  fs.writeFileSync(p, bytes)
  return p
}

// Starts like a JPEG and is long enough to be one; `file` finds no size in it.
function fakeJpeg(n) {
  const b = Buffer.alloc(n || 4096, 0x20)
  b[0] = 0xff; b[1] = 0xd8; b[2] = 0xff; b[3] = 0xe0
  return b
}

function leftovers(dir) {
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.startsWith(".fetch.")) : []
}

test("only the museum's own id grammar gets near a path or a URL", () => {
  for (const bad of ["../x", "../../.ssh/id", "a/b", "abc", "", IMG.toUpperCase(), IMG + "/..", " " + IMG, IMG + "\n"]) {
    assert.equal(Model.isImageId(bad), false, JSON.stringify(bad))
    assert.equal(Model.cachePath("/home/x", bad, 843), "", JSON.stringify(bad))
    assert.equal(Model.imageUrl(bad, 843), "", JSON.stringify(bad))
    // The catalogue's padding is trimmed first; anything else is dropped.
    if (bad.trim() !== IMG) assert.equal(Model.normalizeArtwork({ id: 1, image_id: bad }), null, JSON.stringify(bad))
  }
  assert.equal(Model.cachePath("/home/x", IMG, 843), "/home/x/.cache/omarchy/easel/" + IMG + "-843.jpg")
  assert.equal(Model.cachePath("", IMG, 843), "")
  assert.ok(Model.imageUrl(IMG, 843).startsWith(Model.IIIF_BASE + "/"))
})

test("artwork links stay on the museum's site", () => {
  for (const bad of ["1/../../x", "javascript:alert(1)", "-1", "12a", "https://example.com"])
    assert.equal(Model.pageUrl(bad), Model.SITE_BASE, bad)
  assert.equal(Model.normalizeArtwork({ id: "../x", image_id: IMG }).id, "")
  assert.deepEqual(Model.openCommand("../x"), ["xdg-open", Model.SITE_BASE])
})

test("an oversized search response is refused, not parsed", () => {
  const big = JSON.stringify({ data: [{ id: 1, image_id: IMG, title: "x".repeat(Model.MAX_JSON_BYTES) }] })
  const parsed = Model.parseSearch(big)
  assert.equal(parsed.ok, false)
  assert.equal(parsed.items.length, 0)
})

test("the search is capped while it streams and only goes to the museum", () => {
  const cmd = Model.curlJsonCommand(Model.searchUrl({ room: "", page: 1 }), 20)
  assert.equal(cmd[cmd.indexOf("--max-filesize") + 1], String(Model.MAX_JSON_BYTES))
  assert.equal(cmd[cmd.indexOf("--proto") + 1], "=https")
  assert.ok(cmd[cmd.length - 1].startsWith(Model.API_URL + "?"))
  assert.equal(Model.curlJsonCommand("https://example.com/?x", 20).slice(-1)[0], "https://invalid./")
})

// The cap itself is curl's, enforced on the bytes as they arrive. A local
// server sends a body with no length, and curl must stop at the cap.
test("curl stops an unsized download at the cap", () => {
  const server = spawnSync("sh", ["-c", "command -v python3"]).status === 0
  if (!server) return
  const script = [
    "import http.server, socketserver, sys",
    "class H(http.server.BaseHTTPRequestHandler):",
    "    def do_GET(self):",
    "        self.send_response(200); self.send_header('Connection', 'close'); self.end_headers()",
    "        try:",
    "            for i in range(64): self.wfile.write(b'a' * 65536)",
    "        except Exception: pass",
    "    def log_message(self, *a): pass",
    "s = socketserver.TCPServer(('127.0.0.1', 0), H); print(s.server_address[1], flush=True); s.handle_request()"
  ].join("\n")
  const r = spawnSync("sh", ["-c", 'python3 -I -c "$1" > "$2.port" & sleep 0.5; while [ ! -s "$2.port" ]; do sleep 0.1; done; ' +
    'curl -sS --max-filesize 262144 -o "$2" "http://127.0.0.1:$(cat "$2.port")/"; echo "exit=$? size=$(wc -c < "$2")"; wait',
    "sh", script, path.join(os.tmpdir(), "easel-cap-" + process.pid)], { encoding: "utf8", timeout: 20000 })
  assert.match(r.stdout, /exit=63 size=(\d+)/)
  assert.ok(Number(r.stdout.match(/size=(\d+)/)[1]) <= 262144)
  fs.rmSync(path.join(os.tmpdir(), "easel-cap-" + process.pid), { force: true })
  fs.rmSync(path.join(os.tmpdir(), "easel-cap-" + process.pid + ".port"), { force: true })
})

test("a picture lands in a private cache only after it checks out", () => {
  const box = sandbox()
  try {
    const out = Model.cachePath(box.home, IMG, 843)
    const r = run(Model.imageFetchCommand(box.home, IMG, 843, 45), box, write(box, "ok.jpg", fakeJpeg()))
    assert.equal(r.status, 0, r.stderr)
    assert.equal(fs.statSync(out).size, 4096)
    assert.equal(fs.statSync(Model.cacheDir(box.home)).mode & 0o777, 0o700)
    assert.deepEqual(leftovers(Model.cacheDir(box.home)), [])
  } finally { box.done() }
})

test("an oversized picture is cut off and leaves nothing behind", () => {
  const box = sandbox()
  try {
    const body = write(box, "big.jpg", fakeJpeg(Model.MAX_DISPLAY_BYTES + 8192))
    const r = run(Model.imageFetchCommand(box.home, IMG, 843, 45), box, body)
    assert.notEqual(r.status, 0)
    assert.equal(fs.existsSync(Model.cachePath(box.home, IMG, 843)), false)
    assert.deepEqual(leftovers(Model.cacheDir(box.home)), [])
    // The wallpaper render gets the larger cap, so the same bytes fit there.
    assert.equal(run(Model.imageFetchCommand(box.home, IMG, 2400, 90), box, body).status, 0)
  } finally { box.done() }
})

test("something that isn't a JPEG is refused", () => {
  const box = sandbox()
  try {
    const html = write(box, "page.html", "<html>" + " ".repeat(4096) + "</html>")
    assert.notEqual(run(Model.imageFetchCommand(box.home, IMG, 843, 45), box, html).status, 0)
    assert.notEqual(run(Model.imageFetchCommand(box.home, IMG, 843, 45), box, write(box, "tiny", fakeJpeg(40))).status, 0)
    assert.equal(fs.existsSync(Model.cachePath(box.home, IMG, 843)), false)
  } finally { box.done() }
})

test("a wallpaper far bigger than its box is refused", { skip: spawnSync("sh", ["-c", "command -v magick && command -v file"]).status !== 0 }, () => {
  const box = sandbox()
  try {
    const wide = path.join(box.home, "wide.jpg")
    assert.equal(spawnSync("magick", ["-size", "6000x10", "xc:gray", wide]).status, 0)
    assert.notEqual(run(Model.imageFetchCommand(box.home, IMG, 2400, 90), box, wide).status, 0)
    const fits = path.join(box.home, "fits.jpg")
    assert.equal(spawnSync("magick", ["-size", "2400x1600", "xc:gray", fits]).status, 0)
    assert.equal(run(Model.imageFetchCommand(box.home, IMG, 2400, 90), box, fits).status, 0)
  } finally { box.done() }
})

test("a symlinked cache, or a link planted at the name, is never written through", () => {
  const box = sandbox()
  try {
    const elsewhere = path.join(box.home, "elsewhere")
    fs.mkdirSync(elsewhere)
    fs.mkdirSync(path.join(box.home, ".cache/omarchy"), { recursive: true })
    fs.symlinkSync(elsewhere, Model.cacheDir(box.home))
    const body = write(box, "ok.jpg", fakeJpeg())
    assert.notEqual(run(Model.imageFetchCommand(box.home, IMG, 843, 45), box, body).status, 0)
    assert.deepEqual(fs.readdirSync(elsewhere), [])

    fs.unlinkSync(Model.cacheDir(box.home))
    fs.mkdirSync(Model.cacheDir(box.home))
    const victim = write(box, "victim", "keep me")
    const out = Model.cachePath(box.home, IMG, 843)
    fs.symlinkSync(victim, out)
    assert.equal(run(Model.imageFetchCommand(box.home, IMG, 843, 45), box, body).status, 0)
    assert.equal(fs.readFileSync(victim, "utf8"), "keep me")
    assert.equal(fs.lstatSync(out).isSymbolicLink(), false)
  } finally { box.done() }
})

test("a cached render is used only if it is still a sound JPEG", () => {
  const box = sandbox()
  try {
    const good = write(box, "good.jpg", fakeJpeg())
    assert.equal(run(Model.cachedCommand(good, 843), box).status, 0)
    for (const [name, bytes] of [["empty.jpg", ""], ["short.jpg", fakeJpeg(40)], ["huge.jpg", fakeJpeg(Model.MAX_DISPLAY_BYTES + 1)]]) {
      const p = write(box, name, bytes)
      assert.notEqual(run(Model.cachedCommand(p, 843), box).status, 0, name)
      assert.equal(fs.existsSync(p), false, name + " was kept")
    }
    const link = path.join(box.home, "link.jpg")
    fs.symlinkSync(good, link)
    assert.notEqual(run(Model.cachedCommand(link, 843), box).status, 0)
    assert.ok(fs.existsSync(good))
    assert.notEqual(run(Model.cachedCommand(path.join(box.home, "missing.jpg"), 843), box).status, 0)
  } finally { box.done() }
})

test("markup in the catalogue is shown as written", () => {
  const art = Model.normalizeArtwork({ id: 1, image_id: IMG, title: "<font color=red>Lilies</font>", artist_title: "<img src=x> & Co" })
  // The model leaves the words alone; the QML is what keeps them plain.
  assert.equal(art.title, "<font color=red>Lilies</font>")
  assert.equal(Model.caption(art), "<font color=red>Lilies</font> — <img src=x> & Co")
  // Notification bodies are markup by the spec, so the toast escapes them.
  const toast = Model.toastCommand(art)
  assert.equal(toast[toast.length - 1], "&lt;font color=red&gt;Lilies&lt;/font&gt; — &lt;img src=x&gt; &amp; Co")
})

test("every Text in the plugin renders plain text", () => {
  for (const file of fs.readdirSync(ROOT).filter(f => f.endsWith(".qml"))) {
    const src = fs.readFileSync(path.join(ROOT, file), "utf8")
    const blocks = src.split(/\bText \{/).slice(1)
    for (const block of blocks) assert.match(block.slice(0, 200), /textFormat: Text\.PlainText/, file)
    assert.doesNotMatch(src, /Text\.(RichText|StyledText|AutoText|MarkdownText)/, file)
  }
})

test("the panel decodes the picture no larger than its box", () => {
  const panel = fs.readFileSync(path.join(ROOT, "Panel.qml"), "utf8")
  assert.match(panel, /sourceSize\.width: Model\.DISPLAY_BOX/)
  assert.match(panel, /sourceSize\.height: Model\.DISPLAY_BOX/)
  assert.match(fs.readFileSync(path.join(ROOT, "BarWidget.qml"), "utf8"), /sourceSize\.height: \d+/)
})

test("h hangs the picture even though the key catcher claims it", () => {
  const panel = fs.readFileSync(path.join(ROOT, "Panel.qml"), "utf8")
  assert.match(panel, /Keys\.onPressed: function\(event\) \{ if \(event\.text === "h"[^}]*service\.hang\(\)/)
})

test("putting up a plain wallpaper has a command to run", () => {
  assert.deepEqual(Model.wallpaperCommand("/p.jpg"), ["omarchy-theme-bg-set", "/p.jpg"])
})
