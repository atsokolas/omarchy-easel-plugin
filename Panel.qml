import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Ui
import "Model.js" as Model

Panel {
  id: root
  moduleName: "atsokolas.easel"
  ipcTarget: "atsokolas.easel"
  manageIpc: false

  property var anchorItem: null
  property var hostWidget: null
  property bool openedFromHotkey: false

  readonly property var barIdentity: hostWidget || root
  readonly property color foreground: bar ? bar.foreground : Color.foreground
  readonly property color dim: Qt.darker(foreground, 1.55)
  readonly property string fontFamily: bar ? bar.fontFamily : Style.font.family

  // Content settles in behind the panel frame each time it opens. Driven by
  // `opened` rather than by content, so a background refresh never re-runs it.
  property real reveal: 1

  NumberAnimation {
    id: revealAnimation
    target: root
    property: "reveal"
    from: 0
    to: 1
    duration: 260
    easing.type: Easing.OutCubic
  }

  readonly property var sharedService: bar && bar.shell && typeof bar.shell.serviceFor === "function"
    ? bar.shell.serviceFor(moduleName) : null
  readonly property var service: sharedService || localService
  readonly property var art: service.art
  // The mat is cut to match the picture.
  readonly property color tint: art && Model.frameColor(art) !== "" ? Model.frameColor(art) : foreground

  function pushSettings() { if (service) service.settings = settings }
  onSettingsChanged: pushSettings()
  onServiceChanged: pushSettings()
  Component.onCompleted: pushSettings()

  function persistSettings(values) {
    var entryData = { id: root.moduleName }
    for (var existing in root.settings) if (existing !== "id") entryData[existing] = root.settings[existing]
    for (var key in values) {
      if (values[key] === undefined) delete entryData[key]
      else entryData[key] = values[key]
    }
    root.settings = entryData
    if (root.bar && root.bar.shell && typeof root.bar.shell.updateEntryInline === "function")
      root.bar.shell.updateEntryInline(root.moduleName, entryData)
    pushSettings()
  }

  function toggleThemed() { persistSettings({ themed: !service.themed }) }

  function open() {
    openedFromHotkey = false
    setCenterHoverRevealSuppressed(false)
    root.controller.show()
  }

  function openFromHotkey() {
    openedFromHotkey = true
    root.controller.show()
    Qt.callLater(function() {
      if (root.opened) setCenterHoverRevealSuppressed(true)
    })
  }

  function close() {
    setCenterHoverRevealSuppressed(false)
    root.controller.hide()
  }

  function toggle() {
    if (root.opened) root.close()
    else root.openFromHotkey()
  }

  function refresh() { service.refresh() }
  function shuffle() { service.shuffle() }

  function copy() {
    var payload = Model.copyPayload(art)
    if (payload === "") return
    Quickshell.execDetached(Model.copyCommand(payload))
    copiedTimer.restart()
  }

  Timer {
    id: copiedTimer
    interval: 1600
  }

  function switchPanel(direction) {
    if (root.bar && typeof root.bar.switchPanelFrom === "function")
      return root.bar.switchPanelFrom(root.barIdentity, direction)
    return false
  }

  function setCenterHoverRevealSuppressed(value) {
    if (root.bar && "centerHoverRevealSuppressed" in root.bar)
      root.bar.centerHoverRevealSuppressed = value
  }

  function handleClose() {
    if (root.openedFromHotkey) root.close()
    else root.close()
  }

  function handleTextKey(key) {
    var k = String(key || "").toLowerCase()
    if (k === "n") service.shuffle()
    else if (k === "h") service.hang()
    else if (k === "c") copy()
    else if (k === "t") toggleThemed()
    else if (k === "o") service.open()
    else if (k === "r") service.refresh()
  }

  onOpenedChanged: {
    if (!opened) return
    revealAnimation.restart()
    Qt.callLater(function() { if (keyCatcher) keyCatcher.forceActiveFocus() })
  }

  Service {
    id: localService
    active: root.sharedService === null
  }

  KeyboardPanel {
    id: panel
    anchorItem: root.anchorItem
    owner: root.barIdentity
    bar: root.bar
    open: root.opened
    centerOnBar: true
    focusTarget: keyCatcher
    contentWidth: panel.fittedContentWidth(Style.space(440))
    contentHeight: panel.fittedContentHeight(Style.space(600), Style.space(720))

    PanelKeyCatcher {
      id: keyCatcher
      anchors.fill: parent
      onActivateRequested: service.open()
      onCloseRequested: root.handleClose()
      onTabRequested: function(direction) { root.switchPanel(direction) }
      onTextKey: function(text) { root.handleTextKey(text) }

      ColumnLayout {
        anchors.fill: parent
        spacing: Style.space(10)
        opacity: root.reveal
        transform: Translate { y: (1 - root.reveal) * Style.space(7) }

        // ---- Header
        Item {
          Layout.fillWidth: true
          implicitHeight: Math.max(heroLabels.height, headerButtons.height)

          Column {
            id: heroLabels
            anchors.left: parent.left
            anchors.right: headerButtons.left
            anchors.rightMargin: Style.space(8)
            anchors.verticalCenter: parent.verticalCenter
            spacing: Style.space(2)

            Text {
              text: Model.APP_NAME
              color: root.foreground
              font.family: root.fontFamily
              font.pixelSize: Style.font.title
              font.bold: true
              width: parent.width
              elide: Text.ElideRight
            }

            Text {
              width: parent.width
              text: Model.dayHeading(service.dateKey)
              color: root.dim
              font.family: root.fontFamily
              font.pixelSize: Style.font.bodySmall
              elide: Text.ElideRight
            }
          }

          Row {
            id: headerButtons
            anchors.right: parent.right
            anchors.verticalCenter: parent.verticalCenter
            spacing: Style.space(2)

            PanelActionButton {
              id: refreshButton
              iconText: "󰑐"
              tooltipText: "Refresh"
              foreground: root.foreground
              fontFamily: root.fontFamily
              enabled: !service.loading
              onClicked: service.refresh()

              RotationAnimation on rotation {
                running: service.loading
                loops: Animation.Infinite
                from: 0
                to: 360
                duration: 900
                onRunningChanged: if (!running) refreshButton.rotation = 0
              }
            }
          }
        }

        PanelSeparator { Layout.fillWidth: true; foreground: root.foreground }

        // ---- The picture, matted inside a thin frame
        Rectangle {
          id: matte
          Layout.fillWidth: true
          Layout.fillHeight: true
          Layout.minimumHeight: Style.space(180)
          color: Qt.rgba(root.tint.r, root.tint.g, root.tint.b, 0.07)
          border.width: 1
          border.color: Qt.rgba(root.tint.r, root.tint.g, root.tint.b, 0.45)
          radius: Style.cornerRadius
          Behavior on color { ColorAnimation { duration: 420 } }
          Behavior on border.color { ColorAnimation { duration: 420 } }

          Image {
            id: plate
            anchors.fill: parent
            anchors.margins: Style.space(12)
            source: service.imagePath === "" ? "" : "file://" + service.imagePath
            fillMode: Image.PreserveAspectFit
            asynchronous: true
            cache: true
            smooth: true
            mipmap: true
            opacity: status === Image.Ready ? 1 : 0

            Behavior on opacity { NumberAnimation { duration: 320; easing.type: Easing.OutCubic } }

            HoverHandler { cursorShape: Qt.PointingHandCursor; enabled: root.art !== null }
            TapHandler { onTapped: service.open() }
          }

          Text {
            anchors.centerIn: parent
            width: parent.width - Style.space(40)
            visible: plate.opacity < 0.05
            horizontalAlignment: Text.AlignHCenter
            wrapMode: Text.WordWrap
            text: service.error !== "" ? service.error : "Visiting the collection…"
            color: service.error !== "" ? Color.urgent : root.dim
            font.family: root.fontFamily
            font.pixelSize: Style.font.bodySmall
          }
        }

        // ---- Wall label
        Column {
          Layout.fillWidth: true
          spacing: Style.space(3)
          visible: root.art !== null

          Text {
            width: parent.width
            text: root.art ? root.art.title : ""
            color: root.foreground
            font.family: root.fontFamily
            font.pixelSize: Style.font.subtitle
            font.bold: true
            wrapMode: Text.WordWrap
            maximumLineCount: 2
            elide: Text.ElideRight
          }

          Text {
            width: parent.width
            text: Model.subtitle(root.art)
            color: root.dim
            font.family: root.fontFamily
            font.pixelSize: Style.font.bodySmall
            elide: Text.ElideRight
          }
        }

        // ---- Catalogue entry
        Flickable {
          id: factsFlick
          Layout.fillWidth: true
          Layout.preferredHeight: Math.min(factsColumn.implicitHeight, Style.space(96))
          visible: root.art !== null
          clip: true
          contentWidth: width
          contentHeight: factsColumn.implicitHeight
          boundsBehavior: Flickable.StopAtBounds
          flickableDirection: Flickable.VerticalFlick
          interactive: contentHeight > height
          ScrollBar.vertical: ScrollBar { policy: ScrollBar.AsNeeded }

          Column {
            id: factsColumn
            width: factsFlick.width
            spacing: Style.space(3)

            Repeater {
              model: Model.factRows(root.art)

              Row {
                width: factsColumn.width
                spacing: Style.space(8)

                Text {
                  width: Style.space(58)
                  text: modelData.label
                  color: root.dim
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.caption
                }

                Text {
                  width: Math.max(0, parent.width - Style.space(58) - Style.space(8))
                  text: modelData.value
                  color: root.foreground
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.caption
                  elide: Text.ElideRight
                }
              }
            }
          }
        }

        // ---- Actions
        RowLayout {
          Layout.fillWidth: true
          spacing: Style.space(2)

          Button {
            text: "ANOTHER"
            foreground: root.foreground
            background: "transparent"
            accent: Color.accent
            fontFamily: root.fontFamily
            fontSize: Style.font.caption
            horizontalPadding: Style.space(7)
            verticalPadding: Style.space(1)
            enabled: !service.loading
            onClicked: service.shuffle()
          }

          Button {
            text: service.hanging ? "HANGING…" : "HANG"
            foreground: root.foreground
            background: "transparent"
            accent: Color.accent
            fontFamily: root.fontFamily
            fontSize: Style.font.caption
            horizontalPadding: Style.space(7)
            verticalPadding: Style.space(1)
            enabled: root.art !== null && !service.hanging
            onClicked: service.hang()
          }

          Button {
            text: service.themed ? "AS PAINTED" : "IN MY THEME"
            foreground: service.themed ? Color.accent : root.foreground
            background: "transparent"
            accent: Color.accent
            fontFamily: root.fontFamily
            fontSize: Style.font.caption
            horizontalPadding: Style.space(7)
            verticalPadding: Style.space(1)
            enabled: root.art !== null
            onClicked: root.toggleThemed()
          }

          Button {
            text: copiedTimer.running ? "COPIED" : "COPY"
            foreground: root.foreground
            background: "transparent"
            accent: Color.accent
            fontFamily: root.fontFamily
            fontSize: Style.font.caption
            horizontalPadding: Style.space(7)
            verticalPadding: Style.space(1)
            enabled: root.art !== null
            onClicked: root.copy()
          }

          Button {
            text: "OPEN"
            foreground: root.foreground
            background: "transparent"
            accent: Color.accent
            fontFamily: root.fontFamily
            fontSize: Style.font.caption
            horizontalPadding: Style.space(7)
            verticalPadding: Style.space(1)
            enabled: root.art !== null
            onClicked: service.open()
          }

          Item { Layout.fillWidth: true }
        }

        Text {
          Layout.fillWidth: true
          text: service.hangError !== ""
            ? service.hangError
            : (service.themeError !== "" ? service.themeError
              : Model.statusLine({ error: service.error, loading: service.loading, art: root.art, themed: service.themed }))
          color: service.hangError !== "" || service.themeError !== "" || service.error !== "" ? Color.urgent : root.dim
          font.family: root.fontFamily
          font.pixelSize: Style.font.caption
          elide: Text.ElideRight
        }
      }
    }
  }
}
