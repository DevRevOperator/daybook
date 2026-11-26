#!/bin/zsh
set -euo pipefail
DAYBOOK_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DAYBOOK_APP="${DAYBOOK_BUILD_APP:-$DAYBOOK_ROOT/Daybook Capture.app}"
DAYBOOK_NODE="$(command -v node)"
mkdir -p "$DAYBOOK_APP/Contents/MacOS" "$DAYBOOK_APP/Contents/Resources" "$DAYBOOK_ROOT/.data/swift-cache"
xcrun swiftc "$DAYBOOK_ROOT/mac/DaybookCapture.swift" -parse-as-library -o "$DAYBOOK_APP/Contents/MacOS/DaybookCapture" -framework AppKit -framework Carbon -framework CoreText -module-cache-path "$DAYBOOK_ROOT/.data/swift-cache" -swift-version 5
python3 - "$DAYBOOK_APP" "$DAYBOOK_ROOT" "$DAYBOOK_NODE" <<'PY'
import sys, json, plistlib, os
from pathlib import Path
app, root, node = sys.argv[1:]
path = Path(app)/'Contents'
config = {'projectPath': root, 'nodePath': node}
if os.environ.get('DAYBOOK_WEB_URL'):
    from urllib.parse import urlparse
    url = os.environ['DAYBOOK_WEB_URL']
    if urlparse(url).scheme != 'https': raise SystemExit('Cloud Daybook requires HTTPS.')
    config['webURL'] = url
(path/'Resources/configuration.json').write_text(json.dumps(config))
with (path/'Info.plist').open('wb') as f:
    plistlib.dump({'CFBundleIdentifier': 'local.daybook.capture', 'CFBundleName': 'Daybook Capture', 'CFBundleDisplayName': 'Daybook Capture', 'CFBundleExecutable': 'DaybookCapture', 'CFBundlePackageType': 'APPL', 'CFBundleShortVersionString': '0.2.0', 'CFBundleVersion': '2', 'LSUIElement': True, 'NSHighResolutionCapable': True, 'LSMinimumSystemVersion': '13.0'}, f)
PY
if [[ -f "$DAYBOOK_ROOT/public/fonts/ChipText-Regular.otf" ]]; then
  cp "$DAYBOOK_ROOT/public/fonts/ChipText-Regular.otf" "$DAYBOOK_ROOT/public/fonts/ChipText-Medium.otf" "$DAYBOOK_APP/Contents/Resources/"
fi
codesign --force --sign - "$DAYBOOK_APP"
print "Built $DAYBOOK_APP"
