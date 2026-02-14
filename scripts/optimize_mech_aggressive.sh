#!/bin/bash
INPUT="$1"
OUTPUT="$2"

if [ -z "$INPUT" ] || [ -z "$OUTPUT" ]; then
  echo "Usage: ./optimize_mech_aggressive.sh <input.glb> <output.glb>"
  exit 1
fi

echo "Aggressively Optimizing $INPUT -> $OUTPUT"

# Aggressive settings:
# - Texture: 128x128 (was 256x256)
# - Simplify: ratio 0.2 (was 0.5), error 0.05 (was 0.001)

npx gltf-transform resize "$INPUT" temp_agg_1.glb --width 128 --height 128
npx gltf-transform weld temp_agg_1.glb temp_agg_2.glb
npx gltf-transform simplify temp_agg_2.glb temp_agg_3.glb --ratio 0.2 --error 0.05
npx gltf-transform draco temp_agg_3.glb "$OUTPUT" --method edgebreaker

rm temp_agg_1.glb temp_agg_2.glb temp_agg_3.glb

ls -lh "$INPUT"
ls -lh "$OUTPUT"
