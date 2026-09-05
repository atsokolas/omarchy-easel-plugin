import QtQuick
import Quickshell
import Quickshell.Io
import "Model.js" as Model

// One engine per shell. Every bar — one per monitor — reads this instance,
// so the collection is visited once a day rather than once a day per screen,
// and every bar hangs the same picture.
Item {
  id: root

  property var shell: null
  property var settings: ({})
  property bool active: true

  readonly property string home: Quickshell.env("HOME") || ""

  property string dateKey: Model.dateKeyFromDate(new Date())
  // Bumped by "another piece"; back to zero when the day turns over.
  property int offset: 0

  property var art: null
  property string imagePath: ""
  property bool loading: false
  property string error: ""

  property bool hanging: false
  property string hangError: ""

  readonly property bool notify: setting("notify", true) === true
  // Hanging a picture recolours the desktop to match it, unless asked not to.
  readonly property bool recolor: setting("recolor", true) === true
  readonly property var selection: Model.selectionForDay(dateKey, offset)
  readonly property string caption: Model.caption(art)
  readonly property string subtitle: Model.subtitle(art)
  readonly property bool ready: art !== null && imagePath !== ""

  // The date the last toast announced, so a shuffle or a refresh stays quiet
  // and only the turn of the day gets to interrupt.
  property string _announcedKey: ""
  property string _searchOutput: ""
  property string _imagePending: ""
  property string _imageUrlPending: ""
  property string _hangPending: ""
  property string _hangUrlPending: ""

  function setting(name, fallback) {
    var value = settings ? settings[name] : undefined
    return value === undefined || value === null ? fallback : value
  }

  function load() {
    if (!active) return
    if (searchProcess.running) return
    loading = true
    error = ""
    _searchOutput = ""
    searchProcess.command = Model.curlJsonCommand(Model.searchUrl(selection), 20)
    searchProcess.running = true
  }

  function refresh() {
    load()
  }

  // Same day, next draw. The seed moves, so the piece is different but still
  // reproducible — reopening the panel does not reshuffle it.
  function shuffle() {
    offset = offset + 1
    load()
  }

  function applySearch(raw) {
    var parsed = Model.parseSearch(raw)
    if (!parsed.ok) {
      loading = false
      error = parsed.error || "Could not read the collection"
      retryTimer.restart()
      return
    }
    var picked = Model.pickArtwork(parsed.items, selection)
    if (!picked) {
      loading = false
      error = "Nothing hung in that room"
      retryTimer.restart()
      return
    }
    error = ""
    art = picked
    imagePath = ""
    ensureImage()
  }

  function ensureImage() {
    if (!art) {
      loading = false
      return
    }
    _imagePending = Model.cachePath(home, art.imageId, Model.DISPLAY_BOX)
    _imageUrlPending = Model.imageUrl(art.imageId, Model.DISPLAY_BOX)
    imageCheckProcess.command = Model.existsCommand(_imagePending)
    imageCheckProcess.running = true
  }

  function adoptImage() {
    imagePath = _imagePending
    loading = false
    retryTimer.stop()
    announce()
  }

  function announce() {
    if (!notify || !art) return
    if (_announcedKey === dateKey) return
    _announcedKey = dateKey
    var command = Model.toastCommand(art)
    if (command) Quickshell.execDetached(command)
  }

  function open() {
    if (!art) return
    Quickshell.execDetached(Model.openCommand(art.id))
  }

  // Hang the picture on the desktop. The bar and panel show an 843px render;
  // a background wants the big one, so this fetches its own copy first. A
  // work whose source is smaller than the box arrives at its own size rather
  // than failing, so every piece can be hung.
  function hang() {
    if (!art || hanging) return
    hanging = true
    hangError = ""
    _hangPending = Model.cachePath(home, art.imageId, Model.WALLPAPER_BOX)
    _hangUrlPending = Model.imageUrl(art.imageId, Model.WALLPAPER_BOX)
    hangCheckProcess.command = Model.existsCommand(_hangPending)
    hangCheckProcess.running = true
  }

  // With the full-size copy on disk: either dress the whole desktop in the
  // painting's colours, or just put it on the wall.
  function applyHang() {
    hangApplyProcess.command = recolor
      ? Model.hangCommand(home, art, _hangPending)
      : Model.wallpaperCommand(_hangPending)
    hangApplyProcess.running = true
  }

  Process {
    id: searchProcess
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: root._searchOutput = text
    }
    onExited: function(code) {
      if (code !== 0) {
        root.loading = false
        root.error = "Could not reach the collection"
        retryTimer.restart()
        return
      }
      root.applySearch(root._searchOutput)
    }
  }

  Process {
    id: imageCheckProcess
    onExited: function(code) {
      if (code === 0) {
        root.adoptImage()
        return
      }
      imageFetchProcess.command = Model.curlImageCommand(root._imageUrlPending, root._imagePending, 45)
      imageFetchProcess.running = true
    }
  }

  Process {
    id: imageFetchProcess
    onExited: function(code) {
      if (code !== 0) {
        root.loading = false
        root.error = "Could not fetch the picture"
        retryTimer.restart()
        return
      }
      root.adoptImage()
    }
  }

  Process {
    id: hangCheckProcess
    onExited: function(code) {
      if (code === 0) {
        root.applyHang()
        return
      }
      hangFetchProcess.command = Model.curlImageCommand(root._hangUrlPending, root._hangPending, 90)
      hangFetchProcess.running = true
    }
  }

  Process {
    id: hangFetchProcess
    onExited: function(code) {
      if (code !== 0) {
        root.hanging = false
        root.hangError = "Could not fetch a full-size copy"
        return
      }
      root.applyHang()
    }
  }

  Process {
    id: hangApplyProcess
    onExited: function(code) {
      root.hanging = false
      root.hangError = code === 0 ? "" : "Could not hang the picture"
    }
  }

  // A laptop that wakes with no network should not sit blank until tomorrow.
  Timer {
    id: retryTimer
    interval: 120000
    repeat: false
    running: false
    onTriggered: if (root.active && !root.ready) root.load()
  }

  // Wakes on the minute, so the day turns over within a second of midnight —
  // in step with the other daily widgets — and a picture that never arrived
  // gets another chance. A wall-clock tick rather than a 24h interval, so it
  // stays aligned across a suspend.
  Timer {
    running: root.active
    interval: 60000 - Date.now() % 60000
    onTriggered: {
      interval = 60000 - Date.now() % 60000
      restart()
      var today = Model.dateKeyFromDate(new Date())
      if (today === root.dateKey) {
        if (!root.ready && !root.loading && root.error === "") root.load()
        return
      }
      root.dateKey = today
      root.offset = 0
      root.load()
    }
  }

  Component.onCompleted: if (active) load()
}
