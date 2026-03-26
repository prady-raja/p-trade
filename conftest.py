"""
Root conftest.py — adds backend/ to sys.path so test files can import
`from app.main import app` without needing to be inside backend/.
"""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "backend"))
