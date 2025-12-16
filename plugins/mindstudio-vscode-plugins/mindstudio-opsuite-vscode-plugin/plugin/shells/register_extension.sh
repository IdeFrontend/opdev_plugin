#!/usr/bin/env bash
set -euo pipefail

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

# Create JSON object for this extension
TIMESTAMP=$(($(date +%s) * 1000))
NEW_OBJ=$(cat <<EOF
{
    "identifier": {"id": "$EXT_ID"},
    "version": "$EXT_VERSION",
    "location": {
        "\$mid": 1,
        "fsPath": "$FS_PATH",
        "path": "$FS_PATH",
        "external": "file://$FS_PATH",
        "scheme": "file"
    },
    "relativeLocation": "$EXT_ID-$EXT_VERSION",
    "metadata": {"installedTimestamp": $TIMESTAMP}
}
EOF
)

# If no existing file, write a new array with the object
if [ ! -f "$EXT_JSON" ] || [ ! -s "$EXT_JSON" ]; then
    printf '[\n%s\n]\n' "$NEW_OBJ" > "$EXT_JSON"
    exit 0
fi

# Parse top-level JSON objects from existing file using awk, operate on them one-by-one.
# awk prints each top-level object followed by a NUL separator.
TMP=$(mktemp)
FOUND=0
FIRST=1

awk '
    BEGIN{in_array=0; level=0; obj=""}
    {
        line = $0 "\n"
        for(i=1;i<=length(line);i++){
            c = substr(line,i,1)
            if(!in_array){ if(c=="[") { in_array=1; } }
            else {
                if(level==0 && c==sprintf("%c",93)){ in_array=0; }
                else if(c=="{") { level++; obj = obj c }
                else if(c=="}") { obj = obj c; level--; if(level==0){ printf "%s\0", obj; obj="" } }
                else { if(level>0) obj = obj c }
            }
        }
    }
' "$EXT_JSON" | while IFS= read -r -d '' OBJ; do
    if printf '%s' "$OBJ" | grep -q "\"id\"[[:space:]]*:[[:space:]]*\"$EXT_ID\""; then
        # replace existing entry
        if [ $FIRST -eq 1 ]; then
            printf '[\n' > "$TMP"
            FIRST=0
        else
            printf ',\n' >> "$TMP"
        fi
        printf '%s' "$NEW_OBJ" >> "$TMP"
        FOUND=1
    else
        if [ $FIRST -eq 1 ]; then
            printf '[\n' > "$TMP"
            FIRST=0
        else
            printf ',\n' >> "$TMP"
        fi
        printf '%s' "$OBJ" >> "$TMP"
    fi
done

if [ $FIRST -eq 1 ]; then
    # no objects were parsed (malformed or empty array), just write new
    printf '[\n%s\n]\n' "$NEW_OBJ" > "$EXT_JSON"
    rm -f "$TMP"
    exit 0
fi

if [ $FOUND -eq 0 ]; then
    # append new object
    printf ',\n%s\n]\n' "$NEW_OBJ" >> "$TMP"
else
    printf '\n]\n' >> "$TMP"
fi

mv "$TMP" "$EXT_JSON"
exit 0
