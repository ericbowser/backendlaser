#!/bin/bash

# Convert .env to env.json
if [ ! -f ".env" ]; then
    echo "Error: .env file not found"
    exit 1
fi

echo "{" > env.json

# Read .env file and convert to JSON format
first_line=true
while IFS='=' read -r key value || [ -n "$key" ]; do
    # Skip empty lines and comments
    if [[ -z "$key" || "$key" =~ ^[[:space:]]*# ]]; then
        continue
    fi
    
    # Remove leading/trailing whitespace
    key=$(echo "$key" | xargs)
    value=$(echo "$value" | xargs)
    
    # Remove quotes from value if present
    if [[ "$value" =~ ^\".*\"$ ]] || [[ "$value" =~ ^\'.*\'$ ]]; then
        value="${value:1:-1}"
    fi
    
    # Add comma for previous line (except first)
    if [ "$first_line" = false ]; then
        sed -i '$ s/$/,/' env.json
    fi
    first_line=false
    
    # Escape quotes in value and add to JSON
    value=$(echo "$value" | sed 's/"/\\"/g')
    echo "  \"$key\": \"$value\"" >> env.json
    
done < .env

echo "}" >> env.json

echo "✓ Converted .env to env.json"

# Uninstall dotenv packages
if [ -f "package.json" ]; then
    echo "Uninstalling dotenv packages..."
    npm uninstall dotenv dotencr --save-dev
    echo "✓ Uninstalled dotenv packages"
else
    echo "Warning: package.json not found, skipping npm uninstall"
fi

echo "✓ Conversion complete!"