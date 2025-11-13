import unittest
from prompt_extractor import extract_prompts_from_text

class TestPromptExtractor(unittest.TestCase):
    def test_single_block(self):
        s = ";"*34 + "\nA\nB\n" + ";"*34
        res = extract_prompts_from_text(s)
        self.assertEqual(len(res), 1)
        self.assertEqual(res[0], "A\nB")

    def test_multiple_blocks(self):
        s = ";"*34 + "\nX\n" + ";"*34 + "\n" + ";"*34 + "\nY\nZ\n" + ";"*34
        res = extract_prompts_from_text(s)
        self.assertEqual(len(res), 2)
        self.assertEqual(res[0], "X")
        self.assertEqual(res[1], "Y\nZ")

    def test_unclosed_block(self):
        s = ";"*34 + "\nC\nD\n"
        res = extract_prompts_from_text(s)
        self.assertEqual(len(res), 0)

    def test_no_match(self):
        s = "hello\nworld\n"
        res = extract_prompts_from_text(s)
        self.assertEqual(res, [])

    def test_marker_in_middle_invalid(self):
        s = "abc" + ";"*34 + "def\n" + ";"*34 + "\nG\n" + ";"*34
        res = extract_prompts_from_text(s)
        self.assertEqual(len(res), 1)
        self.assertEqual(res[0], "G")

if __name__ == '__main__':
    unittest.main()

