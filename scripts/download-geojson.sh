#!/bin/bash
# Downloads East Coast state zip code GeoJSON boundary files from OpenDataDE
# These files are too large for git (~300MB total), so they must be downloaded separately

DEST="public/geojson"
BASE_URL="https://raw.githubusercontent.com/OpenDataDE/State-zip-code-GeoJSON/master"

mkdir -p "$DEST"

declare -A STATES=(
  ["ct"]="ct_connecticut_zip_codes_geo.min.json"
  ["de"]="de_delaware_zip_codes_geo.min.json"
  ["fl"]="fl_florida_zip_codes_geo.min.json"
  ["ga"]="ga_georgia_zip_codes_geo.min.json"
  ["ma"]="ma_massachusetts_zip_codes_geo.min.json"
  ["md"]="md_maryland_zip_codes_geo.min.json"
  ["me"]="me_maine_zip_codes_geo.min.json"
  ["nc"]="nc_north_carolina_zip_codes_geo.min.json"
  ["nh"]="nh_new_hampshire_zip_codes_geo.min.json"
  ["nj"]="nj_new_jersey_zip_codes_geo.min.json"
  ["ny"]="ny_new_york_zip_codes_geo.min.json"
  ["pa"]="pa_pennsylvania_zip_codes_geo.min.json"
  ["ri"]="ri_rhode_island_zip_codes_geo.min.json"
  ["sc"]="sc_south_carolina_zip_codes_geo.min.json"
  ["va"]="va_virginia_zip_codes_geo.min.json"
  ["vt"]="vt_vermont_zip_codes_geo.min.json"
)

echo "Downloading GeoJSON files for 16 East Coast states..."
for code in "${!STATES[@]}"; do
  file="${STATES[$code]}"
  if [ -f "$DEST/$code.json" ]; then
    echo "  $code.json already exists, skipping"
  else
    echo "  Downloading $code.json..."
    curl -sL "$BASE_URL/$file" -o "$DEST/$code.json"
  fi
done

echo "Done! Files saved to $DEST/"
ls -lh "$DEST"
