import csv
import unittest
from clean_data import clean_row, number, normalize_name

class CleaningTests(unittest.TestCase):
    def test_money(self):
        self.assertEqual(number('$15,200'), 15200)
    def test_name(self):
        self.assertEqual(normalize_name('  TOYOTA  '), 'Toyota')
    def test_valid(self):
        r, error = clean_row({'year':'2018','make':'TOYOTA','model':'CAMRY','average_price':'$15,000','listing_count':'10'}, 'forcar')
        self.assertIsNone(error)
        self.assertEqual(r['averagePriceUsd'],15000)
        self.assertEqual(r['dataStatus'],'usable benchmark')

    def test_future_year(self):
        r, error = clean_row(
            {'year': '2099', 'make': 'Toyota',
            'model': 'Camry', 'price': '15000'},
            'craigslist'
        )

        self.assertIsNone(r)
        self.assertIsNotNone(error)

    def test_duplicate_listing_id(self):
        import tempfile
        from pathlib import Path
        from clean_data import process

        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            csv_path = temp_path / 'vehicles.csv'
            output_dir = temp_path / 'output'

            with csv_path.open('w', newline='', encoding='utf-8') as f:
                writer = csv.DictWriter(
                    f,
                    fieldnames=['id', 'year', 'manufacturer', 'model', 'price']
                )
                writer.writeheader()

                writer.writerow({
                    'id': '12345',
                    'year': '2020',
                    'manufacturer': 'Toyota',
                    'model': 'Camry',
                    'price': '18000'
                })

                writer.writerow({
                    'id': '12345',
                    'year': '2020',
                    'manufacturer': 'Toyota',
                    'model': 'Camry',
                    'price': '17500'
                })

            target, report = process(csv_path, 'craigslist', output_dir)

            self.assertEqual(report['totalRows'], 2)
            self.assertEqual(report['exactDuplicatesRemoved'], 1)
            self.assertEqual(report['outputRows'], 1)

            import json
            cleaned = json.loads(target.read_text(encoding='utf-8'))

            self.assertEqual(len(cleaned), 1)
            self.assertEqual(cleaned[0]['listingId'], '12345')
            self.assertEqual(cleaned[0]['askingPriceUsd'], 18000)

    def test_missing(self):
        r, error = clean_row({'year':'2018','make':'Toyota','model':'Camry','price':''},'forcar')
        self.assertIsNone(r)
        self.assertIsNotNone(error)
    def test_invalid_range(self):
        r, _ = clean_row({'year':'2018','make':'Toyota','model':'Camry','price':'10000','min_price':'20000','max_price':'5000'},'forcar')
        self.assertIsNone(r['observedMinUsd'])

    def test_craigslist_odometer(self):
        row = {
            'id': '12345',
            'year': '2020',
            'manufacturer': 'Toyota',
            'model': 'Camry',
            'price': '18000',
            'odometer': '85000'
        }

        cleaned, error = clean_row(row, 'craigslist')

        self.assertIsNone(error)
        self.assertEqual(cleaned['odometerMiles'], 85000)
        self.assertNotIn('averageMileageMiles', cleaned)

    def test_craigslist_data_status(self):
        row = {
            'id': '12345',
            'year': '2020',
            'manufacturer': 'Toyota',
            'model': 'Camry',
            'price': '18000'
        }

        cleaned, error = clean_row(row, 'craigslist')

        self.assertIsNone(error)
        self.assertEqual(cleaned['dataStatus'], 'valid listing')
if __name__ == '__main__': unittest.main()
