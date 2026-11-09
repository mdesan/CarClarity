# CarClarity — CSV data-cleaning package

Python standard-library script for preparing ForCar model-year market pricing data and optionally a Kaggle Craigslist dataset. **No original datasets are included.** Run this locally after downloading the source CSVs and confirming their license/terms.

## Run

From this folder:

```bash
python clean_data.py --forcar path/to/used-car-prices-by-model-year.csv --output output
python clean_data.py --craigslist path/to/craigslist.csv --output output
python -m unittest discover -s tests -v
```

If `python` is unavailable, try `python3` or `py` on Windows. No pip packages required.

## Files produced

To refresh the offline benchmark shipped with the extension, run this from the repository root using the local ForCar model-year CSV:

```bash
python data-cleaning/build_forcar_bundle.py datasets/ForCar/used-car-prices-by-model-year.csv extension/data/forcar-market.json
```

The bundle uses asking-price averages, sample counts, and average mileage. Source: [ForCar Open Data](https://forcar.org/open-data/) ([CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)).

- `output/forcar_cleaned.json` or `output/craigslist_cleaned.json`: normalized rows.
- `output/forcar_quality_report.json` or `output/craigslist_quality_report.json`: row counts, exact duplicates removed, and up to 100 rejection examples.

The normalized fields follow the project plan's DS.4 Market Price Reference schema: `year`, `make`, `model`, `listingCount`, `averagePriceUsd`, `averageMileageMiles`, `observedMinUsd`, `observedMaxUsd`, `dataStatus`, `source`.

## Important integration notes

- This is **not** a finished market valuation or deal-classification engine. It preserves source pricing benchmarks and marks rows with absent/low listing counts as `limited`.
- No arbitrary price thresholds or fabricated mileage/price ranges are added.
- The script removes only **exactly identical cleaned rows**, not every repeated year/make/model: distinct listings must remain distinct. Ask the team whether individual Craigslist listings should instead be aggregated by year/make/model.
- Dataset headers differ. Supported aliases include `year`, `make`, `model`, `price`, `average_price`, `listing_count`, `mileage`, and several variants. If the actual Kaggle CSV has a combined `year make model` field, adapt the parser after inspecting its headers.
- `dataStatus` is a conservative indicator, **not** evidence of a reliable market valuation. `observedMinUsd` and `observedMaxUsd` are observed extremes, not a recommended fair-price range.
- The team should decide whether generated JSON belongs in version control after checking data licensing and file size. For large datasets, commit only scripts/tests and share the generated artifact separately.

## Suggested Git workflow

1. Clone the team repo and create branch `feature/market-data-cleaning`.
2. Copy this package under a new `data-cleaning/` directory, keeping teammates' files unchanged.
3. Run tests and script against actual datasets; inspect quality reports.
4. `git add data-cleaning/` then `git commit -m "Add market CSV cleaning pipeline"`.
5. `git push -u origin feature/market-data-cleaning`, then open a pull request to `main`.

## Limitations

This package has been unit-tested on illustrative data, but **has not been run on the actual ForCar/Kaggle source CSVs**. Inspect their actual column names and source definitions before integration. Do not treat this as a completed real-data cleaning job until those checks pass.
