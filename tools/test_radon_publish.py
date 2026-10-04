"""#FR-73: тесты tools/radon_publish.py — копирование без правок, остановка при отсутствии файла и при локальных путях."""
import hashlib, pathlib, sys, tempfile, unittest
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import radon_publish as rp

NAMES = rp.FILES

def make_pub(tmp, overrides=None, skip=None):
    pub = tmp / "pub"
    pub.mkdir(parents=True, exist_ok=True)
    for name in NAMES:
        if skip is not None and name == skip:
            continue
        if overrides and name in overrides:
            data = overrides[name]
        else:
            data = ("// " + name + " Автор — контур «Радоновый риск»\n").encode("utf-8")
        (pub / name).write_bytes(data)
    return pub

class T(unittest.TestCase):
    def test_copy_byte_for_byte(self):
        with tempfile.TemporaryDirectory() as d:
            tmp = pathlib.Path(d)
            pub = make_pub(tmp)
            out = tmp / "out"
            res = rp.copy_radon(out, pub)
            self.assertEqual(res, [f"src/vendor/radon_risk/{n}" for n in NAMES] + ["src/vendor/radon_risk/SHA256.txt"])
            for n in NAMES:
                self.assertEqual((out / "src" / "vendor" / "radon_risk" / n).read_bytes(), (pub / n).read_bytes())
            sums = (out / "src/vendor/radon_risk/SHA256.txt").read_bytes().decode("utf-8")
            for n in NAMES:
                self.assertIn(f"{hashlib.sha256((pub / n).read_bytes()).hexdigest()}  {n}\n", sums)
            self.assertEqual(sums.count("\n"), len(NAMES))

    def test_missing_file(self):
        for n in NAMES:
            with tempfile.TemporaryDirectory() as d:
                tmp = pathlib.Path(d)
                pub = make_pub(tmp, skip=n)
                with self.assertRaises(rp.RadonPublishError):
                    rp.copy_radon(tmp / "out", pub)
                self.assertFalse((tmp / "out").exists())

    def test_forbidden_patterns(self):
        bads = [
            b"x " + b"Google" + b"Drive" + b" y",
            b"x " + b"Claude" + b"_files" + b" y",
            b"x " + b"books" + b"-library" + b" y",
            b"x " + b"Ver" + b"ter" + b" y",
            b"path D" + b":\\Radon\\x y"
        ]
        for bad in bads:
            for n in NAMES:
                with tempfile.TemporaryDirectory() as d:
                    tmp = pathlib.Path(d)
                    pub = make_pub(tmp, overrides={n: bad})
                    with self.assertRaises(rp.RadonPublishError):
                        rp.copy_radon(tmp / "out", pub)
                    self.assertFalse((tmp / "out").exists())

    def test_clean_urls_pass(self):
        content = b"see https://doi.org/10.1136/bmj.38308 and node --test, C" + b":/ is fine"
        with tempfile.TemporaryDirectory() as d:
            tmp = pathlib.Path(d)
            pub = make_pub(tmp, overrides={n: content for n in NAMES})
            out = tmp / "out"
            rp.copy_radon(out, pub)

if __name__ == "__main__":
    unittest.main()
