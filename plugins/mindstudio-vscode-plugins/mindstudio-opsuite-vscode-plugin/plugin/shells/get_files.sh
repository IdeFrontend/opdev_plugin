#!/usr/bin/env bash
set -euo pipefail

dir="${1:-}"
searchKey=""

if [ -z "$dir" ]; then
  printf '[]\n'
  exit 0
fi

if [ ! -e "$dir" ]; then
  # 输入路径不存在：把最后一段当作模糊搜索关键字，使用其父目录作为基准目录
  searchKey="$(basename "$dir")"
  parent="$(dirname "$dir")"
  if [ -z "$parent" ] || [ "$parent" = "." ]; then
    parent="."
  fi
  if [ ! -e "$parent" ]; then
    printf '%s does not exist\n' "$parent" >&2
    printf '[]\n'
    exit 0
  fi
  # resolve parent to absolute path
  if command -v realpath >/dev/null 2>&1; then
    base="$(realpath "$parent")"
  else
    pushd "$parent" >/dev/null 2>&1 || { printf '[]\n'; exit 0; }
    base="$(pwd -P)"
    popd >/dev/null 2>&1
  fi
else
  # resolve directory to absolute path
  if command -v realpath >/dev/null 2>&1; then
    base="$(realpath "$dir")"
  else
    pushd "$dir" >/dev/null 2>&1 || { printf '[]\n'; exit 0; }
    base="$(pwd -P)"
    popd >/dev/null 2>&1
  fi
fi

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT

# collect entries (non-recursive)
while IFS= read -r -d '' entry; do
  name="$(basename "$entry")"
  # 如果设置了搜索关键字，则只保留名称包含关键字的条目（子串匹配）
  if [ -n "$searchKey" ]; then
    if ! printf '%s\n' "$name" | grep -F -q "$searchKey"; then
      continue
    fi
  fi
  # resolve absolute path for the entry
  if command -v realpath >/dev/null 2>&1; then
    entry_path="$(realpath "$entry")"
  else
    entry_path="$(cd "$(dirname "$entry")" && printf '%s/%s\n' "$(pwd -P)" "$(basename "$entry")")"
  fi

  if [ -d "$entry" ]; then
    type="directory"
  else
    if [[ "$name" == *.* ]]; then
      type="${name##*.}"
    else
      type=""
    fi
  fi

  esc_name="$(printf '%s' "$name" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g')"
  esc_path="$(printf '%s' "$entry_path" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g')"
  printf '%s\t%s\n' "$name" "{\"name\":\"$esc_name\",\"path\":\"$esc_path\",\"type\":\"$type\"}" >> "$tmp"
done < <(find "$base" -mindepth 1 -maxdepth 1 -print0)

if [ ! -s "$tmp" ]; then
  printf '[]\n'
  exit 0
fi

sorted="$(mktemp)"
trap 'rm -f "$tmp" "$sorted"' EXIT

# sort by name (first field), then output JSON array
sort -t$'\t' -k1,1 "$tmp" > "$sorted"

printf '['
first=true
while IFS=$'\t' read -r _name json; do
  if $first; then
    printf '%s' "$json"
    first=false
  else
    printf ',%s' "$json"
  fi
done < "$sorted"
printf ']\n'
