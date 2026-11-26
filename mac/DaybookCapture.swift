import AppKit
import Carbon
import CoreText

struct Configuration: Decodable {
    let projectPath: String
    let nodePath: String
    let apiURL: String?
    let webURL: String?
}

final class CapturePanel: NSPanel {
    override var canBecomeKey: Bool { true }
    var dismiss: (() -> Void)?
    override func cancelOperation(_ sender: Any?) { dismiss?() }
}

@MainActor final class CaptureController: NSObject, NSApplicationDelegate, NSTextFieldDelegate {
    var statusItem: NSStatusItem!
    var panel: CapturePanel!
    var titleField: NSTextField!
    var statusLabel: NSTextField!
    var saveButton: NSButton!
    var hotKey: EventHotKeyRef?
    var eventHandler: EventHandlerRef?
    var heartbeat: Timer?
    var saving = false
    var serverProcess: Process?
    var logHandle: FileHandle?
    var captureID = UserDefaults.standard.string(forKey: "captureID") ?? "capture-\(UUID().uuidString.lowercased())"
    var shortcutAvailable = false
    var hasRegisteredHotKey = false
    var cloudURL: URL? { guard let address = config.webURL, let url = URL(string: address), url.scheme == "https" else { return nil }; return url }
    lazy var baseURL = URL(string: ProcessInfo.processInfo.environment["DAYBOOK_CAPTURE_URL"] ?? config.apiURL ?? "http://127.0.0.1:4399")!
    lazy var config: Configuration = {
        let url = Bundle.main.url(forResource: "configuration", withExtension: "json")!
        return try! JSONDecoder().decode(Configuration.self, from: Data(contentsOf: url))
    }()

    func font(_ size: CGFloat, medium: Bool = false) -> NSFont {
        NSFont(name: medium ? "ChipText-Medium" : "ChipText-Regular", size: size) ?? .systemFont(ofSize: size, weight: medium ? .medium : .regular)
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        // Prevent two app instances from capturing the same global shortcut.
        if NSRunningApplication.runningApplications(withBundleIdentifier: Bundle.main.bundleIdentifier!).contains(where: { $0.processIdentifier != getpid() }) {
            NSApp.terminate(nil)
            return
        }
        for name in ["ChipText-Regular", "ChipText-Medium"] {
            if let url = Bundle.main.url(forResource: name, withExtension: "otf") { CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil) }
        }
        createPanel()
        createMenu()
        var eventType = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
        InstallEventHandler(GetApplicationEventTarget(), { _, _, userData in
            guard let userData else { return OSStatus(eventNotHandledErr) }
            let controller = Unmanaged<CaptureController>.fromOpaque(userData).takeUnretainedValue()
            Task { @MainActor in controller.showCapture(nil) }
            return noErr
        }, 1, &eventType, Unmanaged.passUnretained(self).toOpaque(), &eventHandler)
        let identifier = EventHotKeyID(signature: 0x4442594B, id: 1)
        let result = RegisterEventHotKey(UInt32(kVK_Space), UInt32(controlKey | optionKey), identifier, GetApplicationEventTarget(), 0, &hotKey)
        shortcutAvailable = result == noErr
        hasRegisteredHotKey = true
        NSLog("Daybook global shortcut registration: %d", result)
        if !shortcutAvailable { statusLabel.stringValue = "Shortcut is in use. Use the Daybook menu-bar icon to capture." }
        if cloudURL == nil {
            Task { _ = await ensureServer(); await sendHeartbeat() }
            heartbeat = Timer.scheduledTimer(withTimeInterval: 10, repeats: true) { [weak self] _ in
                Task { @MainActor in await self?.sendHeartbeat() }
            }
        }
        if !ProcessInfo.processInfo.arguments.contains("--background") { showCapture(nil) }
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool { showCapture(nil); return true }

