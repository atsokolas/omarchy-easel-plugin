const test = require("node:test")
const assert = require("node:assert/strict")
const Model = require("../Model.js")

function searchBody(rows) {
  return JSON.stringify({ pagination: { total: 62054 }, data: rows })
}

function row(overrides) {
  return Object.assign({
    id: 111442,
    title: "The Child's Bath",
    artist_title: "Mary Cassatt",
    artist_display: "Mary Cassatt\nAmerican, 1844-1926",
    date_display: "1893",
    medium_display: "Oil on canvas",
    dimensions: "100.3 x 66.1 cm",
    department_title: "Arts of the Americas",
    place_of_origin: "France",
    artwork_type_title: "Painting",
    image_id: "3b885ae0",
    thumbnail: { width: 8470, height: 12853, alt_text: "A mother washing a child's feet." }
  }, overrides)
}

test("the day is the only state: same date picks the same piece", () => {
  const a = Model.selectionForDay("20260905", 0)
  const b = Model.selectionForDay("20260905", 0)
  assert.deepEqual(a, b)
  assert.notDeepEqual(a, Model.selectionForDay("20260906", 0))
  assert.notDeepEqual(a, Model.selectionForDay("20260905", 1))
})

test("every draw lands inside the collection's paging limits", () => {
  for (let d = 1; d <= 400; d++) {
    const key = Model.dateKeyFromDate(new Date(2026, 0, d))
    const sel = Model.selectionForDay(key, d % 3)
    assert.ok(Model.ROOMS.indexOf(sel.room) !== -1, `unknown room for ${key}`)
    assert.ok(sel.page >= 1 && sel.page <= Model.PAGE_SPAN, `page ${sel.page} out of range`)
  }
})

test("search stays inside the public domain and asks for one batch", () => {
  const url = Model.searchUrl({ room: "still life", page: 6 })
  assert.match(url, /^https:\/\/api\.artic\.edu\/api\/v1\/artworks\/search\?/)
  assert.match(url, /q=still%20life/)
  assert.match(url, /query%5Bterm%5D%5Bis_public_domain%5D=true/)
  assert.match(url, /limit=15/)
  assert.match(url, /page=6/)
  // The highlights room carries no query at all.
  assert.ok(!Model.searchUrl({ room: "", page: 1 }).includes("q="))
})

test("parseSearch drops rows with no image and reports API errors", () => {
  const parsed = Model.parseSearch(searchBody([row(), row({ id: 2, image_id: null })]))
  assert.equal(parsed.ok, true)
  assert.equal(parsed.items.length, 1)
  assert.equal(parsed.items[0].artist, "Mary Cassatt")
  assert.equal(parsed.items[0].artistDisplay, "Mary Cassatt · American, 1844-1926")
  assert.ok(parsed.items[0].aspect < 1, "portrait aspect")

  const failed = Model.parseSearch(JSON.stringify({ status: 403, error: "Invalid number of results", detail: "Too many" }))
  assert.equal(failed.ok, false)
  assert.equal(failed.error, "Too many")
  assert.equal(Model.parseSearch("<html>").ok, false)
})

test("a batch of coins still yields something rather than nothing", () => {
  const coins = [row({ id: 3, artwork_type_title: "Coin" }), row({ id: 4, artwork_type_title: "Vessel" })]
  const mixed = coins.concat([row({ id: 5, artwork_type_title: "Painting" })])
  assert.equal(Model.preferredItems(Model.parseSearch(searchBody(mixed)).items).length, 1)
  assert.equal(Model.preferredItems(Model.parseSearch(searchBody(coins)).items).length, 2)
  assert.equal(Model.pickArtwork([], { pick: 7 }), null)
})

test("picking is stable for a seed and spreads across the batch", () => {
  const items = Model.parseSearch(searchBody([1, 2, 3, 4, 5].map(n => row({ id: n })))).items
  const seen = new Set()
  for (let i = 0; i < 40; i++) {
    const sel = Model.selectionForDay("2026090" + (i % 10), i)
    const first = Model.pickArtwork(items, sel)
    assert.equal(Model.pickArtwork(items, sel).id, first.id)
    seen.add(first.id)
  }
  assert.ok(seen.size > 1, "every seed picked the same index")
})

test("renders are fitted inside a box so small works are never upscaled", () => {
  // A bare `843,` asks the museum to upscale anything narrower and it
  // answers 403; `!843,843` fits inside and stops at the source.
  assert.equal(Model.imageUrl("abc", 843), "https://www.artic.edu/iiif/2/abc/full/!843,843/0/default.jpg")
  assert.equal(Model.cachePath("/home/x", "abc", 2400), "/home/x/.cache/omarchy/easel/abc-2400.jpg")
  assert.equal(Model.imageUrl("", 843), "")
  assert.equal(Model.cachePath("/home/x", "", 843), "")
  assert.equal(Model.pageUrl(111442), "https://www.artic.edu/artworks/111442")
})

