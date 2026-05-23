#!/bin/bash

# Find the highest existing number (E###.ext → ###)
last=$(ls E[0-9][0-9][0-9].* 2>/dev/null | sed -E 's/[^0-9]//g' | sort -n | tail -1)
[ -z "$last" ] && last=0

a=$((last + 1))

# Collect all images (case-insensitive) and sort by name
files=$(ls *.{jpg,JPG,jpeg,JPEG,png,PNG,gif,GIF,bmp,BMP,tiff,TIFF,webp,WEBP} 2>/dev/null | sort)

for i in $files; do
  [[ $i == E[0-9][0-9][0-9].* ]] && continue  # Skip already renamed
  ext="${i##*.}"   # Preserve original extension
  new=$(printf "E%03d.%s" "$a" "$ext")
  mv -- "$i" "$new"
  a=$((a+1))
done

echo "Done! Added new images up to E$(printf "%03d" $((a-1))).<ext>"

