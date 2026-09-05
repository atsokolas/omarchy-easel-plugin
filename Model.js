// Pure helpers for the Easel Omarchy plugin. QML imports this file; Node
// tests require the same exports at the bottom.

var APP_NAME = "Easel"
var API_URL = "https://api.artic.edu/api/v1/artworks/search"
var IIIF_BASE = "https://www.artic.edu/iiif/2"
var SITE_BASE = "https://www.artic.edu/artworks"
var CREDIT = "Art Institute of Chicago"

// The Art Institute serves the JSON to anyone but answers image requests
// with a 403 unless the caller names itself in this header.
var API_AGENT = "omarchy-easel/1.0"

// Both are the edge of a box the render is fitted inside, not a literal
// width. IIIF reads a bare `843,` as "make it exactly this wide" and the
// museum answers 403 rather than upscale a work whose source is smaller —
// which most prints and drawings are. `!w,h` fits inside and stops at the
// source, so a small work simply arrives small.
var DISPLAY_BOX = 843
var WALLPAPER_BOX = 2400
var BATCH = 15

// Two constraints shape the draw. The search endpoint refuses an offset
// past 1000, and relevance falls off a cliff long before that — the deep
// pages are near-duplicate print runs and Roman coins. Twenty pages keeps
// every candidate worth waking up to.
var PAGE_SPAN = 20

// `q` scores the public-domain pool rather than filtering it, so a room is
// really "the whole collection, sorted by how much it looks like this".
// Rooms exist to widen the daily draw past a single top-1000; the piece
// that lands is described by its own metadata, never by the room it came
// from, so a loose match is a happy accident rather than a wrong label.
var ROOMS = [
  "", "still life", "portrait", "landscape", "seascape", "night",
  "garden", "river", "winter", "dancer", "harbor", "flowers",
  "city street", "mountains", "interior", "horses", "reading",
  "self-portrait", "rain", "sunset", "market", "forest", "bridge",
  "cathedral", "music", "sleep", "windows", "bathers"
]

var FIELDS = [
  "id", "title", "artist_title", "artist_display", "date_display",
  "medium_display", "dimensions", "department_title", "place_of_origin",
  "artwork_type_title", "image_id", "thumbnail", "color"
]

// Everything here reproduces well at panel size. A batch with none of them
// falls back to whatever it does hold, so the day is never empty.
var PREFERRED_TYPES = [
  "Painting", "Drawing and Watercolor", "Photograph", "Print",
  "Textile", "Sculpture", "Mosaic"
]

function pad2(value) {
  var n = Number(value)
  if (!isFinite(n)) return "00"
  n = Math.floor(n)
  return n < 10 ? "0" + n : String(n)
}

function dateKeyFromDate(date) {
  var d = date instanceof Date ? date : new Date(date)
  if (isNaN(d.getTime())) return ""
  return String(d.getFullYear()) + pad2(d.getMonth() + 1) + pad2(d.getDate())
}

function parseDateKey(key) {
  var s = String(key || "")
  if (!/^\d{8}$/.test(s)) return null
  var d = new Date(Number(s.slice(0, 4)), Number(s.slice(4, 6)) - 1, Number(s.slice(6, 8)))
  return isNaN(d.getTime()) ? null : d
}

var MONTHS = ["January", "February", "March", "April", "May", "June", "July",
  "August", "September", "October", "November", "December"]
var DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

function dayHeading(key) {
  var d = parseDateKey(key)
  if (!d) return ""
  return DAYS[d.getDay()] + ", " + d.getDate() + " " + MONTHS[d.getMonth()]
}

// FNV-1a. Salted per field so the room, the page, and the pick move
// independently instead of sharing one number's low bits.
function hash32(value) {
  var s = String(value === null || value === undefined ? "" : value)
  var h = 0x811c9dc5
  for (var i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0
  }
  return h >>> 0
}

// The day is the only state Easel keeps. Same date in, same artwork out —
// which is what lets the plugin survive a shell restart, or a whole day
// offline after one successful fetch, without persisting anything.
function selectionForDay(dateKey, offset) {
  var seed = String(dateKey || "") + "#" + String(parseInt(offset, 10) || 0)
  return {
    seed: seed,
    room: ROOMS[hash32("room:" + seed) % ROOMS.length],
    page: 1 + (hash32("page:" + seed) % PAGE_SPAN),
    pick: hash32("pick:" + seed)
  }
}

