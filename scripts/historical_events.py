#!/usr/bin/env python3
"""
Historical Solar Wind Data Fetcher and Magnetosphere Visualizer

Fetches historical solar wind data from NASA OMNI and generates
magnetosphere visualizations similar to NOAA's Geospace model output.

Usage:
    python historical_events.py --event halloween2003
    python historical_events.py --event may2024
    python historical_events.py --date 2024-10-03 --hours 48
    python historical_events.py --list-events
"""

import argparse
import json
import math
import os
import struct
from datetime import datetime, timedelta
from pathlib import Path
from urllib.request import urlopen
from urllib.error import URLError

# NASA OMNI data URL
OMNI_BASE_URL = "https://cdaweb.gsfc.nasa.gov/pub/data/omni/low_res_omni"

# Output directories
SCRIPT_DIR = Path(__file__).parent
DATA_DIR = SCRIPT_DIR.parent / "src" / "data" / "historical_events"

# OMNI2 data format (hourly data)
# Columns: Year, Day, Hour, ... (55 columns total)
# Key columns:
#   0: Year, 1: Day of year, 2: Hour
#   24: Plasma flow speed (km/s)
#   23: Proton density (n/cc)
#   22: Plasma temperature (K)
#   14-16: IMF Bx, By, Bz (nT)
#   40: Dst index (nT)
#   38: Kp index * 10

OMNI_COLUMNS = {
    'year': 0,
    'doy': 1,  # Day of year
    'hour': 2,
    'imf_magnitude': 9,
    'imf_bx_gse': 14,
    'imf_by_gse': 15,
    'imf_bz_gse': 16,
    'plasma_temp': 22,
    'proton_density': 23,
    'plasma_speed': 24,
    'kp': 38,
    'dst': 40,
}

# Fill values for missing data
FILL_VALUES = {
    'imf_magnitude': 999.9,
    'imf_bx_gse': 999.9,
    'imf_by_gse': 999.9,
    'imf_bz_gse': 999.9,
    'plasma_temp': 9999999.0,
    'proton_density': 999.9,
    'plasma_speed': 9999.0,
    'kp': 99,
    'dst': 99999,
}

# Notable historical events
HISTORICAL_EVENTS = {
    'halloween2003': {
        'name': 'Halloween Solar Storms 2003',
        'description': 'Series of powerful flares causing widespread effects. X17 and X28 class flares.',
        'start': '2003-10-28',
        'end': '2003-11-02',
        'peak_flare': 'X28 (estimated X45)',
        'min_dst': -383,
    },
    'march1989': {
        'name': 'March 1989 Geomagnetic Storm',
        'description': 'Caused Quebec power grid collapse, 6 million without power for 9 hours.',
        'start': '1989-03-10',
        'end': '1989-03-15',
        'peak_flare': 'X15',
        'min_dst': -589,
    },
    'bastille2000': {
        'name': 'Bastille Day Event 2000',
        'description': 'Major solar event causing satellite anomalies and spectacular auroras.',
        'start': '2000-07-14',
        'end': '2000-07-17',
        'peak_flare': 'X5.7',
        'min_dst': -301,
    },
    'may2024': {
        'name': 'May 2024 Geomagnetic Storm',
        'description': 'G5 extreme storm. Historic aurora displays visible at low latitudes.',
        'start': '2024-05-10',
        'end': '2024-05-14',
        'peak_flare': 'X8.7',
        'min_dst': -412,  # Estimated
    },
    'october2024': {
        'name': 'October 2024 X9.0 Event',
        'description': 'Strongest flare of Solar Cycle 25.',
        'start': '2024-10-01',
        'end': '2024-10-05',
        'peak_flare': 'X9.0',
        'min_dst': -150,  # Estimated
    },
}


def date_to_doy(date_str):
    """Convert YYYY-MM-DD to (year, day_of_year)."""
    dt = datetime.strptime(date_str, '%Y-%m-%d')
    return dt.year, dt.timetuple().tm_yday


def doy_to_date(year, doy, hour=0):
    """Convert (year, day_of_year, hour) to datetime."""
    return datetime(year, 1, 1) + timedelta(days=doy-1, hours=hour)


def fetch_omni_year(year):
    """Fetch OMNI data for a specific year."""
    url = f"{OMNI_BASE_URL}/omni2_{year}.dat"
    print(f"Fetching {url}...")

    try:
        with urlopen(url, timeout=60) as response:
            data = response.read().decode('utf-8')
            return data.strip().split('\n')
    except URLError as e:
        print(f"Error fetching data: {e}")
        return None


