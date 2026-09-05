# Easel

A Quickshell bar plugin that hangs one public-domain artwork from the Art Institute of Chicago on your bar every day.

The bar shows the picture itself — a tiny framed canvas, roughly 14 pixels tall, that takes the shape of the work so a portrait reads as a portrait and a landscape as a landscape. Click it for the full plate and its wall label.

## Features

- **A piece a day** — a new work at local midnight, the same one all day on every monitor.
- **The wall label** — title, artist with dates, year, medium, dimensions, place of origin, and department.
- **Background** — hang today's piece as your desktop wallpaper; Easel fetches a 2400px render for it.
- **Open** — jump to the artwork's page at artic.edu.
- **Another** — draw a different piece without waiting for tomorrow.
- **A quiet toast** once a day announcing what went up. Shuffles and refreshes stay silent.

## How the day is chosen

Everything is derived from the date. The date seeds a *room* — one of twenty-eight subject queries, plus the collection's own highlights — and a page within it, and an index into that page. Same date in, same artwork out, which is why Easel keeps no state: it survives a shell restart, and a whole day offline after one successful fetch, without persisting anything.

Rooms exist only to widen the daily draw. The Art Institute's search endpoint refuses an offset past 1000, and its relevance ranking falls off well before that, so a single query would loop every couple of years and drag in near-duplicate print runs and Roman coins on the way. Twenty-eight rooms twenty pages deep keeps every candidate worth waking up to.

A room is a scoring hint, not a filter — the endpoint sorts the whole public-domain pool by it rather than narrowing it. So the room is never shown or claimed anywhere; the piece is described only by its own catalogue metadata.

Within the page, paintings, drawings, photographs, prints, textiles, sculpture, and mosaics are preferred. If a page holds none of those, whatever it does hold gets hung, so the day is never empty.

## Keys and clicks

| Where | Action |
|---|---|
| Bar, left | Open the panel |
| Bar, right | Another piece |
| Bar, middle | Refresh |
| Panel, click the picture | Open it at artic.edu |
| Panel, `n` | Another piece |
| Panel, `w` | Set as background |
| Panel, `o` | Open at artic.edu |
| Panel, `r` | Refresh |

## Settings

Inline on the bar entry in `~/.config/omarchy/shell.json`:

| Key | Default | What it does |
|---|---|---|
| `notify` | `true` | Send one notification a day when the new piece goes up |
| `showTitle` | `false` | Put the artist's name on the bar next to the canvas |

## IPC

```bash
omarchy-shell atsokolas.easel toggle
omarchy-shell atsokolas.easel shuffle
omarchy-shell atsokolas.easel wallpaper
omarchy-shell atsokolas.easel refresh
omarchy-shell atsokolas.easel status
```

`status` prints today's draw as JSON — the date, room, page, what is hanging, and where its file is. The bar is a layer surface, so on some sessions a screenshot cannot see it; this is the way to check what it is showing.

## Requirements

- Omarchy Quattro (Quickshell plugin support)
- `curl`
- Network access to `api.artic.edu` and `www.artic.edu`

Images are cached under `~/.cache/omarchy/easel/`, keyed by artwork and render width, so a day's picture is fetched once.

## Credits

Artwork data and images come from the [Art Institute of Chicago API](https://api.artic.edu/docs/). Easel only ever asks for works the museum marks as public domain. The image service requires callers to identify themselves, so requests carry an `AIC-User-Agent` header and nothing else about you.

## Tests

```bash
./tests/run
```

Covers the parts that are pure: the daily draw, paging limits, the search URL, parsing, preference fallback, cache paths, and the wall label.

## License

MIT