function searchUrl(selection) {
  var sel = selection || {}
  var params = []
  var room = String(sel.room || "")
  if (room !== "") params.push("q=" + encodeURIComponent(room))
  params.push("query%5Bterm%5D%5Bis_public_domain%5D=true")
  params.push("fields=" + encodeURIComponent(FIELDS.join(",")))
  params.push("limit=" + BATCH)
  params.push("page=" + String(Math.max(1, parseInt(sel.page, 10) || 1)))
  return API_URL + "?" + params.join("&")
}

function imageUrl(imageId, box) {
  var id = String(imageId || "")
  if (id === "") return ""
  var b = Math.max(80, parseInt(box, 10) || DISPLAY_BOX)
  return IIIF_BASE + "/" + id + "/full/!" + b + "," + b + "/0/default.jpg"
}

function pageUrl(artworkId) {
  var id = String(artworkId || "")
  return id === "" ? SITE_BASE : SITE_BASE + "/" + id
}

function cacheDir(home) {
  return String(home || "") + "/.cache/omarchy/easel"
}

function cachePath(home, imageId, box) {
  var id = String(imageId || "")
  if (id === "") return ""
  var b = Math.max(80, parseInt(box, 10) || DISPLAY_BOX)
  return cacheDir(home) + "/" + id + "-" + b + ".jpg"
}

function text(value) {
  return String(value === null || value === undefined ? "" : value).replace(/^\s+|\s+$/g, "")
}

// artist_display carries the full attribution over several lines — name,
// nationality, dates. Flatten it for a single-line row.
function flatten(value) {
  return text(value).replace(/\s*\n\s*/g, " · ").replace(/\s{2,}/g, " ")
}

function normalizeArtwork(row) {
  if (!row || typeof row !== "object") return null
  var imageId = text(row.image_id)
  if (imageId === "") return null
  var thumb = row.thumbnail && typeof row.thumbnail === "object" ? row.thumbnail : {}
  var color = row.color && typeof row.color === "object" ? row.color : null
  return {
    id: String(row.id || ""),
    title: text(row.title) || "Untitled",
    artist: text(row.artist_title),
    artistDisplay: flatten(row.artist_display),
    date: text(row.date_display),
    medium: text(row.medium_display),
    dimensions: text(row.dimensions),
    department: text(row.department_title),
    origin: text(row.place_of_origin),
    type: text(row.artwork_type_title),
    imageId: imageId,
    altText: text(thumb.alt_text),
    aspect: Number(thumb.width) > 0 && Number(thumb.height) > 0
      ? Number(thumb.width) / Number(thumb.height)
      : 1,
    // The museum's own reading of the dominant colour, as HSL in degrees
    // and percent. Null when the catalogue has none.
    color: color && isFinite(Number(color.h))
      ? { h: Number(color.h), s: Number(color.s) || 0, l: Number(color.l) || 0 }
      : null
  }
}

function parseSearch(raw) {
  var body = text(raw)
  if (body === "") return { ok: false, error: "Empty response", items: [] }
  var parsed
  try {
    parsed = JSON.parse(body)
  } catch (e) {
    return { ok: false, error: "Could not read the collection", items: [] }
  }
  if (parsed && parsed.error) return { ok: false, error: text(parsed.detail) || text(parsed.error), items: [] }
  var rows = parsed && parsed.data instanceof Array ? parsed.data : null
  if (!rows) return { ok: false, error: "Could not read the collection", items: [] }
  var items = []
  for (var i = 0; i < rows.length; i++) {
    var art = normalizeArtwork(rows[i])
    if (art) items.push(art)
  }
  return { ok: true, error: "", items: items }
}

function preferredItems(items) {
  var all = items instanceof Array ? items : []
  var preferred = []
  for (var i = 0; i < all.length; i++) {
    if (PREFERRED_TYPES.indexOf(all[i].type) !== -1) preferred.push(all[i])
  }
  return preferred.length > 0 ? preferred : all
}

function pickArtwork(items, selection) {
  var pool = preferredItems(items)
  if (pool.length === 0) return null
  var pick = Number(selection && selection.pick)
  if (!isFinite(pick)) pick = 0
  return pool[Math.abs(Math.floor(pick)) % pool.length]
}