test("the museum needs to be told who is asking for pictures", () => {
  assert.ok(Model.curlImageCommand("u", "/tmp/p").includes("AIC-User-Agent: omarchy-easel/1.0"))
  assert.ok(Model.curlImageCommand("u", "/tmp/p").includes("--create-dirs"))
  assert.ok(Model.curlJsonCommand("u").includes("AIC-User-Agent: omarchy-easel/1.0"))
})

test("wall label reads like a wall label", () => {
  const art = Model.parseSearch(searchBody([row()])).items[0]
  assert.equal(Model.caption(art), "The Child's Bath — Mary Cassatt, 1893")
  assert.equal(Model.subtitle(art), "Mary Cassatt, 1893")
  assert.equal(Model.artistOf({ artist: "", date: "" }), "Unknown artist")
  const labels = Model.factRows(art).map(r => r.label)
  assert.deepEqual(labels, ["Artist", "Date", "Medium", "Size", "Origin", "Gallery"])
  // Rows with nothing to say are left off the label entirely.
  assert.deepEqual(Model.factRows(Object.assign({}, art, { medium: "", dimensions: "", origin: "" })).map(r => r.label),
    ["Artist", "Date", "Gallery"])
})

test("dayHeading names the day on the local calendar", () => {
  assert.equal(Model.dateKeyFromDate(new Date(2026, 8, 5)), "20260905")
  assert.equal(Model.dayHeading("20260905"), "Saturday, 5 September")
  assert.equal(Model.dayHeading("nonsense"), "")
})

test("the catalogue's dominant colour rides along as HSL", () => {
  const withColor = Model.normalizeArtwork({ id: 1, image_id: "img", color: { h: 39, s: 24, l: 59, population: 263 } })
  assert.deepEqual(withColor.color, { h: 39, s: 24, l: 59 })
  assert.equal(Model.normalizeArtwork({ id: 2, image_id: "img", color: null }).color, null)
  assert.equal(Model.normalizeArtwork({ id: 3, image_id: "img" }).color, null)
  assert.ok(Model.FIELDS.includes("color"))
})

test("hsl converts the corners the way a browser would", () => {
  assert.equal(Model.hsl(0, 100, 50), "#ff0000")
  assert.equal(Model.hsl(120, 100, 25), "#008000")
  assert.equal(Model.hsl(240, 100, 50), "#0000ff")
  assert.equal(Model.hsl(0, 0, 50), "#808080")
  assert.equal(Model.hsl(360 + 39, 24, 59), Model.hsl(39, 24, 59))
})

test("a palette keeps the painting's hue and stays dark and legible", () => {
  const p = Model.palette({ h: 39, s: 24, l: 59 })
  assert.equal(p.mode, "dark")
  // Grounds are dark, foregrounds light, in every case.
  for (const key of ["background", "dark_background", "darker_background", "lighter_background"]) {
    assert.ok(parseInt(p[key].slice(1, 3), 16) < 0x40, `${key} is not dark: ${p[key]}`)
  }
  assert.ok(parseInt(p.foreground.slice(1, 3), 16) > 0xb0)
  // A grey painting still gets a coloured accent, and a garish one is tamed.
  assert.notEqual(Model.palette({ h: 200, s: 0, l: 50 }).accent, Model.palette({ h: 200, s: 0, l: 50 }).foreground)
  assert.equal(Model.palette({ h: 0, s: 100, l: 50 }).accent, Model.palette({ h: 0, s: 70, l: 58 }).accent)
  // No catalogue colour at all still produces a theme.
  assert.ok(/^#[0-9a-f]{6}$/.test(Model.palette(null).accent))
})

test("colors.toml carries every key Omarchy's themes define", () => {
  const toml = Model.colorsToml({ h: 39, s: 24, l: 59 })
  const keys = ["mode", "accent", "selection", "muted", "background", "dark_background", "darker_background",
    "lighter_background", "foreground", "dark_foreground", "light_foreground", "bright_foreground",
    "red", "yellow", "orange", "green", "cyan", "blue", "magenta", "brown",
    "bright_red", "bright_yellow", "bright_green", "bright_cyan", "bright_blue", "bright_magenta"]
  for (const key of keys) assert.match(toml, new RegExp(`^${key} = "`, "m"), `missing ${key}`)
  assert.match(toml, /^mode = "dark"$/m)
})

test("hanging writes a user theme and wears it, with nothing interpolated", () => {
  const art = { imageId: "abc-123", color: { h: 39, s: 24, l: 59 } }
  const cmd = Model.hangCommand("/home/me", art, "/home/me/.cache/omarchy/easel/abc-123-2400.jpg")
  assert.equal(cmd[0], "sh")
  assert.equal(cmd[4], "/home/me/.config/omarchy/themes/easel")
  assert.equal(cmd[5], "/home/me/.cache/omarchy/easel/abc-123-2400.jpg")
  assert.equal(cmd[6], "abc-123")
  assert.match(cmd[7], /^mode = "dark"/)
  assert.equal(cmd[8], "easel")
  assert.match(cmd[2], /omarchy-theme-set "\$5"$/)
  assert.ok(!cmd[2].includes("abc-123"))
  assert.equal(Model.themeDir("/home/me"), "/home/me/.config/omarchy/themes/easel")
})
