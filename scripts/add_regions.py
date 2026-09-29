#!/usr/bin/env python3
"""Add region (comunidad autonoma / region) and province to every site in the
paraglidingEarth*.json files, using OpenStreetMap Nominatim reverse geocoding.

Nominatim's usage policy allows max 1 request/second, so this takes ~15 min for
~780 sites. Progress is cached in scripts/.region-cache.json, so it can be
interrupted and re-run. Sites already carrying `region` are skipped.
"""
import json, os, sys, time, urllib.parse, urllib.request

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
FILES = ['data/paraglidingEarthSpain.json', 'data/paraglidingEarthPortugal.json']
CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.region-cache.json')
UA = 'wind-forecast-region-enrichment/1.0 (personal project)'

FORCE = '--force' in sys.argv
cache = json.load(open(CACHE, encoding='utf-8')) if os.path.exists(CACHE) else {}

def reverse(lat, lon, zoom=8):
    key = '%.5f,%.5f' % (lat, lon)
    if key in cache:
        return cache[key]
    q = urllib.parse.urlencode({'format': 'jsonv2', 'zoom': zoom, 'addressdetails': 1,
                                'accept-language': 'es', 'lat': lat, 'lon': lon})
    req = urllib.request.Request('https://nominatim.openstreetmap.org/reverse?' + q, headers={'User-Agent': UA})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                addr = json.load(r).get('address', {})
            if not addr and zoom > 5:
                return reverse(lat, lon, zoom - 3)
            break
        except Exception as e:
            print('  retry', attempt, e, file=sys.stderr)
            time.sleep(5 * (attempt + 1))
    else:
        return None
    if not addr:
        return None
    cache[key] = addr
    json.dump(cache, open(CACHE, 'w', encoding='utf-8'))
    time.sleep(1.1)
    return addr

for f in FILES:
    path = os.path.join(ROOT, f)
    data = json.load(open(path, encoding='utf-8'))
    feats = data['features']
    for n, ft in enumerate(feats, 1):
        p = ft['properties']
        if p.get('region') and not FORCE:
            continue
        lon, lat = ft['geometry']['coordinates'][:2]
        addr = reverse(lat, lon)
        if not addr and p.get('landing_lat') and p.get('landing_lng'):
            # takeoff falls outside any boundary (coast): use the landing point instead
            addr = reverse(float(p['landing_lat']), float(p['landing_lng']))
        if not addr:
            print('FAILED', p.get('name'), file=sys.stderr)
            continue
        # state = comunidad autonoma (ES) / region (PT); state_district or county = province/district
        # ES: state = comunidad autonoma, state_district = provincia (absent when the comunidad is uniprovincial)
        # PT mainland: only the district (county / ISO3166-2-lvl6) exists; islands: archipelago / lvl4
        p['province'] = addr.get('state_district') or addr.get('county') or addr.get('state')
        p['provinceCode'] = addr.get('ISO3166-2-lvl6') or addr.get('ISO3166-2-lvl4')
        p['region'] = addr.get('state') or addr.get('archipelago') or addr.get('county')
        p['regionCode'] = addr.get('ISO3166-2-lvl4') or addr.get('ISO3166-2-lvl6')
        print('%s %d/%d %s -> %s / %s' % (f, n, len(feats), p['name'], p['region'], p['province']), flush=True)
        if n % 25 == 0:
            json.dump(data, open(path, 'w', encoding='utf-8'), ensure_ascii=False, indent=4)
    json.dump(data, open(path, 'w', encoding='utf-8'), ensure_ascii=False, indent=4)
print('done')