function curlJsonCommand(url, timeoutSec) {
  var timeout = String(Math.max(4, parseInt(timeoutSec, 10) || 20))
  return [
    "curl", "-fsS", "--max-time", timeout,
    "-H", "AIC-User-Agent: " + API_AGENT,
    "-H", "Accept: application/json",
    String(url || "")
  ]
}

function curlImageCommand(url, path, timeoutSec) {
  var timeout = String(Math.max(5, parseInt(timeoutSec, 10) || 45))
  return [
    "curl", "-fsS", "--max-time", timeout, "--create-dirs",
    "-H", "AIC-User-Agent: " + API_AGENT,
    "-o", String(path || ""),
    String(url || "")
  ]
}

// curl writes a zero-byte file before it has anything to write, so a
// truncated download leaves a valid-looking path behind. Re-fetch anything
// too small to be a JPEG rather than handing the shell a broken image.
function existsCommand(path) {
  return ["test", "-s", String(path || "")]
}

function openCommand(artworkId) {
  return ["xdg-open", pageUrl(artworkId)]
}

// ---- hanging the picture ---------------------------------------------------

var THEME_NAME = "easel"

function hex2(value) {
  var v = Math.max(0, Math.min(255, Math.round(value)))
  return (v < 16 ? "0" : "") + v.toString(16)
}

