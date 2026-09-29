#!/usr/bin/env python3
"""Add region and province to every site in the paraglidingEarth*.json files,
using OpenStreetMap Nominatim reverse geocoding (max 1 request/second).

Spain:    region = comunidad autonoma, province = provincia (null when the
          comunidad is uniprovincial; provinces are never renamed to regions).
Portugal: province = distrito, region = NUTS II (Norte, Centro, Area
          Metropolitana de Lisboa, Alentejo, Algarve). Azores and Madeira have
          no district: province is null and region is Azores / Madeira.

Results are cached in scripts/.region-cache.json, so the script can be
interrupted and re-run. Use --force to recompute sites that already have a region.
"""
import json, os, sys, time, urllib.parse, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..')
FILES = ['data/paraglidingEarthSpain.json', 'data/paraglidingEarthPortugal.json']
CACHE = os.path.join(HERE, '.region-cache.json')
UA = 'wind-forecast-region-enrichment/1.0 (personal project)'
FORCE = '--force' in sys.argv

# NUTS II (2013 statistical regions) by district. Lisboa and Santarem districts
# straddle two NUTS II regions and are resolved per municipality below.
NUTS2_BY_DISTRICT = {
    'Viana do Castelo': 'Norte', 'Braga': 'Norte', 'Oporto': 'Norte', 'Porto': 'Norte',
    'Vila Real': 'Norte', 'Bragança': 'Norte',
    'Aveiro': 'Centro', 'Viseu': 'Centro', 'Guarda': 'Centro', 'Coímbra': 'Centro',
    'Castelo Branco': 'Centro', 'Leiria': 'Centro',
    'Setúbal': 'Área Metropolitana de Lisboa',
    'Beja': 'Alentejo', 'Évora': 'Alentejo', 'Portalegre': 'Alentejo',
    'Faro': 'Algarve',
}
NUTS2_CODES = {'Norte': 'PT-NORTE', 'Centro': 'PT-CENTRO', 'Área Metropolitana de Lisboa': 'PT-AML',
               'Alentejo': 'PT-ALENTEJO', 'Algarve': 'PT-ALGARVE'}
# Municipalities of the Lisboa district that belong to NUTS II Centro (Oeste)
LISBOA_CENTRO = {'Alenquer', 'Arruda dos Vinhos', 'Sobral de Monte Agraço', 'Torres Vedras', 'Lourinhã', 'Cadaval'}
# Municipalities of the Santarem district that belong to NUTS II Alentejo (Lezíria do Tejo)
SANTAREM_ALENTEJO = {'Almeirim', 'Alpiarça', 'Azambuja', 'Benavente', 'Cartaxo', 'Chamusca', 'Coruche',
                     'Golegã', 'Rio Maior', 'Salvaterra de Magos', 'Santarém'}
# Coastal takeoffs where Nominatim finds no boundary at all
DISTRICT_OVERRIDES = {'Pombal Portugal': 'Leiria', 'V.N.Milfontes - Furnas': 'Beja', 'Almograve - PT': 'Beja'}

cache = json.load(open(CACHE, encoding='utf-8')) if os.path.exists(CACHE) else {}

def reverse(lat, lon, zoom=8):
    key = '%.5f,%.5f,z%d' % (lat, lon, zoom)
    if key in cache:
        return cache[key]
    q = urllib.parse.urlencode({'format': 'jsonv2', 'zoom': zoom, 'addressdetails': 1,
                                'accept-language': 'es', 'lat': lat, 'lon': lon})
    req = urllib.request.Request('https://nominatim.openstreetmap.org/reverse?' + q, headers={'User-Agent': UA})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                addr = json.load(r).get('address', {})
            break
        except Exception as e:
            print('  retry', attempt, e, file=sys.stderr)
            time.sleep(5 * (attempt + 1))
    else:
        return None
    time.sleep(1.1)
    if not addr:
        return None
    cache[key] = addr
    json.dump(cache, open(CACHE, 'w', encoding='utf-8'))
    return addr

def municipality(lat, lon):
    a = reverse(lat, lon, 10) or {}
    return a.get('municipality') or a.get('city') or a.get('town') or a.get('village')

def portugal(p, lat, lon, addr):
    if addr.get('ISO3166-2-lvl4') in ('PT-20', 'PT-30'):
        p['region'] = addr.get('archipelago') or addr.get('state')
        p['regionCode'] = addr['ISO3166-2-lvl4']
        p['province'] = p['provinceCode'] = None
        return
    district = addr.get('county')
    p['province'], p['provinceCode'] = district, addr.get('ISO3166-2-lvl6')
    nuts2 = NUTS2_BY_DISTRICT.get(district)
    if district == 'Lisboa':
        nuts2 = 'Centro' if municipality(lat, lon) in LISBOA_CENTRO else 'Área Metropolitana de Lisboa'
    elif district == 'Santarém':
        nuts2 = 'Alentejo' if municipality(lat, lon) in SANTAREM_ALENTEJO else 'Centro'
    p['region'], p['regionCode'] = nuts2, NUTS2_CODES.get(nuts2)

def spain(p, addr):
    # state = comunidad autonoma, state_district/province = provincia (absent if uniprovincial)
    p['region'] = addr.get('state')
    p['regionCode'] = addr.get('ISO3166-2-lvl4')
    p['province'] = addr.get('state_district') or addr.get('province')
    p['provinceCode'] = addr.get('ISO3166-2-lvl6')

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
        if p['name'] in DISTRICT_OVERRIDES and not (addr or {}).get('county'):
            addr = {'county': DISTRICT_OVERRIDES[p['name']], 'country_code': 'pt'}
            addr['ISO3166-2-lvl6'] = next((v['ISO3166-2-lvl6'] for v in cache.values()
                                           if v.get('county') == addr['county'] and v.get('ISO3166-2-lvl6')), None)
        if not addr:
            print('FAILED', p['name'], file=sys.stderr)
            continue
        # country comes from the geocoder, not the file: some "Spain" sites are in Portugal and vice versa
        if addr.get('country_code') == 'pt':
            portugal(p, lat, lon, addr)
        else:
            spain(p, addr)
        print('%s %d/%d %s -> %s / %s' % (f, n, len(feats), p['name'], p['region'], p['province']), flush=True)
        if n % 25 == 0:
            json.dump(data, open(path, 'w', encoding='utf-8'), ensure_ascii=False, indent=4)
    json.dump(data, open(path, 'w', encoding='utf-8'), ensure_ascii=False, indent=4)
print('done')
