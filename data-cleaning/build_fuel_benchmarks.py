"""Print an offline class benchmark from the FuelEconomy.gov vehicles CSV zip."""

import csv
import io
import json
import sys
from collections import defaultdict
from statistics import median
from zipfile import ZipFile


def build_benchmarks(archive):
    groups = defaultdict(list)
    with ZipFile(archive) as source, source.open("vehicles.csv") as raw:
        for row in csv.DictReader(io.TextIOWrapper(raw, encoding="utf-8-sig")):
            fuel = row["fuelType1"].strip().lower()
            if not (fuel.endswith("gasoline") or fuel == "diesel"):
                continue
            if "plug-in" in row["atvType"].lower() or row["fuelType2"].strip():
                continue
            mpg = int(row["comb08"])
            vehicle_class = row["VClass"].strip()
            if mpg > 0 and vehicle_class:
                groups[(int(row["year"]), vehicle_class, fuel)].append(mpg)

    return [[*key, median(values), len(values)] for key, values in sorted(groups.items())
            if len(values) >= 5]


if __name__ == "__main__":
    records = build_benchmarks(sys.argv[1])
    print("[")
    print(",\n".join(json.dumps(record, separators=(",", ":")) for record in records))
    print("]")
