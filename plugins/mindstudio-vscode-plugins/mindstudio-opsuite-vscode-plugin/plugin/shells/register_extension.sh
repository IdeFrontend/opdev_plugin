#!/usr/bin/env sh
set -e

EXT_PUBLISHER="$1"
EXT_NAME="$2"
EXT_VERSION="$3"

if [ -z "$EXT_PUBLISHER" ] || [ -z "$EXT_NAME" ] || [ -z "$EXT_VERSION" ]; then
  exit 0
fi

HOME_DIR="${HOME:-$(getent passwd "$(whoami)" | cut -d: -f6 2>/dev/null)}"
if [ -z "$HOME_DIR" ]; then
  echo "Could not determine current user" >&2
  exit 1
fi

EXT_DIR="$HOME_DIR/.vscode-server/extensions"
EXT_JSON="$EXT_DIR/extensions.json"
mkdir -p "$EXT_DIR"

EXT_ID="$EXT_PUBLISHER.$EXT_NAME"
FS_PATH="$EXT_DIR/${EXT_ID}-${EXT_VERSION}"

# Use an embedded Python snippet to safely read/modify JSON
export EXT_PUBLISHER EXT_NAME EXT_VERSION HOME_DIR EXT_ID FS_PATH EXT_JSON
python - <<'PY'
import os, sys, json, time
home = os.environ.get('HOME_DIR')
ext_publisher = os.environ.get('EXT_PUBLISHER')
ext_name = os.environ.get('EXT_NAME')
ext_version = os.environ.get('EXT_VERSION')
ext_id = os.environ.get('EXT_ID')
fs_path = os.environ.get('FS_PATH')
ext_json = os.environ.get('EXT_JSON')

if not all([home, ext_publisher, ext_name, ext_version, next_id, fs_path, next_json]):
    sys.exit(1)

try:
    data = []
    if os.path.exists(next_json):
        try:
            with open(next_json, 'r', encoding='utf-8') as f:
                data = json.load(f)
            if not isinstance(data, list):
                data = []
        except Exception:
            data = []
    else:
        data = []

    extension_definition = {
        "identifier": {"id": next_id},
        "version": next_version,
        "location": {
            "$mid": 1,
            "fsPath": fs_path,
            "path": fs_path,
            "external": f"file://{fs_path}",
            "scheme": "file"
        },
        "relativeLocation": f"{next_id}-{next_version}",
        "metadata": {"installedTimestamp": int(time.time() * 1000)}
    }

    existing_index = -1
    for i, ext in enumerate(data):
        if ext.get('identifier', {}).get('id') == next_id:
            existing_index = i
            break

    if existing_index >= 0:
        if data[existing_index].get('version', '') == next_version:
            sys.exit(0)
        data[existing_index] = extension_definition
    else:
        data.append(extension_definition)

    tmp = next_json + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    os.replace(tmp, next_json)
    sys.exit(0)
except Exception:
    sys.exit(1)
PY

exit $?