def parse_omni_line(line):
    """Parse a single line of OMNI data."""
    parts = line.split()
    if len(parts) < 45:
        return None

    try:
        record = {}
        for name, col in OMNI_COLUMNS.items():
            if col < len(parts):
                val = float(parts[col])
                # Check for fill values
                fill = FILL_VALUES.get(name)
                if fill and abs(val - fill) < 0.1:
                    val = None
                record[name] = val

        # Create timestamp
        if record.get('year') and record.get('doy') and record.get('hour') is not None:
            record['timestamp'] = doy_to_date(
                int(record['year']),
                int(record['doy']),
                int(record['hour'])
            ).isoformat()

        return record
    except (ValueError, IndexError) as e:
        return None


def fetch_event_data(start_date, end_date):
    """Fetch OMNI data for a date range."""
    start_year, start_doy = date_to_doy(start_date)
    end_year, end_doy = date_to_doy(end_date)

    all_data = []

    for year in range(start_year, end_year + 1):
        lines = fetch_omni_year(year)
        if not lines:
            continue

        for line in lines:
            record = parse_omni_line(line)
            if not record:
                continue

            rec_year = int(record.get('year', 0))
            rec_doy = int(record.get('doy', 0))

            # Filter to date range
            if rec_year == start_year and rec_doy < start_doy:
                continue
            if rec_year == end_year and rec_doy > end_doy:
                continue
            if rec_year < start_year or rec_year > end_year:
                continue

            all_data.append(record)

    return all_data


def calculate_magnetopause_standoff(density, speed, bz):
    """
    Estimate magnetopause standoff distance based on solar wind parameters.
    Uses Shue et al. (1998) model approximation.

    Normal standoff: ~10 Earth radii
    During storms: can compress to ~6 Earth radii
    """
    if density is None or speed is None:
        return 10.0  # Default

    # Dynamic pressure (nPa)
    # P = 0.5 * m_p * n * v^2, where m_p = 1.67e-27 kg
    # Simplified: P ≈ 2e-6 * n * v^2 (in nPa when n in /cc, v in km/s)
    p_dyn = 2e-6 * density * speed * speed

    # Bz effect (southward IMF compresses magnetosphere)
    bz_factor = 1.0
    if bz is not None and bz < 0:
        bz_factor = 1.0 + 0.02 * abs(bz)  # Compress more with southward Bz

    # Standoff distance (Earth radii)
    # r0 ≈ 11.4 * P^(-1/6.6) for quiet times
    if p_dyn > 0:
        r0 = 11.4 * (p_dyn ** (-1/6.6)) / bz_factor
    else:
        r0 = 10.0

    return max(4.0, min(15.0, r0))  # Clamp to reasonable range


def calculate_storm_intensity(dst, kp):
    """
    Calculate storm intensity level (0-5 scale).
    Based on NOAA G-scale.
    """
    if dst is None:
        dst = 0
    if kp is None:
        kp = 0
    else:
        kp = kp / 10.0  # OMNI stores Kp * 10

    # Use the more severe indicator
    dst_level = 0
    if dst <= -50: dst_level = 1  # G1
    if dst <= -100: dst_level = 2  # G2
    if dst <= -200: dst_level = 3  # G3
    if dst <= -300: dst_level = 4  # G4
    if dst <= -400: dst_level = 5  # G5

    kp_level = 0
    if kp >= 5: kp_level = 1
    if kp >= 6: kp_level = 2
    if kp >= 7: kp_level = 3
    if kp >= 8: kp_level = 4
    if kp >= 9: kp_level = 5

    return max(dst_level, kp_level)


def process_event_data(raw_data, event_info=None):
    """Process raw OMNI data into visualization-ready format."""
    processed = []

    for record in raw_data:
        if not record.get('timestamp'):
            continue

        # Calculate derived parameters
        density = record.get('proton_density')
        speed = record.get('plasma_speed')
        bz = record.get('imf_bz_gse')
        dst = record.get('dst')
        kp = record.get('kp')
        temp = record.get('plasma_temp')

        # Dynamic pressure
        if density and speed:
            pressure = 2e-6 * density * speed * speed  # nPa
        else:
            pressure = None

        # Magnetopause standoff
        standoff = calculate_magnetopause_standoff(density, speed, bz)

        # Storm intensity
        storm_level = calculate_storm_intensity(dst, kp)

        processed.append({
            'timestamp': record['timestamp'],
            'solar_wind': {
                'speed': speed,  # km/s
                'density': density,  # /cc
                'temperature': temp,  # K
                'pressure': pressure,  # nPa
            },
            'imf': {
                'magnitude': record.get('imf_magnitude'),
                'bx': record.get('imf_bx_gse'),
                'by': record.get('imf_by_gse'),
                'bz': bz,
            },
            'geomagnetic': {
                'dst': dst,
                'kp': kp / 10.0 if kp else None,
                'storm_level': storm_level,
            },
            'magnetosphere': {
                'standoff_re': standoff,  # Earth radii
            }
        })

    return {
        'event_info': event_info,
        'data': processed,
        'generated_at': datetime.utcnow().isoformat() + 'Z',
    }


