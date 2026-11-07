"""Clean ForCar model-year pricing and optional Craigslist listing CSV files.

Standard-library only. Does not guess missing values or silently delete outliers.
"""
import argparse
import csv
import json
import re
from collections import defaultdict
from pathlib import Path

ALIASES = {
    'year': ('year', 'model_year', 'modelyear'),
    'make': ('make', 'manufacturer', 'brand'),
    'model': ('model', 'vehicle_model'),
    'averagePriceUsd': ('averagepriceusd', 'average_price', 'avg_price', 'averageprice', 'price', 'sellingprice'),
    'listingCount': ('listingcount', 'listing_count', 'listings', 'count', 'num_listings', 'number_of_listings'),
    'averageMileageMiles': ('averagemileagemiles', 'average_mileage', 'avg_mileage', 'mileage', 'odometer'),
    'averagePriceUsd': ('averagepriceusd', 'average_price', 'avg_price', 'avg_price_usd', 'averageprice', 'price', 'sellingprice'),
    'observedMinUsd': ('observedminusd', 'min_price', 'min_price_usd', 'minimum_price', 'minprice'),
    'observedMaxUsd': ('observedmaxusd', 'max_price', 'max_price_usd', 'maximum_price', 'maxprice'),
}

def key(s):
    return re.sub(r'[^a-z0-9]', '', str(s).lower())

def pick(row, field):
    wanted = {key(a) for a in ALIASES[field]}
    for k, v in row.items():
        if key(k) in wanted and v is not None and str(v).strip():
            return str(v).strip()
    return None

def number(value, integer=False):
    if value is None: return None
    s = str(value).strip().replace(',', '').replace('$', '')
    if not s or s.lower() in ('nan', 'null', 'none', 'n/a', 'unknown', '-'): return None
    try:
        n = float(s)
        if not (n == n and abs(n) != float('inf')): return None
        if integer and not n.is_integer(): return None
        return int(n) if integer else round(n, 2)
    except ValueError:
        return None

def normalize_name(value):
    if not value: return None
    return ' '.join(value.split()).casefold().title()

def clean_row(row, source):
    year = number(pick(row, 'year'), True)
    make = normalize_name(pick(row, 'make'))
    model = normalize_name(pick(row, 'model'))
    price = number(pick(row, 'averagePriceUsd'))
    if year is None or not 1886 <= year <= 2100 or not make or not model or price is None or price <= 0:
        return None, 'missing/invalid year, make, model or price'
    count = number(pick(row, 'listingCount'), True)
    mileage = number(pick(row, 'averageMileageMiles'))
    low = number(pick(row, 'observedMinUsd'))
    high = number(pick(row, 'observedMaxUsd'))
    if count is not None and count <= 0: count = None
    if mileage is not None and mileage < 0: mileage = None
    if low is not None and low <= 0: low = None
    if high is not None and high <= 0: high = None
    if low is not None and high is not None and low > high:
        low = high = None
    return dict(year=year, make=make, model=model, listingCount=count,
                averagePriceUsd=price, averageMileageMiles=mileage,
                observedMinUsd=low, observedMaxUsd=high,
                dataStatus='usable benchmark' if count is not None and count >= 5 else 'limited',
                source=source), None

def process(path, source, out_dir):
    records, rejected = [], []
    with path.open('r', encoding='utf-8-sig', newline='') as f:
        reader = csv.DictReader(f)
        if not reader.fieldnames: raise ValueError(f'{path}: no CSV header')
        for line, row in enumerate(reader, 2):
            cleaned, reason = clean_row(row, source)
            if reason: rejected.append({'line': line, 'reason': reason})
            else: records.append(cleaned)
    # Exact duplicates only: do not merge same year/make/model records because they may
    # represent distinct listings or overlapping market aggregates.
    unique, seen = [], set()
    for r in records:
        signature = json.dumps(r, sort_keys=True)
        if signature not in seen:
            seen.add(signature); unique.append(r)
    unique.sort(key=lambda r: (r['year'], r['make'], r['model'], r['averagePriceUsd']))
    out_dir.mkdir(parents=True, exist_ok=True)
    target = out_dir / f'{source}_cleaned.json'
    target.write_text(json.dumps(unique, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    report = {'source': source, 'inputFile': path.name, 'totalRows': len(records)+len(rejected),
              'acceptedRowsBeforeDeduplication': len(records), 'exactDuplicatesRemoved': len(records)-len(unique),
              'outputRows': len(unique), 'rejectedRows': len(rejected), 'rejections': rejected[:100],
              'notes': ['Prices are source averages/asking prices, not verified fair-market valuations.',
                        'Rows sharing year/make/model are not merged without source-specific rules.',
                        'Missing listing counts/ranges remain null; no estimates are fabricated.']}
    (out_dir / f'{source}_quality_report.json').write_text(json.dumps(report, indent=2)+'\n', encoding='utf-8')
    return target, report

def main():
    p = argparse.ArgumentParser(description='Clean CarClarity market CSVs')
    p.add_argument('--forcar', type=Path, help='ForCar model-year pricing CSV')
    p.add_argument('--craigslist', type=Path, help='CraigsList/Kaggle CSV (must contain year/make/model/price columns)')
    p.add_argument('--output', type=Path, default=Path('output'))
    args = p.parse_args()
    if not args.forcar and not args.craigslist: p.error('Provide --forcar and/or --craigslist')
    for source, path in [('forcar', args.forcar), ('craigslist', args.craigslist)]:
        if path:
            target, report = process(path, source, args.output)
            print(f'{source}: {report["outputRows"]} rows written to {target}; {report["rejectedRows"]} rejected')
if __name__ == '__main__': main()
