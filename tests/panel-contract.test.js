const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const panel = fs.readFileSync(path.join(__dirname, "..", "Panel.qml"), "utf8")

test("panel uses the scoped bar API when changing hover reveal state", () => {
  assert.match(panel, /typeof root\.bar\.setCenterHoverRevealSuppressed === "function"/)
  assert.match(panel, /root\.bar\.setCenterHoverRevealSuppressed\(value\)/)
  assert.doesNotMatch(panel, /root\.bar\.centerHoverRevealSuppressed\s*=/)
})

test("colours come from the theme, not from surfaces plugins can't see", () => {
  // The shell's Color singleton isn't reliably there for third-party
  // plugins; reading its accent or urgent assigns undefined.
  for (const file of fs.readdirSync(path.join(__dirname, "..")).filter(f => f.endsWith(".qml")))
    assert.doesNotMatch(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), /Color\.(popups|accent|urgent)/, file)
})