function hsl(h, s, l) {
  var hue = ((h % 360) + 360) % 360 / 360
  var sat = Math.max(0, Math.min(100, s)) / 100
  var light = Math.max(0, Math.min(100, l)) / 100
  function channel(t) {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  var q = light < 0.5 ? light * (1 + sat) : light + sat - light * sat
  var p = 2 * light - q
  return "#" + hex2(channel(hue + 1 / 3) * 255) + hex2(channel(hue) * 255) + hex2(channel(hue - 1 / 3) * 255)
}

// A dark palette built around the painting's dominant colour. The grounds
// take its hue at low saturation so the whole desktop sits inside the
// picture; the accent keeps the hue and enough chroma to read on the bar.
// The ANSI set stays where terminals expect it, tinted toward the painting.
function palette(color) {
  var c = color || { h: 40, s: 20, l: 50 }
  var h = c.h
  var s = Math.max(12, Math.min(70, c.s))
  var tint = Math.min(25, s)
  var accentL = Math.max(58, Math.min(70, c.l))
  return {
    mode: "dark",
    accent: hsl(h, Math.max(35, s), accentL),
    selection: hsl(h, tint, 18),
    muted: hsl(h, tint, 32),
    background: hsl(h, tint, 8),
    dark_background: hsl(h, tint, 5),
    darker_background: hsl(h, tint, 3),
    lighter_background: hsl(h, tint, 13),
    foreground: hsl(h, 12, 82),
    dark_foreground: hsl(h, 12, 48),
    light_foreground: hsl(h, 12, 88),
    bright_foreground: hsl(h, 12, 94),
    red: hsl(4, 62, 66), yellow: hsl(42, 66, 66), orange: hsl(24, 68, 64),
    green: hsl(120, 34, 60), cyan: hsl(186, 46, 58), blue: hsl(h, s, accentL),
    magenta: hsl(288, 40, 68), brown: hsl(24, 34, 38),
    bright_red: hsl(4, 76, 72), bright_yellow: hsl(42, 80, 72), bright_green: hsl(120, 48, 68),
    bright_cyan: hsl(186, 60, 66), bright_blue: hsl(h, Math.min(80, s + 15), Math.min(78, accentL + 8)),
    bright_magenta: hsl(288, 54, 76)
  }
}

// Omarchy's colors.toml, in the order the shipped themes use.
function colorsToml(color) {
  var p = palette(color)
  var groups = [
    ["mode"],
    ["accent", "selection", "muted"],
    ["background", "dark_background", "darker_background", "lighter_background"],
    ["foreground", "dark_foreground", "light_foreground", "bright_foreground"],
    ["red", "yellow", "orange", "green", "cyan", "blue", "magenta", "brown"],
    ["bright_red", "bright_yellow", "bright_green", "bright_cyan", "bright_blue", "bright_magenta"]
  ]
  var out = []
  for (var g = 0; g < groups.length; g++) {
    for (var i = 0; i < groups[g].length; i++) out.push(groups[g][i] + ' = "' + p[groups[g][i]] + '"')
    out.push("")
  }
  return out.join("\n")
}

function themeDir(home) {
  return String(home || "") + "/.config/omarchy/themes/" + THEME_NAME
}

// Writes the painting's theme — its colours and the picture as the only
// background — and asks Omarchy to wear it. Everything untrusted travels as
// a positional argument; the TOML is generated, never interpolated.
function hangCommand(home, art, imagePath) {
  var script =
    'mkdir -p "$1/backgrounds" || exit 1; ' +
    'rm -f "$1"/backgrounds/*; ' +
    'cp "$2" "$1/backgrounds/$3.jpg" || exit 1; ' +
    'printf %s "$4" > "$1/colors.toml" || exit 1; ' +
    'exec omarchy-theme-set "$5"'
  return ["sh", "-c", script, "sh", themeDir(home), String(imagePath || ""),
    String(art && art.imageId || "artwork"), colorsToml(art && art.color), THEME_NAME]
}

function notificationText(value) {
  var v = text(value).replace(/\s+/g, " ")
  if (v.length > 180) v = v.substring(0, 177) + "…"
  return v.charAt(0) === "-" ? "⁠" + v : v
}

function toastCommand(art) {
  if (!art) return null
  return [
    "omarchy-notification-send",
    "--app-name", APP_NAME,
    "-g", "🖼️",
    "-u", "low",
    notificationText("Today's artwork"),
    notificationText(caption(art))
  ]
}

function artistOf(art) {
  if (!art) return ""
  return art.artist !== "" ? art.artist : "Unknown artist"
}

// "The Child's Bath — Mary Cassatt, 1893"
function caption(art) {
  if (!art) return ""
  var line = art.title
  var who = artistOf(art)
  if (who !== "") line += " — " + who
  if (art.date !== "") line += ", " + art.date
  return line
}

function subtitle(art) {
  if (!art) return ""
  var who = artistOf(art)
  if (art.date === "") return who
  return who === "" ? art.date : who + ", " + art.date
}

function factRows(art) {
  if (!art) return []
  var candidates = [
    { label: "Artist", value: art.artistDisplay !== "" ? art.artistDisplay : art.artist },
    { label: "Date", value: art.date },
    { label: "Medium", value: art.medium },
    { label: "Size", value: art.dimensions },
    { label: "Origin", value: art.origin },
    { label: "Gallery", value: art.department }
  ]
  var rows = []
  for (var i = 0; i < candidates.length; i++) {
    if (candidates[i].value !== "") rows.push(candidates[i])
  }
  return rows
}

function statusLine(state) {
  var s = state || {}
  if (s.error) return s.error
  if (s.loading) return "Visiting the collection…"
  if (!s.art) return "Nothing hung yet"
  return CREDIT + " · public domain"
}

if (typeof module !== "undefined") {
  module.exports = {
    APP_NAME: APP_NAME,
    API_URL: API_URL,
    IIIF_BASE: IIIF_BASE,
    SITE_BASE: SITE_BASE,
    CREDIT: CREDIT,
    DISPLAY_BOX: DISPLAY_BOX,
    WALLPAPER_BOX: WALLPAPER_BOX,
    BATCH: BATCH,
    PAGE_SPAN: PAGE_SPAN,
    ROOMS: ROOMS,
    FIELDS: FIELDS,
    PREFERRED_TYPES: PREFERRED_TYPES,
    dateKeyFromDate: dateKeyFromDate,
    parseDateKey: parseDateKey,
    dayHeading: dayHeading,
    hash32: hash32,
    selectionForDay: selectionForDay,
    searchUrl: searchUrl,
    imageUrl: imageUrl,
    pageUrl: pageUrl,
    cacheDir: cacheDir,
    cachePath: cachePath,
    normalizeArtwork: normalizeArtwork,
    parseSearch: parseSearch,
    preferredItems: preferredItems,
    pickArtwork: pickArtwork,
    curlJsonCommand: curlJsonCommand,
    curlImageCommand: curlImageCommand,
    existsCommand: existsCommand,
    openCommand: openCommand,
    THEME_NAME: THEME_NAME,
    hsl: hsl,
    palette: palette,
    colorsToml: colorsToml,
    themeDir: themeDir,
    hangCommand: hangCommand,
    toastCommand: toastCommand,
    artistOf: artistOf,
    caption: caption,
    subtitle: subtitle,
    factRows: factRows,
    statusLine: statusLine
  }
}
