#!/usr/bin/env python3
"""Compatibility wrapper for the homepage renderer."""

from pathlib import Path
import runpy
import sys


SCRIPT = Path(__file__).resolve().parent / "python" / "phononweb" / "scripts" / "render_homepage.py"

if __name__ == "__main__":
    sys.argv = [str(SCRIPT), *sys.argv[1:]]
    runpy.run_path(str(SCRIPT), run_name="__main__")
