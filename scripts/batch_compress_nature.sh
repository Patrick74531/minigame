#!/bin/bash

# Target directory
TARGET_DIR="assets/resources/models/nature"
SOURCE_DIR="temp/KayKit_Forest_Nature_Pack_1.0_FREE/Assets/gltf"

# Function to compress and copy
process_model() {
    MODEL_NAME="$1"
    INPUT="$SOURCE_DIR/$MODEL_NAME.gltf"
    OUTPUT="$TARGET_DIR/$MODEL_NAME.glb"
    
    if [ -f "$INPUT" ]; then
        echo "Processing $MODEL_NAME..."
        # Reuse the logic from compress_model.sh but adapted for direct output
        # 1. Resize Texture to 64x64
        # 2. Weld
        # 3. Simplify
        # 4. Draco
        
        TEMP_FILE="temp_process_${MODEL_NAME}.glb"
        
        npx gltf-transform resize "$INPUT" "$TEMP_FILE" --width 32 --height 32
        npx gltf-transform weld "$TEMP_FILE" "$TEMP_FILE"
        npx gltf-transform simplify "$TEMP_FILE" "$TEMP_FILE" --ratio 0.05 --error 0.01
        npx gltf-transform draco "$TEMP_FILE" "$OUTPUT" --method edgebreaker
        
        rm "$TEMP_FILE"
        echo "Created $OUTPUT"
    else
        echo "Error: $INPUT not found!"
    fi
}

# List of models to process (One of each type)
# Trees
process_model "Tree_1_A_Color1"
process_model "Tree_2_A_Color1"
process_model "Tree_3_A_Color1"
process_model "Tree_4_A_Color1"
process_model "Tree_Bare_1_A_Color1"
process_model "Tree_Bare_2_A_Color1"

# Bushes
process_model "Bush_1_A_Color1"
process_model "Bush_2_A_Color1"
process_model "Bush_3_A_Color1"
process_model "Bush_4_A_Color1"

# Rocks
process_model "Rock_1_A_Color1"
process_model "Rock_2_A_Color1"
process_model "Rock_3_A_Color1"

# Grass
process_model "Grass_1_A_Color1"
process_model "Grass_2_A_Color1"

echo "Batch processing complete."
