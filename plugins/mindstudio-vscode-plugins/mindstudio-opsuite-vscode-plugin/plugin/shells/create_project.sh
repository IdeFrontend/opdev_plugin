#!/usr/bin/env bash
set -euo pipefail

# create_project.sh
# Usage:
#   create_project.sh --data-dir <dir> --project-name <name> --project-path <path> [--ascend-env-script <script>] [--create-by <user>]
#
# This script mirrors the behaviour of the TypeScript `createProject` function in
# plugin/autogen-server/models/projectModel.ts. It requires `node` to be available
# for safe JSON parsing/writing.

show_help() {
  cat <<EOF
Usage: $0 --project-name NAME --project-path PATH [--ascend-env-script SCRIPT] [--create-by USER]

Options:
  --project-name NAME        project_name (required)
  --project-path PATH        project_path (required)
  --ascend-env-script SCRIPT optional ascend_env_script
  --create-by USER           optional create_by
  -h, --help                 show this help

Example:
  $0 --project-name myproj --project-path /home/me/myproj
EOF
}

if [ $# -eq 0 ]; then
  show_help
  exit 1
fi

HOME_DIR="${HOME:-$(eval echo "~$USER")}"
DATA_DIR="$HOME_DIR/.vscode-server/data/ms-op-suite"
PROJECT_NAME=""
PROJECT_PATH=""
ASCEND_ENV_SCRIPT=""
CREATE_BY=""

while [ $# -gt 0 ]; do
  case "$1" in
    --project-name) PROJECT_NAME="$2"; shift 2;;
    --project-path) PROJECT_PATH="$2"; shift 2;;
    --ascend-env-script) ASCEND_ENV_SCRIPT="$2"; shift 2;;
    --create-by) CREATE_BY="$2"; shift 2;;
    -h|--help) show_help; exit 0;;
    *) echo "Unknown arg: $1" >&2; show_help; exit 2;;
  esac
done

if [ -z "$PROJECT_NAME" ] || [ -z "$PROJECT_PATH" ]; then
  echo "--project-name and --project-path are required" >&2
  exit 2
fi

DATA_DIR_FULL="$DATA_DIR/data"
PROJECTS_FILE="$DATA_DIR_FULL/projects.json"

mkdir -p "$DATA_DIR_FULL"

# Ensure projects.json exists and is valid-ish. If invalid, reinitialize.
if [ ! -f "$PROJECTS_FILE" ]; then
  printf '%s\n' '{"lastId":0,"projects":[]}' > "$PROJECTS_FILE"
fi

# Basic sanity check: must contain keys used by the tool. If missing, reinit.
if ! grep -q '"lastId"' "$PROJECTS_FILE" || ! grep -q '"projects"' "$PROJECTS_FILE"; then
  echo 'projects.json invalid or unreadable, reinitializing' >&2
  printf '%s\n' '{"lastId":0,"projects":[]}' > "$PROJECTS_FILE"
fi

# Ensure .vscode/launch.json exists in the project path (mirrors ensureLaunchJsonExists)
ensure_launch_json() {
  local p="$1"
  local vsdir="$p/.vscode"
  mkdir -p "$vsdir"
  local lj="$vsdir/launch.json"
  if [ ! -f "$lj" ]; then
    echo '{"version":"0.2.0","configurations":[]}' > "$lj"
  fi
}

ensure_launch_json "$PROJECT_PATH"

# Shell implementation for create/update (no node dependency).

json_escape() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\\"/g'
}

read_lastId() {
  local v
  v=$(sed -n 's/.*"lastId"[[:space:]]*:[[:space:]]*\([0-9][0-9]*\).*/\1/p' "$PROJECTS_FILE")
  if [ -z "$v" ]; then
    echo 0
  else
    echo "$v"
  fi
}

lastId=$(read_lastId)

# Extract projects array content
projects_raw=$(sed -n '/"projects"[[:space:]]*:[[:space:]]*\[/, /\]/p' "$PROJECTS_FILE")
projects_content=$(printf '%s\n' "$projects_raw" | sed '1d;$d')
# If the file previously contained literal "\\n" sequences (from earlier bugs),
# expand them into real newlines so we can correctly split objects.
projects_content=$(printf '%b' "$projects_content")

