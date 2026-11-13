"""Rebuild an APK from an extracted tree, keeping each original entry's
compression method and order. Old signature files in META-INF are dropped;
entries that no longer exist are skipped and new files are appended deflated.

usage: python3 repack.py <original.apk> <extracted-dir> <out.apk>
"""
import os
import sys
import zipfile

src, tree, out = sys.argv[1:4]
SIG = (".SF", ".RSA", ".DSA", ".EC")

with zipfile.ZipFile(src) as zin, zipfile.ZipFile(out, "w") as zout:
    seen = set()
    for info in zin.infolist():
        name = info.filename
        if name.startswith("META-INF/") and (name.endswith(SIG) or name == "META-INF/MANIFEST.MF"):
            continue
        path = os.path.join(tree, name)
        if name.endswith("/") or not os.path.isfile(path):
            continue
        zi = zipfile.ZipInfo(name, date_time=info.date_time)
        zi.compress_type = info.compress_type
        zi.external_attr = info.external_attr
        with open(path, "rb") as f:
            zout.writestr(zi, f.read())
        seen.add(name)
    for root, _, files in os.walk(tree):
        for fn in sorted(files):
            path = os.path.join(root, fn)
            name = os.path.relpath(path, tree).replace(os.sep, "/")
            if name in seen or (name.startswith("META-INF/") and (name.endswith(SIG) or name == "META-INF/MANIFEST.MF")):
                continue
            zi = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
            zi.compress_type = zipfile.ZIP_DEFLATED
            with open(path, "rb") as f:
                zout.writestr(zi, f.read())
            print("added", name)
print("wrote", out)
