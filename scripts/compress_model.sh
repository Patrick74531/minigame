#!/bin/bash

# Check if input file is provided
if [ -z "$1" ]; then
  echo "Usage: $0 <input_file> [output_file]"
  exit 1
fi

INPUT_FILE="$1"
OUTPUT_FILE="$2"

# If output file is not provided, use a default name in the same directory
if [ -z "$OUTPUT_FILE" ]; then
  DIR=$(dirname "$INPUT_FILE")
  BASENAME=$(basename "$INPUT_FILE" .glb)
  OUTPUT_FILE="$DIR/${BASENAME}_compressed.glb"
fi

# Create output directory if it doesn't exist
mkdir -p "$(dirname "$OUTPUT_FILE")"

# Run gltf-transform optimize
echo "Compressing $INPUT_FILE to $OUTPUT_FILE..."
npx gltf-transform optimize "$INPUT_FILE" "$OUTPUT_FILE" --compress draco --texture-compress webp

# Check if compression was successful
if [ $? -eq 0 ]; then
  echo "Compression successful!"
  ls -lh "$OUTPUT_FILE"
else
  echo "Compression failed."
  exit 1
fi
