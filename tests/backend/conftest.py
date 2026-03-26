import sys
import os

# Add backend directory to Python path so imports work from repo root
backend_path = os.path.join(os.path.dirname(__file__), '..', '..', 'backend')
sys.path.insert(0, os.path.abspath(backend_path))
