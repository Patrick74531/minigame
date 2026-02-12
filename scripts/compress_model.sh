#!/bin/bash

# Super Compatible Compression
# Targets <10KB by aggressively resizing texture to 64x64 (keeping PNG format).

INPUT_FILE="$1"
OUTPUT_FILE="$2"

if [ -z "$1" ]; then
  echo "Usage: $0 <input_file> [output_file]"
  exit 1
fi

if [ -z "$OUTPUT_FILE" ]; then
  DIR=$(dirname "$INPUT_FILE")
  BASENAME=$(basename "$INPUT_FILE" .glb)
  OUTPUT_FILE="$DIR/${BASENAME}_super_compatible.glb"
fi

TEMP_FILE="temp_process_super.glb"

echo "Processing $INPUT_FILE (Super Compatible Mode)..."

# 1. Resize Texture to 64x64 (Aggressive)
# 128x128 PNG was ~20KB. 64x64 should be ~5KB or less.
npx gltf-transform resize "$INPUT_FILE" "$TEMP_FILE" --width 32 --height 32

# 2. Weld
npx gltf-transform weld "$TEMP_FILE" "$TEMP_FILE"

# 3. Simplify
# Ratio 0.05
npx gltf-transform simplify "$TEMP_FILE" "$TEMP_FILE" --ratio 0.05 --error 0.01

# 4. Draco Compression
npx gltf-transform draco "$TEMP_FILE" "$OUTPUT_FILE" --method edgebreaker

# Cleanup
rm "$TEMP_FILE"

ls -lh "$OUTPUT_FILE"
