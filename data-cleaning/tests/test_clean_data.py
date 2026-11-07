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
    def test_missing(self):
        r, error = clean_row({'year':'2018','make':'Toyota','model':'Camry','price':''},'forcar')
        self.assertIsNone(r)
        self.assertIsNotNone(error)
    def test_invalid_range(self):
        r, _ = clean_row({'year':'2018','make':'Toyota','model':'Camry','price':'10000','min_price':'20000','max_price':'5000'},'forcar')
        self.assertIsNone(r['observedMinUsd'])
if __name__ == '__main__': unittest.main()
