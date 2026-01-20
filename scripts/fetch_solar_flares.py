#!/usr/bin/env python3
"""
NOAA Solar Flare Data Fetcher

Fetches current solar flare data from NOAA SWPC and combines with historical data.
Can be run as a cron job to keep data updated, or manually to refresh.

Usage:
    python fetch_solar_flares.py                    # Fetch and display recent flares
    python fetch_solar_flares.py --output data.json # Save to file
    python fetch_solar_flares.py --significant      # Only M and X class flares
    python fetch_solar_flares.py --merge            # Merge with historical data
"""

import json
import argparse
import sys
from datetime import datetime, timedelta
from pathlib import Path
from urllib.request import urlopen
from urllib.error import URLError, HTTPError


# NOAA SWPC API endpoints
NOAA_BASE_URL = "https://services.swpc.noaa.gov/json"
FLARE_ENDPOINTS = {
    "xray_7day": f"{NOAA_BASE_URL}/goes/primary/xray-flares-7-day.json",
    "events": f"{NOAA_BASE_URL}/edited_events.json",
}

# Path to historical data
SCRIPT_DIR = Path(__file__).parent
HISTORICAL_DATA = SCRIPT_DIR.parent / "src" / "data" / "major-solar-flares.json"


def fetch_json(url, timeout=30):
    """Fetch JSON data from a URL."""
    try:
        with urlopen(url, timeout=timeout) as response:
            return json.loads(response.read().decode('utf-8'))
    except HTTPError as e:
        print(f"HTTP Error {e.code}: {e.reason}")
        return None
    except URLError as e:
        print(f"URL Error: {e.reason}")
        return None
    except json.JSONDecodeError as e:
        print(f"JSON Decode Error: {e}")
        return None


def parse_flare_class(class_str):
    """Parse flare class string into numeric value for comparison.

    X1.0 = 1e-4 W/m²
    M1.0 = 1e-5 W/m²
    C1.0 = 1e-6 W/m²
    B1.0 = 1e-7 W/m²
    A1.0 = 1e-8 W/m²
    """
    if not class_str:
        return 0

    class_str = class_str.strip().upper()
    if not class_str:
        return 0

    class_letter = class_str[0]
    try:
        magnitude = float(class_str[1:]) if len(class_str) > 1 else 1.0
    except ValueError:
        magnitude = 1.0

    class_values = {'A': 1e-8, 'B': 1e-7, 'C': 1e-6, 'M': 1e-5, 'X': 1e-4}
    base = class_values.get(class_letter, 0)

    return base * magnitude


def is_significant_flare(class_str, threshold='M1.0'):
    """Check if flare meets significance threshold."""
    return parse_flare_class(class_str) >= parse_flare_class(threshold)


def fetch_recent_flares():
    """Fetch recent flares from NOAA GOES X-ray data."""
    print("Fetching recent X-ray flare data...")
    data = fetch_json(FLARE_ENDPOINTS["xray_7day"])

    if not data:
        return []

    flares = []
    for event in data:
        flare = {
            "date": event.get("begin_time", "")[:10],
            "time": event.get("max_time", "")[11:16] if event.get("max_time") else "",
            "class": event.get("max_class", ""),
            "beginTime": event.get("begin_time"),
            "maxTime": event.get("max_time"),
            "endTime": event.get("end_time"),
            "satellite": f"GOES-{event.get('satellite', '')}",
            "peakFlux": event.get("max_xrlong"),
            "integratedFlux": event.get("current_int_xrlong"),
        }
        flares.append(flare)

    return flares


def fetch_solar_events():
    """Fetch solar events including flares, CMEs, etc."""
    print("Fetching solar events data...")
    data = fetch_json(FLARE_ENDPOINTS["events"])

    if not data:
        return []

    # Filter for X-ray flares (XRA type)
    flares = []
    for event in data:
        if event.get("type") != "XRA":
            continue

        flare = {
            "date": event.get("begin_datetime", "")[:10],
            "time": event.get("max_datetime", "")[11:16] if event.get("max_datetime") else "",
            "class": event.get("particulars1", ""),
            "beginTime": event.get("begin_datetime"),
            "maxTime": event.get("max_datetime"),
            "endTime": event.get("end_datetime"),
            "region": f"AR {event.get('region')}" if event.get("region") else None,
            "observatory": event.get("observatory"),
            "location": event.get("location") or None,
        }
        flares.append(flare)

    return flares


