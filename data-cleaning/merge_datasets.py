"""Import and deduplicate Craigslist CSV/ZIP datasets into a disk-backed SQLite database.

Place beside the existing clean_data.py. ForCar benchmarks stay separate.
"""
import argparse
import csv
import hashlib
import io
import json
import sqlite3
import zipfile
from contextlib import contextmanager
from pathlib import Path
from contextlib import closing
from clean_data import clean_row


@contextmanager
def csv_rows(path):
    path = Path(path)
    if path.suffix.lower() == '.zip':
        with zipfile.ZipFile(path) as archive:
            names = [n for n in archive.namelist() if n.lower().endswith('.csv') and not n.endswith('/')]
            if len(names) != 1:
                raise ValueError(f'{path}: expected exactly one CSV inside ZIP, found {len(names)}')
            with archive.open(names[0]) as raw:
                with io.TextIOWrapper(raw, encoding='utf-8-sig', newline='') as stream:
                    yield csv.DictReader(stream)
    else:
        with path.open(encoding='utf-8-sig', newline='') as stream:
            yield csv.DictReader(stream)


def merge(inputs, database, report_path, batch_size=2000):
    """First occurrence of each listing ID wins; no-ID exact normalized rows dedupe."""
    database, report_path = Path(database), Path(report_path)
    database.parent.mkdir(parents=True, exist_ok=True)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    # New database per run avoids retaining stale rows from a previous import.
    if database.exists():
        raise FileExistsError(f'{database} already exists; choose a new path or remove the old output')
    stats = {'inputs': [], 'totalRows': 0, 'acceptedRows': 0, 'rejectedRows': 0,
             'duplicateListingIds': 0, 'conflictingListingIds': 0,
             'duplicateRowsWithoutId': 0, 'outputRows': 0, 'rejectionExamples': []}
    try:
        with closing(sqlite3.connect(database)) as db, db:
            db.execute('CREATE TABLE listings (listing_key TEXT PRIMARY KEY, listing_id TEXT, year INTEGER, make TEXT, model TEXT, asking_price REAL, odometer REAL, source_file TEXT, payload TEXT NOT NULL)')
            db.execute('CREATE INDEX listing_model_idx ON listings (year, make, model)')
            for path in map(Path, inputs):
                file_stats = {'file': path.name, 'totalRows': 0, 'acceptedRows': 0, 'rejectedRows': 0}
                with csv_rows(path) as reader:
                    required = {'year', 'model', 'price'}
                    headers = {x.strip().lower() for x in (reader.fieldnames or [])}
                    if not required.issubset(headers) or not ({'manufacturer', 'make'} & headers):
                        raise ValueError(f'{path}: missing expected Craigslist columns (year, manufacturer/make, model, price)')
                    for line, raw in enumerate(reader, 2):
                        stats['totalRows'] += 1
                        file_stats['totalRows'] += 1
                        cleaned, reason = clean_row(raw, 'craigslist')
                        if reason:
                            stats['rejectedRows'] += 1
                            file_stats['rejectedRows'] += 1
                            if len(stats['rejectionExamples']) < 15:
                                stats['rejectionExamples'].append({'file': path.name, 'line': line, 'reason': reason})
                            continue
                        stats['acceptedRows'] += 1
                        file_stats['acceptedRows'] += 1
                        lid = str(cleaned.get('listingId') or '').strip()
                        serialized = json.dumps(cleaned, sort_keys=True, separators=(',', ':'))
                        key = ('id:' + lid) if lid else ('record:' + hashlib.sha256(serialized.encode()).hexdigest())
                        prior = db.execute('SELECT payload FROM listings WHERE listing_key=?', (key,)).fetchone()
                        if prior:
                            if lid:
                                stats['duplicateListingIds'] += 1
                                if prior[0] != serialized:
                                    stats['conflictingListingIds'] += 1
                            else:
                                stats['duplicateRowsWithoutId'] += 1
                            continue
                        db.execute('INSERT INTO listings VALUES (?,?,?,?,?,?,?,?,?)',
                                   (key, lid or None, cleaned['year'], cleaned['make'], cleaned['model'],
                                    cleaned['askingPriceUsd'], cleaned.get('odometerMiles'), path.name, serialized))
                        if stats['totalRows'] % batch_size == 0:
                            db.commit()
                db.commit()
                stats['inputs'].append(file_stats)
            stats['outputRows'] = db.execute('SELECT COUNT(*) FROM listings').fetchone()[0]
        stats['notes'] = ['First occurrence of a listing ID wins; input order determines priority.',
                          'Rows without IDs are deduplicated only by exact normalized content.',
                          'ForCar aggregate benchmarks are intentionally excluded.',
                          'The source CSV may be historical; these are not verified live listings.']
        report_path.write_text(json.dumps(stats, indent=2) + '\n', encoding='utf-8')
        return stats
    except Exception:
        if database.exists():
            database.unlink()
        raise


def main():
    p = argparse.ArgumentParser(description='Merge raw Craigslist CSV and ZIP datasets into SQLite')
    p.add_argument('inputs', nargs='+', type=Path, help='CSV/ZIP files in priority order')
    p.add_argument('--database', type=Path, default=Path('output/combined/craigslist_merged.sqlite'))
    p.add_argument('--report', type=Path, default=Path('output/combined/craigslist_merge_report.json'))
    a = p.parse_args()
    stats = merge(a.inputs, a.database, a.report)
    print(f"{stats['totalRows']} input rows; {stats['outputRows']} unique usable listings; {stats['rejectedRows']} rejected")
    print(f"{stats['duplicateListingIds']} duplicate listing IDs ({stats['conflictingListingIds']} conflicting)")
    print(f'Output: {a.database} | Report: {a.report}')


if __name__ == '__main__':
    main()
