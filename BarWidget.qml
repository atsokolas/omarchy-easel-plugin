import QtQuick
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Ui
import "Model.js" as Model

BarWidget {
  id: root
  moduleName: "atsokolas.easel"

  function injectPanel() {
    var target = panelLoader.item
    if (!target) return
    if ("bar" in target) target.bar = root.bar
    if ("settings" in target) target.settings = root.settings
    if ("anchorItem" in target) target.anchorItem = button
    if ("hostWidget" in target) target.hostWidget = root
  }

  function refresh() {
    if (panelLoader.item && panelLoader.item.refresh) panelLoader.item.refresh()
  }

  function shuffle() {
    if (panelLoader.item && panelLoader.item.shuffle) panelLoader.item.shuffle()
  }

  function togglePanel() {
    if (panelLoader.item && panelLoader.item.toggle) panelLoader.item.toggle()
  }

  readonly property var service: panelLoader.item ? panelLoader.item.service : null
  readonly property var art: service ? service.art : null
  readonly property string imagePath: service ? service.imagePath : ""
  readonly property bool loading: service ? service.loading === true : false
  readonly property bool opened: panelLoader.item ? panelLoader.item.opened === true : false
  readonly property bool showTitle: root.setting("showTitle", false) === true

  function open() {
    if (panelLoader.item && panelLoader.item.openFromHotkey) panelLoader.item.openFromHotkey()
  }

  function close() {
    if (panelLoader.item && panelLoader.item.close) panelLoader.item.close()
  }

  readonly property bool popoutSwitchClosing: panelLoader.item ? panelLoader.item.popoutSwitchClosing === true : false

  function closeForPopoutSwitch() {
    if (panelLoader.item) panelLoader.item.closeForPopoutSwitch()
  }

  // A new picture is hung rather than swapped: the old canvas fades out, the
  // new one settles in. Driven off imagePath so a refresh that lands on the
  // same artwork stays still.
  property real hang: 1

  onImagePathChanged: if (imagePath !== "") hangAnimation.restart()

  SequentialAnimation {
    id: hangAnimation
    NumberAnimation { target: root; property: "hang"; to: 0; duration: 120; easing.type: Easing.InQuad }
    NumberAnimation { target: root; property: "hang"; to: 1; duration: 420; easing.type: Easing.OutBack }
  }

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  onBarChanged: injectPanel()
  onSettingsChanged: injectPanel()

  IpcHandler {
    target: "atsokolas.easel"
    function open(): void { root.open() }
    function close(): void { root.close() }
    function show(): void { root.open() }
    function hide(): void { root.close() }
    function toggle(): void { root.togglePanel() }
    function refresh(): string { root.refresh(); return "ok" }
    function shuffle(): string { root.shuffle(); return "ok" }
    function wallpaper(): string {
      if (!root.service) return "no service"
      root.service.setWallpaper()
      return "ok"
    }
    // The bar is a layer surface, so what is hanging cannot be read off a
    // screenshot. This is how you check.
    function status(): string {
      if (!root.service) return "{}"
      var s = root.service
      return JSON.stringify({
        date: s.dateKey,
        offset: s.offset,
        room: s.selection.room,
        page: s.selection.page,
        loading: s.loading,
        error: s.error,
        image: s.imagePath,
        artwork: s.art ? Model.caption(s.art) : "",
        url: s.art ? Model.pageUrl(s.art.id) : ""
      })
    }
  }

  Loader {
    id: panelLoader
    active: true
    source: Qt.resolvedUrl("Panel.qml")
    visible: false
    onLoaded: {
      root.injectPanel()
      Qt.callLater(root.injectPanel)
    }
  }

  WidgetButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    text: ""
    labelVisible: false
    hasVisualContent: true
    fixedWidth: root.vertical ? -1 : Math.max(12, content.contentWidth + button.scaledHorizontalMargin * 2)
    tooltipText: root.art ? Model.caption(root.art) : (root.loading ? "Visiting the collection…" : Model.APP_NAME)
    horizontalMargin: 8.5
    verticalPadding: 6

    onPressed: function(b) {
      if (b === Qt.RightButton) root.shuffle()
      else if (b === Qt.MiddleButton) root.refresh()
      else root.togglePanel()
    }

    Item {
      id: content
      anchors.fill: parent

      // The frame takes the shape of the painting rather than a fixed square,
      // so a portrait reads as a portrait even at 14 pixels tall. Clamped so
      // an extreme scroll or panorama cannot stretch the bar.
      readonly property real frameHeight: Math.max(10, button.barSize - Style.spaceReal(12))
      readonly property real aspect: root.art && isFinite(root.art.aspect) && root.art.aspect > 0 ? root.art.aspect : 0.8
      readonly property real frameWidth: root.vertical
        ? Math.min(frameHeight, Math.max(frameHeight * 0.55, frameHeight * aspect))
        : Math.max(frameHeight * 0.55, Math.min(frameHeight * 1.8, frameHeight * aspect))
      readonly property real gap: Style.spaceReal(7)
      readonly property real labelWidth: label.visible ? Math.min(label.implicitWidth, Style.spaceReal(120)) : 0
      readonly property real contentWidth: frameWidth + (label.visible ? gap + labelWidth : 0)

      Rectangle {
        id: frame
        x: root.vertical ? (parent.width - width) / 2 : (parent.width - content.contentWidth) / 2
        anchors.verticalCenter: parent.verticalCenter
        width: content.frameWidth
        height: content.frameHeight
        radius: Math.min(2, Style.cornerRadius)
        color: Qt.rgba(button.foreground.r, button.foreground.g, button.foreground.b, 0.10)
        border.width: 1
        border.color: Qt.rgba(button.foreground.r, button.foreground.g, button.foreground.b,
                              root.opened ? 0.85 : 0.5)
        scale: 0.86 + root.hang * 0.14
        transformOrigin: Item.Center

        Behavior on border.color { ColorAnimation { duration: 160 } }

        Image {
          id: canvas
          anchors.fill: parent
          anchors.margins: 1
          source: root.imagePath === "" ? "" : "file://" + root.imagePath
          fillMode: Image.PreserveAspectCrop
          sourceSize.height: 48
          asynchronous: true
          cache: true
          smooth: true
          clip: true
          opacity: status === Image.Ready ? root.hang : 0

          Behavior on opacity { NumberAnimation { duration: 220 } }
        }

        // Empty stretcher while the collection is still being visited.
        SequentialAnimation on opacity {
          running: root.loading && root.imagePath === ""
          loops: Animation.Infinite
          NumberAnimation { from: 1; to: 0.45; duration: 900; easing.type: Easing.InOutSine }
          NumberAnimation { from: 0.45; to: 1; duration: 900; easing.type: Easing.InOutSine }
          onRunningChanged: if (!running) frame.opacity = 1
        }
      }

      Text {
        id: label
        visible: root.showTitle && !root.vertical && root.art !== null
        x: frame.x + content.frameWidth + content.gap
        width: content.labelWidth
        anchors.verticalCenter: parent.verticalCenter
        text: root.art ? Model.artistOf(root.art) : ""
        color: button.foreground
        font.family: button.fontFamily
        font.pixelSize: button.fontSize
        elide: Text.ElideRight
        opacity: root.hang
        renderType: Text.NativeRendering
      }
    }
  }
}