def load_historical_data():
    """Load historical major flares data."""
    if not HISTORICAL_DATA.exists():
        print(f"Historical data not found: {HISTORICAL_DATA}")
        return None

    with open(HISTORICAL_DATA, 'r') as f:
        return json.load(f)


def merge_with_historical(recent_flares, historical_data):
    """Merge recent flares with historical data, avoiding duplicates."""
    if not historical_data:
        return recent_flares

    historical_flares = historical_data.get("historicalMajorFlares", [])
    historical_dates = {f["date"] for f in historical_flares}

    # Add significant recent flares not in historical
    new_significant = []
    for flare in recent_flares:
        if is_significant_flare(flare["class"], "X1.0"):
            if flare["date"] not in historical_dates:
                new_significant.append(flare)

    return {
        "metadata": historical_data.get("metadata", {}),
        "historicalMajorFlares": historical_flares,
        "recentSignificantFlares": new_significant,
        "recentFlares": recent_flares,
        "fetchedAt": datetime.utcnow().isoformat() + "Z",
    }


def display_flares(flares, title="Solar Flares"):
    """Display flares in a formatted table."""
    print(f"\n{'=' * 70}")
    print(f" {title}")
    print(f"{'=' * 70}")

    if not flares:
        print("No flares found.")
        return

    # Group by significance
    x_class = [f for f in flares if f.get("class", "").startswith("X")]
    m_class = [f for f in flares if f.get("class", "").startswith("M")]
    c_class = [f for f in flares if f.get("class", "").startswith("C")]
    other = [f for f in flares if f not in x_class + m_class + c_class]

    def print_flare_table(flare_list, label):
        if not flare_list:
            return
        print(f"\n{label} ({len(flare_list)} events):")
        print("-" * 60)
        print(f"{'Date':<12} {'Time':<8} {'Class':<8} {'Region':<12} {'Notes'}")
        print("-" * 60)
        for f in flare_list[:20]:  # Limit display
            date = f.get("date", "")[:10]
            time = f.get("time", "")[:5]
            cls = f.get("class", "")
            region = f.get("region", "") or ""
            notes = f.get("notes", "")[:30] if f.get("notes") else ""
            print(f"{date:<12} {time:<8} {cls:<8} {region:<12} {notes}")
        if len(flare_list) > 20:
            print(f"  ... and {len(flare_list) - 20} more")

    print_flare_table(x_class, "X-CLASS FLARES (Extreme)")
    print_flare_table(m_class, "M-CLASS FLARES (Medium)")
    print_flare_table(c_class[:10], "C-CLASS FLARES (Common) - Top 10")

    print(f"\n{'=' * 70}")
    print(f"Total: {len(flares)} flares")
    print(f"  X-class: {len(x_class)}, M-class: {len(m_class)}, C-class: {len(c_class)}")
    print(f"{'=' * 70}")


def main():
    parser = argparse.ArgumentParser(description="Fetch NOAA solar flare data")
    parser.add_argument("--output", "-o", help="Output file path (JSON)")
    parser.add_argument("--significant", "-s", action="store_true",
                        help="Only show M-class and above")
    parser.add_argument("--merge", "-m", action="store_true",
                        help="Merge with historical data")
    parser.add_argument("--events", "-e", action="store_true",
                        help="Fetch from events endpoint (more detail)")
    parser.add_argument("--quiet", "-q", action="store_true",
                        help="Suppress display output")
    args = parser.parse_args()

    # Fetch data
    if args.events:
        flares = fetch_solar_events()
    else:
        flares = fetch_recent_flares()

    if not flares:
        print("Failed to fetch flare data")
        sys.exit(1)

    print(f"Fetched {len(flares)} flares")

    # Filter if requested
    if args.significant:
        flares = [f for f in flares if is_significant_flare(f.get("class", ""), "M1.0")]
        print(f"Filtered to {len(flares)} significant flares (M1.0+)")

    # Merge with historical if requested
    output_data = flares
    if args.merge:
        historical = load_historical_data()
        output_data = merge_with_historical(flares, historical)

    # Display
    if not args.quiet:
        if isinstance(output_data, dict):
            display_flares(output_data.get("recentFlares", []), "Recent Flares")
        else:
            display_flares(output_data, "Recent Flares")

    # Save if output specified
    if args.output:
        output_path = Path(args.output)
        with open(output_path, 'w') as f:
            json.dump(output_data, f, indent=2)
        print(f"\nSaved to: {output_path}")


if __name__ == "__main__":
    main()
