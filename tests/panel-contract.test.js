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
