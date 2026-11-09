"""Build the extension's offline benchmark from a local ForCar CSV."""

import argparse
import csv
import json
from pathlib import Path

from clean_data import clean_row


FIELDS = ("year", "make", "model", "averagePriceUsd", "averageMileageMiles", "listingCount")


def build_bundle(source, output):
    rows = set()
    with source.open(encoding="utf-8-sig", newline="") as csv_file:
        reader = csv.DictReader(csv_file)
        required = {"model_year", "make", "model", "avg_price_usd", "avg_mileage", "listings"}
        if not required.issubset(reader.fieldnames or []):
            raise ValueError("Expected the ForCar model-year pricing CSV.")
        for raw in reader:
            row, _ = clean_row(raw, "forcar")
            if row and row["year"] >= 1984:
                rows.add(tuple(row[field] for field in FIELDS))

    if not rows:
        raise ValueError("No supported vehicle records were found.")

    metadata = {
        "source": "ForCar",
        "sourceUrl": "https://forcar.org/open-data/",
        "license": "CC BY 4.0",
        "fields": FIELDS,
    }
    records = ",\n".join(json.dumps(row, ensure_ascii=False) for row in sorted(rows, key=repr))
    output.write_text(json.dumps(metadata, ensure_ascii=False)[:-1] + ',\n"records": [\n' + records + "\n]}\n", encoding="utf-8")
    return len(rows)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    print(f"Bundled {build_bundle(args.source, args.output):,} ForCar records.")
