# Easel

A Quickshell bar plugin that hangs one public-domain artwork from the Art Institute of Chicago on your bar every day.

The bar shows the picture itself — a tiny framed canvas, roughly 14 pixels tall, that takes the shape of the work so a portrait reads as a portrait and a landscape as a landscape. Click it for the full plate and its wall label.

## Features

- **A piece a day** — a new work at local midnight, the same one all day on every monitor.
- **The wall label** — title, artist with dates, year, medium, dimensions, place of origin, and department.
- **Hang** — put today's piece on the desktop at 2400px *and* dress the desktop in its colours: Easel writes an Omarchy theme from the painting's dominant colour and wears it. Turn `recolor` off for the plain wallpaper.
- **Open** — jump to the artwork's page at artic.edu.
- **Another** — draw a different piece without waiting for tomorrow.
- **A quiet toast** once a day announcing what went up. Shuffles and refreshes stay silent.

## Details

A new picture is hung, not swapped: the old canvas lifts off the wall before the new one drops onto its nail and settles. It hangs from that nail, too — hover and it swings, then comes to rest.

The frame is chosen for the picture: the museum records each work's dominant colour, and the bar frame and the panel's mat take that hue, quietened. The wall label ends the way a real one does, with the accession number.

## Install

```bash
omarchy plugin add https://github.com/atsokolas/omarchy-easel-plugin.git --enable
```

That clones the plugin into `~/.config/omarchy/plugins/atsokolas.easel`, validates it against the shell's manifest schema, and puts it on the bar. Move it if it did not land where you want:

```bash
omarchy bar move atsokolas.easel --section right --before omarchy.network
```

## How the day is chosen

Everything is derived from the date. The date seeds a *room* — one of twenty-eight subject queries, plus the collection's own highlights — and a page within it, and an index into that page. Same date in, same artwork out, which is why Easel keeps no state: it survives a shell restart, and a whole day offline after one successful fetch, without persisting anything.

Rooms exist only to widen the daily draw. The Art Institute's search endpoint refuses an offset past 1000, and its relevance ranking falls off well before that, so a single query would loop every couple of years and drag in near-duplicate print runs and Roman coins on the way. Twenty-eight rooms twenty pages deep keeps every candidate worth waking up to.

A room is a scoring hint, not a filter — the endpoint sorts the whole public-domain pool by it rather than narrowing it. So the room is never shown or claimed anywhere; the piece is described only by its own catalogue metadata.

Within the page, paintings, drawings, photographs, prints, textiles, sculpture, and mosaics are preferred. If a page holds none of those, whatever it does hold gets hung, so the day is never empty.

## Hanging the picture

The museum records a dominant colour for most works. Hanging builds a dark palette around that hue — the grounds take it at low saturation, the accent keeps its chroma — writes it as a user theme at `~/.config/omarchy/themes/easel/` with the picture as the theme's only background, and runs `omarchy-theme-set easel`. Switch back to any other theme the usual way; the `easel` theme stays behind until the next hang overwrites it.

## Keys and clicks

| Where | Action |
|---|---|
| Bar, left | Open the panel |
| Bar, right | Another piece |
| Bar, middle | Refresh |
| Panel, click the picture | Open it at artic.edu |
| Panel, `n` | Another piece |
| Panel, `h` | Hang it |
| Panel, `c` | Copy the caption, medium, and page to the clipboard |
| Panel, `o` | Open at artic.edu |
| Panel, `r` | Refresh |

## Settings

Inline on the bar entry in `~/.config/omarchy/shell.json`:

| Key | Default | What it does |
|---|---|---|
| `notify` | `true` | Send one notification a day when the new piece goes up |
| `showTitle` | `false` | Put the artist's name on the bar next to the canvas |
| `recolor` | `true` | Hanging a picture recolours the desktop to match it |

## IPC

```bash
omarchy-shell atsokolas.easel toggle
omarchy-shell atsokolas.easel shuffle
omarchy-shell atsokolas.easel hang
omarchy-shell atsokolas.easel copy
omarchy-shell atsokolas.easel refresh
omarchy-shell atsokolas.easel status
```

`status` prints today's draw as JSON — the date, room, page, what is hanging, its dominant colour, and where its file is. The bar is a layer surface, so on some sessions a screenshot cannot see it; this is the way to check what it is showing.

## Requirements

- Omarchy Quattro (Quickshell plugin support)
- `curl`
- Network access to `api.artic.edu` and `www.artic.edu`

Images are cached under `~/.cache/omarchy/easel/`, keyed by artwork and render width, so a day's picture is fetched once.

## Data

Artwork data and images come from the [Art Institute of Chicago API](https://api.artic.edu/docs/). Easel only ever asks for works the museum marks as public domain. The image service requires callers to identify themselves, so requests carry an `AIC-User-Agent` header and nothing else about you. Easel writes only its own theme directory and, when you change a setting, its own widget entry in `shell.json`.

## Tests

```bash
./tests/run
```

Covers the parts that are pure: the daily draw, paging limits, the search URL, parsing, preference fallback, cache paths, the wall label, and the palette.

## Remove

```bash
omarchy plugin disable atsokolas.easel
omarchy plugin remove atsokolas.easel --yes
rm -rf ~/.config/omarchy/themes/easel   # if you ever hung a picture
```

## License

MIT
