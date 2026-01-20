#!/usr/bin/env python3
"""
NOAA Space Weather FTP Test Script

Tests connectivity to ftp.swpc.noaa.gov/pub/warehouse and explores available data.
Run locally to verify FTP access and discover historical data structure.

Usage:
    python test_noaa_ftp.py
    python test_noaa_ftp.py --year 2024
    python test_noaa_ftp.py --download-sample
"""

import ftplib
import argparse
import sys
from datetime import datetime
from pathlib import Path


FTP_HOST = "ftp.swpc.noaa.gov"
FTP_BASE_PATH = "/pub/warehouse"


def connect_ftp():
    """Establish FTP connection to NOAA server."""
    print(f"Connecting to {FTP_HOST}...")
    try:
        ftp = ftplib.FTP(FTP_HOST, timeout=30)
        ftp.login()  # Anonymous login
        print(f"✓ Connected successfully")
        print(f"  Welcome: {ftp.getwelcome()}")
        return ftp
    except ftplib.all_errors as e:
        print(f"✗ Connection failed: {e}")
        return None


def list_directory(ftp, path, max_items=50):
    """List contents of an FTP directory."""
    print(f"\nListing: {path}")
    print("-" * 60)

    try:
        ftp.cwd(path)
        items = []
        ftp.retrlines('LIST', items.append)

        dirs = []
        files = []

        for item in items[:max_items]:
            parts = item.split()
            if len(parts) >= 9:
                name = ' '.join(parts[8:])
                size = parts[4]
                is_dir = item.startswith('d')

                if is_dir:
                    dirs.append(name)
                else:
                    files.append((name, size))

        if dirs:
            print(f"\nDirectories ({len(dirs)}):")
            for d in sorted(dirs)[:20]:
                print(f"  📁 {d}/")
            if len(dirs) > 20:
                print(f"  ... and {len(dirs) - 20} more")

        if files:
            print(f"\nFiles ({len(files)}):")
            for name, size in sorted(files)[:20]:
                size_kb = int(size) / 1024
                print(f"  📄 {name} ({size_kb:.1f} KB)")
            if len(files) > 20:
                print(f"  ... and {len(files) - 20} more")

        if len(items) > max_items:
            print(f"\n  (Showing first {max_items} of {len(items)} items)")

        return dirs, files

    except ftplib.error_perm as e:
        print(f"✗ Permission error: {e}")
        return [], []


def explore_warehouse(ftp):
    """Explore the warehouse structure."""
    print("\n" + "=" * 60)
    print("EXPLORING WAREHOUSE STRUCTURE")
    print("=" * 60)

    # List top level
    dirs, files = list_directory(ftp, FTP_BASE_PATH)

    # Check for year directories
    years = [d for d in dirs if d.isdigit() and len(d) == 4]
    if years:
        print(f"\n✓ Found {len(years)} year directories: {min(years)} to {max(years)}")

        # Explore most recent year
        latest_year = max(years)
        print(f"\nExploring latest year: {latest_year}")
        year_dirs, year_files = list_directory(ftp, f"{FTP_BASE_PATH}/{latest_year}")

        # Sample a subdirectory if available
        if year_dirs:
            sample_dir = year_dirs[0]
            print(f"\nSample subdirectory: {latest_year}/{sample_dir}")
            list_directory(ftp, f"{FTP_BASE_PATH}/{latest_year}/{sample_dir}")


def explore_year(ftp, year):
    """Explore a specific year's data."""
    print("\n" + "=" * 60)
    print(f"EXPLORING YEAR: {year}")
    print("=" * 60)

    year_path = f"{FTP_BASE_PATH}/{year}"
    dirs, files = list_directory(ftp, year_path)

    # Show all subdirectories for this year
    for subdir in dirs[:5]:
        print(f"\n--- {year}/{subdir} ---")
        list_directory(ftp, f"{year_path}/{subdir}")


