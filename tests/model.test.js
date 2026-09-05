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