def generate_summary(processed_data):
    """Generate event summary statistics."""
    data = processed_data.get('data', [])
    if not data:
        return {}

    speeds = [d['solar_wind']['speed'] for d in data if d['solar_wind']['speed']]
    densities = [d['solar_wind']['density'] for d in data if d['solar_wind']['density']]
    dsts = [d['geomagnetic']['dst'] for d in data if d['geomagnetic']['dst']]
    bzs = [d['imf']['bz'] for d in data if d['imf']['bz']]

    return {
        'time_range': {
            'start': data[0]['timestamp'],
            'end': data[-1]['timestamp'],
            'hours': len(data),
        },
        'solar_wind': {
            'max_speed': max(speeds) if speeds else None,
            'min_speed': min(speeds) if speeds else None,
            'avg_speed': sum(speeds) / len(speeds) if speeds else None,
            'max_density': max(densities) if densities else None,
        },
        'geomagnetic': {
            'min_dst': min(dsts) if dsts else None,
            'max_storm_level': max(d['geomagnetic']['storm_level'] for d in data),
        },
        'imf': {
            'min_bz': min(bzs) if bzs else None,
            'max_bz': max(bzs) if bzs else None,
        }
    }


def save_event_data(event_id, processed_data):
    """Save processed event data to JSON."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    # Add summary
    processed_data['summary'] = generate_summary(processed_data)

    output_path = DATA_DIR / f"{event_id}.json"
    with open(output_path, 'w') as f:
        json.dump(processed_data, f, indent=2)

    print(f"Saved: {output_path}")
    return output_path


def list_events():
    """List available historical events."""
    print("\nAvailable Historical Events:")
    print("=" * 60)
    for event_id, info in HISTORICAL_EVENTS.items():
        print(f"\n{event_id}:")
        print(f"  Name: {info['name']}")
        print(f"  Date: {info['start']} to {info['end']}")
        print(f"  Peak Flare: {info['peak_flare']}")
        print(f"  Min Dst: {info['min_dst']} nT")
        print(f"  {info['description']}")


def main():
    parser = argparse.ArgumentParser(description="Fetch historical solar wind data")
    parser.add_argument('--event', help='Predefined event ID (use --list-events to see options)')
    parser.add_argument('--date', help='Start date (YYYY-MM-DD)')
    parser.add_argument('--hours', type=int, default=48, help='Hours of data to fetch')
    parser.add_argument('--list-events', action='store_true', help='List available events')
    parser.add_argument('--all-events', action='store_true', help='Fetch all predefined events')
    args = parser.parse_args()

    if args.list_events:
        list_events()
        return

    if args.all_events:
        for event_id in HISTORICAL_EVENTS:
            print(f"\n{'='*60}")
            print(f"Processing: {event_id}")
            print('='*60)

            info = HISTORICAL_EVENTS[event_id]
            raw_data = fetch_event_data(info['start'], info['end'])
            if raw_data:
                processed = process_event_data(raw_data, info)
                save_event_data(event_id, processed)
                print(f"  Records: {len(processed['data'])}")
                summary = processed.get('summary', {})
                if summary.get('geomagnetic', {}).get('min_dst'):
                    print(f"  Min Dst: {summary['geomagnetic']['min_dst']} nT")
        return

    if args.event:
        if args.event not in HISTORICAL_EVENTS:
            print(f"Unknown event: {args.event}")
            list_events()
            return

        info = HISTORICAL_EVENTS[args.event]
        print(f"Fetching: {info['name']}")
        print(f"Date range: {info['start']} to {info['end']}")

        raw_data = fetch_event_data(info['start'], info['end'])
        if raw_data:
            processed = process_event_data(raw_data, info)
            save_event_data(args.event, processed)

            summary = processed.get('summary', {})
            print(f"\nSummary:")
            print(f"  Records: {len(processed['data'])}")
            if summary.get('solar_wind', {}).get('max_speed'):
                print(f"  Max solar wind speed: {summary['solar_wind']['max_speed']:.0f} km/s")
            if summary.get('geomagnetic', {}).get('min_dst'):
                print(f"  Min Dst: {summary['geomagnetic']['min_dst']:.0f} nT")
        return

    if args.date:
        start = datetime.strptime(args.date, '%Y-%m-%d')
        end = start + timedelta(hours=args.hours)

        print(f"Fetching: {args.date} + {args.hours} hours")

        raw_data = fetch_event_data(
            start.strftime('%Y-%m-%d'),
            end.strftime('%Y-%m-%d')
        )
        if raw_data:
            processed = process_event_data(raw_data)
            event_id = f"custom_{args.date.replace('-', '')}"
            save_event_data(event_id, processed)
        return

    parser.print_help()


if __name__ == "__main__":
    main()