def download_sample(ftp, output_dir="./ftp_samples"):
    """Download a sample file to verify access."""
    print("\n" + "=" * 60)
    print("DOWNLOADING SAMPLE FILE")
    print("=" * 60)

    Path(output_dir).mkdir(exist_ok=True)

    try:
        # Navigate to a recent year
        ftp.cwd(FTP_BASE_PATH)
        items = []
        ftp.retrlines('NLST', items.append)

        years = [d for d in items if d.isdigit() and len(d) == 4]
        if not years:
            print("✗ No year directories found")
            return

        latest_year = max(years)
        ftp.cwd(latest_year)

        # Find a small file to download
        subdirs = []
        ftp.retrlines('NLST', subdirs.append)

        for subdir in subdirs[:5]:
            try:
                ftp.cwd(subdir)
                files = []
                ftp.retrlines('LIST', files.append)

                for item in files:
                    parts = item.split()
                    if len(parts) >= 9 and not item.startswith('d'):
                        size = int(parts[4])
                        name = ' '.join(parts[8:])

                        # Download files under 100KB
                        if size < 100000 and (name.endswith('.txt') or name.endswith('.json')):
                            output_path = Path(output_dir) / name
                            print(f"Downloading: {name} ({size/1024:.1f} KB)")

                            with open(output_path, 'wb') as f:
                                ftp.retrbinary(f'RETR {name}', f.write)

                            print(f"✓ Saved to: {output_path}")

                            # Show preview
                            with open(output_path, 'r', errors='ignore') as f:
                                preview = f.read(500)
                                print(f"\nPreview:\n{preview[:500]}...")
                            return

                ftp.cwd('..')
            except:
                ftp.cwd('..')
                continue

        print("✗ No suitable sample file found")

    except ftplib.all_errors as e:
        print(f"✗ Download failed: {e}")


def test_specific_paths(ftp):
    """Test known data paths that might be useful."""
    print("\n" + "=" * 60)
    print("TESTING KNOWN DATA PATHS")
    print("=" * 60)

    test_paths = [
        "/pub/warehouse",
        "/pub/lists",
        "/pub/forecasts",
        "/pub/indices",
    ]

    for path in test_paths:
        try:
            ftp.cwd(path)
            items = []
            ftp.retrlines('NLST', items.append)
            print(f"✓ {path} - {len(items)} items")
        except ftplib.error_perm:
            print(f"✗ {path} - not accessible")


def print_summary():
    """Print usage summary for the discovered data."""
    print("\n" + "=" * 60)
    print("USAGE SUMMARY")
    print("=" * 60)
    print("""
The NOAA FTP warehouse contains historical space weather data organized by year.

Common data types you may find:
  - Solar event reports
  - Geomagnetic indices (Kp, Dst, etc.)
  - Solar wind data
  - X-ray flux measurements
  - Particle flux data
  - Forecast archives

To use this data in your application:
  1. Use ftplib (Python) or similar for programmatic access
  2. Consider caching data locally to reduce FTP load
  3. Check NOAA's terms of use for data attribution requirements

Alternative HTTP endpoints:
  - https://services.swpc.noaa.gov/json/ - JSON API (current data)
  - https://services.swpc.noaa.gov/products/ - Various products
  - https://services.swpc.noaa.gov/text/ - Text bulletins
""")


def main():
    parser = argparse.ArgumentParser(description="Test NOAA Space Weather FTP access")
    parser.add_argument("--year", type=int, help="Explore a specific year")
    parser.add_argument("--download-sample", action="store_true", help="Download a sample file")
    parser.add_argument("--test-paths", action="store_true", help="Test various FTP paths")
    args = parser.parse_args()

    print("=" * 60)
    print("NOAA SPACE WEATHER FTP TEST")
    print(f"Host: {FTP_HOST}")
    print(f"Path: {FTP_BASE_PATH}")
    print(f"Time: {datetime.now().isoformat()}")
    print("=" * 60)

    ftp = connect_ftp()
    if not ftp:
        sys.exit(1)

    try:
        if args.test_paths:
            test_specific_paths(ftp)

        if args.year:
            explore_year(ftp, args.year)
        else:
            explore_warehouse(ftp)

        if args.download_sample:
            download_sample(ftp)

        print_summary()

    finally:
        print("\nClosing connection...")
        ftp.quit()
        print("Done!")


if __name__ == "__main__":
    main()