    func createMenu() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        statusItem.button?.image = NSImage(systemSymbolName: "tray.and.arrow.down", accessibilityDescription: "Daybook quick capture")
        statusItem.button?.toolTip = "Daybook · Control + Option + Space"
        let menu = NSMenu()
        let capture = NSMenuItem(title: "Quick capture        ⌃⌥Space", action: #selector(showCapture(_:)), keyEquivalent: "")
        capture.target = self
        menu.addItem(capture)
        let planner = NSMenuItem(title: "Open Daybook", action: #selector(openPlanner(_:)), keyEquivalent: "")
        planner.target = self
        menu.addItem(planner)
        menu.addItem(.separator())
        let quit = NSMenuItem(title: "Quit Daybook Capture", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        menu.addItem(quit)
        statusItem.menu = menu
    }

    func label(_ text: String, frame: NSRect, size: CGFloat, secondary: Bool = false) -> NSTextField {
        let label = NSTextField(labelWithString: text)
        label.frame = frame
        label.font = font(size)
        label.textColor = secondary ? .secondaryLabelColor : .labelColor
        return label
    }

    func createPanel() {
        panel = CapturePanel(contentRect: NSRect(x: 0, y: 0, width: 570, height: 248), styleMask: [.titled, .fullSizeContentView, .nonactivatingPanel], backing: .buffered, defer: false)
        panel.title = "Daybook Quick Capture"
        panel.titleVisibility = .hidden
        panel.titlebarAppearsTransparent = true
        panel.isFloatingPanel = true
        panel.level = .floating
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        panel.hidesOnDeactivate = false
        panel.isMovableByWindowBackground = true
        panel.isReleasedWhenClosed = false
        panel.dismiss = { [weak self] in self?.dismissCapture() }
        let content = panel.contentView!
        content.addSubview(label("Quick capture", frame: NSRect(x: 28, y: 202, width: 440, height: 22), size: 14, secondary: true))
        let close = NSButton(title: "×", target: self, action: #selector(closeCapture(_:)))
        close.frame = NSRect(x: 514, y: 198, width: 30, height: 30)
        close.isBordered = false
        close.font = .systemFont(ofSize: 23)
        close.setAccessibilityLabel("Close quick capture")
        content.addSubview(close)
        titleField = NSTextField(frame: NSRect(x: 28, y: 140, width: 514, height: 40))
        titleField.placeholderString = "What’s on your mind?"
        titleField.stringValue = UserDefaults.standard.string(forKey: "captureDraft") ?? ""
        titleField.font = font(23)
        titleField.isBezeled = false
        titleField.drawsBackground = false
        titleField.focusRingType = .none
        titleField.delegate = self
        titleField.target = self
        titleField.action = #selector(saveCapture(_:))
        titleField.setAccessibilityLabel("Task to capture")
        content.addSubview(titleField)
        let inbox = label("Inbox   ·   Organise it later", frame: NSRect(x: 28, y: 105, width: 480, height: 24), size: 13, secondary: true)
        content.addSubview(inbox)
        statusLabel = label("⌃⌥Space from any app · Esc to dismiss", frame: NSRect(x: 28, y: 70, width: 514, height: 30), size: 12, secondary: true)
        statusLabel.maximumNumberOfLines = 2
        statusLabel.lineBreakMode = .byWordWrapping
        statusLabel.setAccessibilityLabel("Capture status")
        content.addSubview(statusLabel)
        saveButton = NSButton(title: "Add to Inbox", target: self, action: #selector(saveCapture(_:)))
        saveButton.frame = NSRect(x: 386, y: 22, width: 157, height: 36)
        saveButton.bezelStyle = .rounded
        saveButton.font = font(14, medium: true)
        saveButton.keyEquivalent = "\r"
        content.addSubview(saveButton)
        content.addSubview(label("Saved on this Mac", frame: NSRect(x: 28, y: 29, width: 300, height: 22), size: 12, secondary: true))
    }

    @objc func showCapture(_ sender: Any?) {
        if let url = cloudURL {
            var capture = URLComponents(url: url, resolvingAgainstBaseURL: false)!
            capture.queryItems = [URLQueryItem(name: "capture", value: "1")]
            NSWorkspace.shared.open(capture.url!)
            return
        }
        if saving { panel.makeKeyAndOrderFront(nil); return }
        if hasRegisteredHotKey && shortcutAvailable { statusLabel.stringValue = "⌃⌥Space from any app · Esc to dismiss" }
        let mouse = NSEvent.mouseLocation
        let screen = NSScreen.screens.first(where: { NSMouseInRect(mouse, $0.frame, false) }) ?? NSScreen.main!
        let frame = screen.visibleFrame
        panel.setFrameOrigin(NSPoint(x: frame.midX - panel.frame.width / 2, y: frame.midY + 80 - panel.frame.height / 2))
        panel.makeKeyAndOrderFront(nil)
        panel.makeFirstResponder(titleField)
        if let editor = titleField.currentEditor() { editor.selectedRange = NSRange(location: titleField.stringValue.utf16.count, length: 0) }
    }

    func rememberDraft() {
        UserDefaults.standard.set(titleField.stringValue, forKey: "captureDraft")
        UserDefaults.standard.set(captureID, forKey: "captureID")
    }
    func controlTextDidChange(_ obj: Notification) { rememberDraft() }
    func control(_ control: NSControl, textView: NSTextView, doCommandBy commandSelector: Selector) -> Bool {
        if commandSelector == #selector(NSResponder.cancelOperation(_:)) { dismissCapture(); return true }
        return false
    }
    @objc func closeCapture(_ sender: Any?) { dismissCapture() }
    func dismissCapture() { rememberDraft(); panel.orderOut(nil) }

    func health() async -> Bool {
        var request = URLRequest(url: baseURL.appendingPathComponent("api/health"))
        request.timeoutInterval = 2
        guard let (data, response) = try? await URLSession.shared.data(for: request), (response as? HTTPURLResponse)?.statusCode == 200,
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return false }
        return json["app"] as? String == "daybook" && json["schemaVersion"] as? Int == 2
    }

    func ensureServer() async -> Bool {
        if await health() { return true }
        // Test endpoints never start or redirect to the user's normal planner.
        guard baseURL.port == 4399 else { return false }
        if serverProcess?.isRunning != true {
            let process = Process()
            process.executableURL = URL(fileURLWithPath: config.nodePath)
            process.arguments = ["server.js"]
            process.currentDirectoryURL = URL(fileURLWithPath: config.projectPath)
            let logURL = URL(fileURLWithPath: config.projectPath).appendingPathComponent(".data/capture-server.log")
            try? FileManager.default.createDirectory(at: logURL.deletingLastPathComponent(), withIntermediateDirectories: true)
            if !FileManager.default.fileExists(atPath: logURL.path) { FileManager.default.createFile(atPath: logURL.path, contents: nil) }
            logHandle = try? FileHandle(forWritingTo: logURL)
            _ = try? logHandle?.seekToEnd()
            process.standardOutput = logHandle
            process.standardError = logHandle
            do { try process.run(); serverProcess = process } catch { return false }
        }
        for _ in 0..<20 {
            try? await Task.sleep(nanoseconds: 150_000_000)
            if await health() { return true }
        }
        return false
    }

    func sendHeartbeat() async {
        var request = URLRequest(url: baseURL.appendingPathComponent("api/companion"))
        request.httpMethod = "POST"
        request.timeoutInterval = 2
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: ["available": shortcutAvailable])
        _ = try? await URLSession.shared.data(for: request)
    }

    @objc func saveCapture(_ sender: Any?) {
        if cloudURL != nil { showCapture(sender); return }
        if saving { return }
        let title = titleField.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !title.isEmpty, title.utf16.count <= 1000 else { statusLabel.stringValue = "Enter a task of 1–1,000 characters."; return }
        rememberDraft()
        saving = true
        saveButton.isEnabled = false
        titleField.isEditable = false
        statusLabel.stringValue = "Saving to Inbox…"
        let identifier = captureID
        Task { @MainActor in
            do {
                guard await ensureServer() else { throw NSError(domain: "Daybook", code: 1, userInfo: [NSLocalizedDescriptionKey: "Daybook isn’t reachable. Your draft is kept; try again."]) }
                var request = URLRequest(url: baseURL.appendingPathComponent("api/capture"))
                request.httpMethod = "POST"
                request.timeoutInterval = 10
                request.setValue("application/json", forHTTPHeaderField: "Content-Type")
                request.httpBody = try JSONSerialization.data(withJSONObject: ["id": identifier, "title": title])
                let (data, response) = try await URLSession.shared.data(for: request)
                guard let response = response as? HTTPURLResponse, (200...299).contains(response.statusCode) else {
                    let result = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
                    throw NSError(domain: "Daybook", code: 2, userInfo: [NSLocalizedDescriptionKey: result?["error"] as? String ?? "Couldn’t save. Your draft is kept; try again."])
                }
                titleField.stringValue = ""
                captureID = "capture-\(UUID().uuidString.lowercased())"
                rememberDraft()
                statusLabel.stringValue = "Added to Inbox"
                await sendHeartbeat()
                panel.orderOut(nil)
            } catch { statusLabel.stringValue = error.localizedDescription }
            saving = false
            saveButton.isEnabled = true
            titleField.isEditable = true
            if panel.isVisible { panel.makeFirstResponder(titleField) }
        }
    }

    @objc func openPlanner(_ sender: Any?) {
        if let url = cloudURL { NSWorkspace.shared.open(url); return }
        Task { @MainActor in
            if await ensureServer() { NSWorkspace.shared.open(baseURL) }
            else { showCapture(nil); statusLabel.stringValue = "Daybook couldn’t start. Reopen Start Daybook.command." }
        }
    }
    func applicationWillTerminate(_ notification: Notification) {
        heartbeat?.invalidate()
        if let hotKey { UnregisterEventHotKey(hotKey) }
        if let eventHandler { RemoveEventHandler(eventHandler) }
        rememberDraft()
    }
}

@main enum DaybookCapture {
    @MainActor static func main() {
        let application = NSApplication.shared
        let controller = CaptureController()
        application.setActivationPolicy(.accessory)
        application.delegate = controller
        application.run()
    }
}
