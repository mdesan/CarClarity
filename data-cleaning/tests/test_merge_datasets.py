import csv
import tempfile
import unittest
import zipfile
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from merge_datasets import merge


class MergeTests(unittest.TestCase):
    def test_csv_and_zip_deduplication(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            fields = ['id', 'year', 'manufacturer', 'model', 'price', 'odometer']
            first = root / 'first.csv'
            with first.open('w', newline='') as f:
                w = csv.DictWriter(f, fieldnames=fields)
                w.writeheader()
                w.writerow(dict(id='100', year='2020', manufacturer='Toyota', model='Camry', price='10000', odometer='50000'))
                w.writerow(dict(id='101', year='2020', manufacturer='Toyota', model='Camry', price='11000', odometer='50000'))
            second = root / 'second.zip'
            with second.open('wb') as f:
                pass
            with zipfile.ZipFile(second, 'w') as z:
                z.writestr('vehicles.csv', 'id,year,manufacturer,model,price,odometer\n100,2020,Toyota,Camry,12000,50000\n102,2021,Honda,Civic,13000,30000\n')
            stats = merge([first, second], root / 'out.sqlite', root / 'report.json')
            self.assertEqual(stats['totalRows'], 4)
            self.assertEqual(stats['outputRows'], 3)
            self.assertEqual(stats['duplicateListingIds'], 1)
            self.assertEqual(stats['conflictingListingIds'], 1)


if __name__ == '__main__':
    unittest.main()
