#!/bin/bash
INPUT="$1"
OUTPUT="$2"

if [ -z "$INPUT" ] || [ -z "$OUTPUT" ]; then
  echo "Usage: ./optimize_model.sh <input.glb> <output.glb>"
  exit 1
fi

echo "Optimizing $INPUT -> $OUTPUT"

# Use standard resize to 256 (safe for mobile) but keep quality reasonable
# Weld vertices
# Simplify mesh (ratio 0.5, error 0.01) - gentle simplification
# Draco compression (essential for size)

npx gltf-transform resize "$INPUT" temp_1.glb --width 256 --height 256
npx gltf-transform weld temp_1.glb temp_2.glb
npx gltf-transform simplify temp_2.glb temp_3.glb --ratio 0.5 --error 0.001
npx gltf-transform draco temp_3.glb "$OUTPUT" --method edgebreaker

rm temp_1.glb temp_2.glb temp_3.glb

ls -lh "$INPUT"
ls -lh "$OUTPUT"