# Split objects into bash array
projects_list=()
current=""
inside=0
while IFS= read -r line; do
  trimmed=$(echo "$line" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
  if echo "$trimmed" | grep -q '^\{'; then
    inside=1
    current="$line"
  elif [ $inside -eq 1 ]; then
    current="$current"$'\n'"$line"
    if echo "$trimmed" | grep -q '^}\,\?$' || echo "$trimmed" | grep -q '^}$'; then
      inside=0
      # remove trailing comma after closing brace if present
      current=$(printf '%s\n' "$current" | sed -E '$s/}[[:space:]]*,[[:space:]]*$/}/')
      projects_list+=("$current")
      current=""
    fi
  fi
done <<< "$projects_content"


# Find existing by project_path
existing_index=-1
existing_id=""
for i in "${!projects_list[@]}"; do
  p="${projects_list[$i]}"
  oneline=$(printf '%s' "$p" | tr -d '\n' | sed 's/[[:space:]]\+/ /g')
  if echo "$oneline" | grep -Fq "\"project_path\": \"$PROJECT_PATH\""; then
    existing_index=$i
    existing_id=$(echo "$oneline" | sed -n 's/.*"id"[[:space:]]*:[[:space:]]*\([0-9][0-9]*\).*/\1/p')
    break
  fi
done

now_iso=$(date -u +'%Y-%m-%dT%H:%M:%SZ')

if [ "$existing_index" -ge 0 ]; then
  if [ -z "$ASCEND_ENV_SCRIPT" ]; then
    printf '%s\n' "$existing_id"
    exit 0
  fi
  # Rebuild the existing object, updating ascend_env_script and update_time
  old="${projects_list[$existing_index]}"
  oneline=$(printf '%s' "$old" | tr -d '\n' | sed 's/[[:space:]]\+/ /g')
  id=$(echo "$oneline" | sed -n 's/.*"id"[[:space:]]*:[[:space:]]*\([0-9][0-9]*\).*/\1/p')
  pname=$(echo "$oneline" | sed -n 's/.*"project_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
  ppath=$(echo "$oneline" | sed -n 's/.*"project_path"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
  cby=$(echo "$oneline" | sed -n 's/.*"create_by"[[:space:]]*:[[:space:]]*\("[^"]*"\|null\).*/\1/p' | sed 's/^"//;s/"$//')
  ctime=$(echo "$oneline" | sed -n 's/.*"create_time"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
  esc_ascend=$(json_escape "$ASCEND_ENV_SCRIPT")
  if [ -z "$esc_ascend" ]; then
    ascend_val=null
  else
    ascend_val="\"$esc_ascend\""
  fi
  if [ -z "$cby" ] || [ "$cby" = null ]; then
    create_by_val=null
  else
    create_by_val="\"$(json_escape "$cby")\""
  fi
  new_obj=$(cat <<-JSON
  {
    "id": $id,
    "project_name": "$(json_escape "$pname")",
    "project_path": "$(json_escape "$ppath")",
    "ascend_env_script": $ascend_val,
    "create_by": $create_by_val,
    "create_time": "$ctime",
    "update_by": null,
    "update_time": "$now_iso"
  }
JSON
)
  projects_list[$existing_index]="$new_obj"
  tmp=$(mktemp)
  printf '{\n  "lastId": %s,\n  "projects": [\n' "$lastId" > "$tmp"
  first=1
  for item in "${projects_list[@]}"; do
    if [ -n "$(printf '%s' "$item" | tr -d '[:space:]')" ]; then
      if [ "$first" -eq 1 ]; then
        first=0
      else
        printf ',\n' >> "$tmp"
      fi
      printf '%s' "$item" >> "$tmp"
    fi
  done
  printf '\n  ]\n}\n' >> "$tmp"
  mv "$tmp" "$PROJECTS_FILE"
  printf '%s\n' "$existing_id"
  exit 0
fi

# Create new record
nextId=$((lastId + 1))
esc_pname=$(json_escape "$PROJECT_NAME")
esc_ppath=$(json_escape "$PROJECT_PATH")
if [ -z "$ASCEND_ENV_SCRIPT" ]; then
  ascend_val=null
else
  ascend_val="\"$(json_escape "$ASCEND_ENV_SCRIPT")\""
fi
if [ -z "$CREATE_BY" ]; then
  create_by_val=null
else
  create_by_val="\"$(json_escape "$CREATE_BY")\""
fi
record=$(cat <<-JSON
  {
    "id": $nextId,
    "project_name": "$esc_pname",
    "project_path": "$esc_ppath",
    "ascend_env_script": $ascend_val,
    "create_by": $create_by_val,
    "create_time": "$now_iso",
    "update_by": null,
    "update_time": "$now_iso"
  }
JSON
)
projects_list+=("$record")
tmp=$(mktemp)
printf '{\n  "lastId": %s,\n  "projects": [\n' "$nextId" > "$tmp"
first=1
for item in "${projects_list[@]}"; do
  if [ -n "$(printf '%s' "$item" | tr -d '[:space:]')" ]; then
    if [ "$first" -eq 1 ]; then
      first=0
    else
      printf ',\n' >> "$tmp"
    fi
    printf '%s' "$item" >> "$tmp"
  fi
done
printf '\n  ]\n}\n' >> "$tmp"
mv "$tmp" "$PROJECTS_FILE"
printf '%s\n' "$nextId"

exit 0
