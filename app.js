/* ===========================================
   Constants and state
=========================================== */
const API_WX  = 'https://api.open-meteo.com/v1/forecast';
const API_GEO = 'https://geocoding-api.open-meteo.com/v1/search';
const PARAMS  = 'wind_speed_10m,wind_speed_80m,wind_speed_120m,wind_speed_180m,wind_direction_10m,wind_direction_80m,wind_direction_120m,wind_direction_180m,wind_gusts_10m,boundary_layer_height';

const WINDOW_START_HOUR = 9;
const DEFAULT_CARD_HOUR = 9;

const CFG_DEFAULTS = {
    speedMin: 10,
    speedOpt: 15,
    speedMod: 25,
    speedStr: 35,
    gustOk:   20,
    gustMod:  30,
    shearOk:  25,
    shearMod: 50,
};
let CFG = { ...CFG_DEFAULTS };

const SITE_GROUPS = {
    andalusia: [
        { name: 'Algodonales', lat: 36.8976, lon: -5.3935, dirFilter: { enabled: true, deg: 270, tol: 15 } },
        { name: 'El Bosque', lat: 36.7541, lon: -5.4891, dirFilter: { enabled: true, deg: 270, tol: 15 } },
        { name: 'Matalascañas', lat: 37.0104, lon: -6.5731, dirFilter: { enabled: true, deg: 225, tol: 15 } }
    ],
    algarve: [
        { name: 'Porto de Mós', lat: 37.0853, lon: -8.6837, dirFilter: { enabled: true, deg: 157.5, tol: 35 } },
        { name: 'Praia da Cordoama', lat: 37.110035, lon: -8.936134, dirFilter: { enabled: true, deg: 292.5, tol: 35 } }
    ]
};
const EXTERNAL_SITES = [];
const EXTERNAL_GROUPS = {};
const REGION_LABELS = {
    andalusia: 'Andalucía', algarve: 'Algarve',
    aragon: 'Aragón', asturias: 'Asturias', 'balearic-islands': 'Islas Baleares',
    'canary-islands': 'Islas Canarias', cantabria: 'Cantabria', 'castile-and-leon': 'Castilla y León',
    'castile-la-mancha': 'Castilla-La Mancha', catalonia: 'Cataluña', extremadura: 'Extremadura',
    galicia: 'Galicia', 'la-rioja': 'La Rioja', madrid: 'Comunidad de Madrid', murcia: 'Región de Murcia',
    navarre: 'Navarra', 'basque-country': 'País Vasco', 'valencian-community': 'Comunidad Valenciana',
    'other-spain': 'Otros España', azores: 'Azores', madeira: 'Madeira', 'north-portugal': 'Norte',
    'center-portugal': 'Centro', lisbon: 'Lisboa', alentejo: 'Alentejo', 'other-portugal': 'Otros Portugal'
};
const EXTERNAL_REGION_ORDER = [
    'andalusia', 'algarve', 'aragon', 'asturias', 'balearic-islands', 'canary-islands', 'cantabria', 'castile-and-leon',
    'castile-la-mancha', 'catalonia', 'extremadura', 'galicia', 'la-rioja', 'madrid', 'murcia',
    'navarre', 'basque-country', 'valencian-community', 'other-spain', 'azores', 'madeira',
    'north-portugal', 'center-portugal', 'lisbon', 'alentejo', 'other-portugal'
];
let activeExternalGroup = 'aragon';

let activeSiteGroup = 'andalusia';
let locations = [];

function cloneLocation(loc) {
    return { ...loc, dirFilter: loc.dirFilter ? { ...loc.dirFilter } : null, selectedDay: 0 };
}

function preferredDirection(properties) {
    const dirs = [['N', 0], ['NE', 45], ['E', 90], ['SE', 135], ['S', 180], ['SW', 225], ['W', 270], ['NW', 315]];
    const specified = dirs.filter(function(item) { return Number(properties[item[0]]) > 0; });
    if (!specified.length) return null;
    const total = specified.reduce(function(sum, item) { return sum + Number(properties[item[0]]); }, 0);
    const weighted = specified.reduce(function(sum, item) { return sum + item[1] * Number(properties[item[0]]); }, 0);
    return { enabled: true, deg: (weighted / total + 360) % 360, tol: specified.length === 1 ? 22.5 : 67.5 };
}

function regionFromCoordinates(lat, lon, country) {
    if (country === 'pt') {
        if (lon < -24) return 'azores';
        if (lon < -15) return 'madeira';
        if (lat < 37.5 && lon < -7.0) return 'algarve';
        if (lat > 38.3 && lat < 39.2 && lon < -8.4) return 'lisbon';
        if (lat > 39.5) return 'north-portugal';
        if (lon > -7.3 && lat < 39.5) return 'alentejo';
        if (lon > -8.1 && lat > 38.4) return 'center-portugal';
        return 'other-portugal';
    }
    if (lat < 29) return 'canary-islands';
    if (lat > 38 && lat < 40.2 && lon > 1.5) return 'balearic-islands';
    if (lat > 43.0 && lon > -4.5 && lon < -2.5) return 'cantabria';
    if (lat > 41.5 && lon < -6.0) return 'galicia';
    if (lat > 40.5 && lon > 1.5) return 'catalonia';
    if (lat > 42.5 && lon < -4.5) return 'asturias';
    if (lat > 42.5 && lon > -2.5) return 'basque-country';
    if (lat > 41.5 && lon < -2.5) return 'castile-and-leon';
    if (lat > 40.5 && lon > 0.5) return 'aragon';
    if (lat > 42.0 && lon > -3.5 && lon < -1.5) return 'la-rioja';
    if (lat > 39.5 && lon > -1.5) return 'valencian-community';
    if (lat > 39.5 && lon < -1.5) return 'castile-and-leon';
    if (lat > 38.5 && lon < -2.5) return 'castile-la-mancha';
    if (lat > 39.0 && lat < 41.2 && lon > -4.5 && lon < -3.2) return 'madrid';
    if (lat > 41.8 && lon < -1.5) return 'navarre';
    if (lat > 37.5 && lon > -1.5) return 'murcia';
    if (lat > 36.0 && lon < -2.0) return 'andalusia';
    if (lat > 37.0 && lon < -1.5) return 'extremadura';
    return 'other-spain';
}

 
const EMBEDDED_SITES = [["Organya",42.2286,1.3244,0,0,0,1,2,1,0,0,"es"],["Algodonales - Levante",36.8981,-5.3935,0,0,2,2,2,0,0,0,"es"],["Otivar",36.8337,-3.70203,0,0,2,2,2,2,0,0,"es"],["Castejon de Sos - Liri",42.5341,0.5527,0,0,0,0,2,1,1,0,"es"],["Piedrahita -Pena Negra",40.4217,-5.30073,2,1,0,0,0,1,2,2,"es"],["Somosierra",41.1501,-3.61357,2,1,0,0,0,0,0,1,"es"],["Lanzarote -Famara (Tequise) HG-TO",29.08,-13.558,1,0,0,0,0,0,1,2,"es"],["Rasos de Paguera",42.1374,1.7727,0,0,1,2,2,1,0,0,"es"],["Arcones",41.077,-3.7076,2,2,0,0,2,0,0,2,"es"],["Pedro Bernardo",40.2567,-4.90553,0,0,1,0,1,1,2,0,"es"],["Cebreros - Avila",40.4492,-4.50997,0,0,2,1,0,0,0,0,"es"],["Tenerife - Taucho",28.1449,-16.7359,0,0,0,0,2,2,0,0,"es"],["Cenes de la Vega (Granada)",37.1427,-3.5193,0,0,0,1,1,2,2,2,"es"],["Carchuna",36.6998,-3.46407,0,0,2,2,0,0,0,0,"es"],["Siete Pilillas -Pegalajar -Jaen -Mancha Real",37.7523,-3.64619,2,1,0,0,0,0,0,2,"es"],["Ager",42.0464,0.7461,0,0,0,1,2,2,1,0,"es"],["Pico del caballo",37.008,-3.442,0,0,0,0,0,1,2,1,"es"],["La Muela",40.8455,-3.11249,1,1,1,1,1,2,2,1,"es"],["Cabo de Santa Pola",38.22,-0.515,0,1,2,1,0,0,0,0,"es"],["El Palomaret",38.4861,-0.675,0,0,1,2,2,1,0,0,"es"],["Vejer",36.2476,-5.97338,0,0,0,0,0,0,0,0,"es"],["Pitolero - Valles Jerte-Ambroz",40.1298,-5.97697,0,0,0,2,2,1,2,2,"es"],["Las Cruces - Rute",37.3371,-4.34722,1,0,0,2,2,2,0,2,"es"],["La Parra",38.513,-6.61662,1,2,2,0,0,0,0,1,"es"],["Lucena",37.3756,-4.46752,0,0,0,1,2,0,0,0,"es"],["Gistredo",42.7412,-6.43532,0,0,1,1,2,1,1,0,"es"],["Lanzarote - Orzola- Mirador del Rio",29.22,-13.4728,0,2,0,0,0,0,0,0,"es"],["Lanzarote - Arrieta",29.1115,-13.478,1,2,2,0,0,0,0,0,"es"],["Ronda la Vieja",36.8385,-5.2383,0,0,0,0,0,0,0,2,"es"],["Lanzarote - Playa Quemada",28.9025,-13.7413,0,0,0,0,0,0,0,0,"es"],["Cerro de Itrabo",36.7755,-3.64585,0,0,0,2,2,2,0,0,"es"],["Alfamar",36.7579,-3.6312,0,0,0,0,0,0,0,0,"es"],["Tenerife - Ifonche",28.1256,-16.6922,0,0,0,1,2,2,1,0,"es"],["La Palma - Puntagorda",28.7524,-17.9334,0,0,0,0,0,0,2,0,"es"],["La Palma - Campanario",28.5806,-17.869,0,0,0,0,1,2,2,1,"es"],["Lanzarote - Famara -lower (PG) TO",29.062,-13.582,1,0,0,0,0,0,1,2,"es"],["Jabalcon",37.5609,-2.8196,2,0,2,2,2,0,0,2,"es"],["El Bosque",36.7526,-5.49065,0,0,0,0,0,0,2,2,"es"],["La Palma - Torre del Time",28.6916,-17.9255,0,0,0,0,0,1,2,1,"es"],["El Yelmo",38.2565,-2.66007,0,0,1,0,0,1,2,1,"es"],["Chiclana",38.315,-3.04993,0,0,0,0,0,0,0,0,"es"],["Turo de la Guardia",41.6418,2.6889,0,0,0,1,1,2,0,0,"es"],["Gran Canaria -los Giles",28.1273,-15.4758,1,2,1,0,0,0,0,0,"es"],["Abdalajis -Levante -CLOSED! (Malaga)",36.9316,-4.7207,0,0,0,2,2,0,0,0,"es"],["Abdalajis -la Capilla -CLOSED!",36.9521,-4.71234,2,0,0,0,0,0,0,2,"es"],["Abdalajis -Poniente -CLOSED!",36.9542,-4.76366,1,0,0,0,0,0,1,2,"es"],["Teba Poniente",36.9798,-4.92624,2,0,0,0,2,0,1,2,"es"],["Hondon de las Nieves",38.3303,-0.8855,0,0,1,1,1,0,0,0,"es"],["La Solana",38.6405,-0.8387,0,0,0,2,2,0,0,0,"es"],["Albergue",36.8256,-3.9739,0,0,1,2,1,0,0,0,"es"],["Tenerife - Ladera de Guimar",28.2915,-16.4182,0,1,2,0,0,0,0,0,"es"],["Ponzos",43.5511,-8.2541,0,0,0,0,0,1,2,2,"es"],["Colina del Cuervo",43.5502,-5.6125,1,2,1,0,0,0,0,0,"es"],["Pico Muelas-Boniar",42.8732,-5.375,0,0,0,1,2,2,2,1,"es"],["Sotillos",42.8537,-5.1928,0,1,2,1,0,0,0,0,"es"],["San Cristobal de Valdueza",42.4513,-6.51495,1,0,0,0,0,1,2,2,"es"],["Pando Quintanilla de Babia",42.935,-6.1612,2,1,0,0,2,1,0,1,"es"],["Laderona Piedrafita",42.9696,-6.2026,0,0,0,0,0,2,1,0,"es"],["La Mora Quintanilla de Babia",42.9107,-6.1965,2,1,0,0,0,0,0,1,"es"],["Cueto Nidio Villablino",42.9163,-6.3081,2,1,0,1,1,1,2,2,"es"],["Palacios del Sil",42.8828,-6.3978,1,0,0,0,0,0,0,2,"es"],["Cervatin - Bierzo",42.73,-6.3861,0,0,0,0,0,1,2,1,"es"],["Corullon - Bierzo",42.5562,-6.846,0,1,2,1,0,0,0,0,"es"],["Tres Marias - Casares",42.95,-5.7859,0,0,0,1,2,0,0,0,"es"],["Cotobello",43.1345,-5.6405,2,1,0,0,0,0,1,1,"es"],["Pico San Martin",43.4716,-5.6588,2,1,0,0,0,0,0,1,"es"],["Providencia",43.5537,-5.6191,0,0,0,0,0,0,1,2,"es"],["Xago",43.6089,-5.9113,1,0,0,0,0,0,2,2,"es"],["Verdicio",43.6229,-5.8857,2,1,0,0,0,0,0,0,"es"],["Torimbia",43.4404,-4.8495,1,1,0,0,0,0,1,2,"es"],["Pajares",42.9656,-5.7934,2,1,0,0,0,0,0,1,"es"],["Gamoniteiro",43.1875,-5.9237,0,0,0,0,0,1,1,1,"es"],["Naranco - Oviedo",43.3843,-5.8641,0,0,0,0,2,0,0,0,"es"],["Nava - Pilonieta",43.3126,-5.4971,1,2,0,0,0,0,0,0,"es"],["Mostayal",43.2563,-5.94466,0,1,1,1,0,0,0,0,"es"],["Gamonal - Angliru",43.2266,-5.93347,0,0,2,0,0,0,0,0,"es"],["Valdedios",43.4409,-5.5213,0,2,2,0,0,0,0,0,"es"],["Pena Mayor",43.2689,-5.50391,0,0,0,0,0,1,1,0,"es"],["Pena Sobia",43.157,-6.0576,0,0,0,0,0,2,2,0,"es"],["Pena Rubia",38.5946,-0.815715,1,0,0,0,0,0,1,2,"es"],["loarre",42.3322,-0.6093,0,0,0,1,2,2,0,0,"es"],["Monlora",42.1322,-0.9235,0,0,0,2,2,0,2,2,"es"],["Sant just",40.7795,-0.8514,2,2,0,0,0,0,0,1,"es"],["Sa Torre - Cabo Blanco",39.4508,2.7468,0,0,0,0,0,2,2,0,"es"],["Alcudia",39.8353,3.09542,0,2,2,0,0,0,0,0,"es"],["Penyal Xepat - Puig Major",39.7845,2.76933,2,0,0,0,0,0,0,2,"es"],["Bunyola",39.6967,2.71353,0,0,0,0,2,2,0,0,"es"],["Primera Maria",42.0889,1.814,0,0,2,2,2,2,0,0,"es"],["Figuerassa",42.1215,1.8272,0,0,0,1,2,1,0,0,"es"],["Pedroreo",43.3455,-6.15256,1,0,0,0,0,0,1,2,"es"],["Baltar",41.913,-7.6927,2,0,0,0,0,0,0,2,"es"],["Biscoi",38.6502,-0.598823,0,0,0,2,2,0,0,0,"es"],["Santa Brigida",42.0222,2.613,0,0,1,2,2,1,0,0,"es"],["Montseny - Turó de l Home",41.775,2.436,0,1,0,0,2,2,2,0,"es"],["Betlem",39.7365,3.31174,1,0,0,0,0,0,0,2,"es"],["Chia",40.4537,-5.1792,0,0,1,1,1,0,0,0,"es"],["La Lastra del Cano",40.3433,-5.4353,0,0,0,1,2,2,1,0,"es"],["Jabalcon (Zujar)",37.563,-2.80894,0,0,2,1,2,0,0,2,"es"],["Las Mallolas",41.6635,1.63459,0,0,0,0,1,2,0,0,"es"],["Montanchez",39.2144,-6.1229,2,1,2,2,2,0,0,0,"es"],["Zarza de Montanchez",39.2196,-6.043,2,0,0,0,0,2,1,2,"es"],["Canaveral",39.8047,-6.405,0,0,0,0,2,2,0,0,"es"],["Zarautz",43.2901,-2.1388,2,2,0,0,0,0,0,1,"es"],["Kukuarri",43.2924,-2.1068,2,0,0,0,0,0,1,2,"es"],["Huergas de Babia",42.941,-6.0942,2,1,0,0,0,0,0,1,"es"],["Monte Ventoso",43.4804,-8.31775,2,1,0,0,0,0,1,2,"es"],["Acebedo",43.0153,-5.1129,2,2,0,0,0,0,0,1,"es"],["Castejon de Sos - Pedras Blancas",42.5283,0.5389,0,0,2,0,0,0,0,0,"es"],["Castejon de Sos - Touch and Go",42.5333,0.544515,0,0,2,0,0,2,2,0,"es"],["Castejon de Sos - Rials",42.5247,0.49955,0,0,0,2,2,0,0,0,"es"],["Chia - Abedules",42.5258,0.4693,0,0,2,0,0,0,0,0,"es"],["Lagunilla",40.3179,-5.9729,0,0,0,1,2,1,0,0,"es"],["Las Contiendas",41.4859,-5.5623,2,0,0,0,0,2,2,2,"es"],["El Risco",41.4137,-5.409,0,0,0,0,1,2,2,1,"es"],["La Geroma",41.5469,-5.5623,1,0,0,0,0,2,1,0,"es"],["Sant Pere de Torello",42.0998,2.2936,0,0,0,0,2,2,0,0,"es"],["Cingles de Bertí",41.7131,2.1835,0,0,2,2,2,0,0,0,"es"],["Sant Pere de Rodes",42.322,3.1641,1,2,0,0,1,2,0,0,"es"],["Tierz",42.1308,-0.3363,0,0,0,0,0,0,2,0,"es"],["Santa Orosia",42.5157,-0.288048,0,0,0,0,2,2,2,1,"es"],["Hecho - Borda Serrano y Planas",42.741,-0.7288,1,0,0,0,1,2,2,2,"es"],["Mare de Deu del Mont",42.2581,2.7079,0,0,0,0,2,0,0,0,"es"],["El Grado",42.1541,0.254488,0,0,0,1,2,2,2,1,"es"],["Castillonroi",41.895,0.532279,0,0,0,0,2,2,0,0,"es"],["Benalmadena -Hotel Holiday World",36.5743,-4.5844,0,0,0,2,0,0,0,0,"es"],["Tenerife - Ladera de Los Cristianos",28.0395,-16.7073,0,0,0,0,0,0,1,2,"es"],["Xaxan",42.3299,-8.6881,0,0,2,1,0,0,0,0,"es"],["Gran Canaria - Isleta",28.1667,-15.436,0,2,0,0,0,0,0,0,"es"],["Loja poniente",37.1322,-4.1846,0,0,0,0,0,0,2,1,"es"],["Loja norte",37.1501,-4.1801,2,0,0,0,0,0,0,1,"es"],["Loja levante",37.1497,-4.14906,0,0,2,2,0,0,0,0,"es"],["Alcaudete",37.5875,-4.0484,0,0,0,0,0,2,2,2,"es"],["Zarza Capilla",38.79,-5.1581,0,0,0,0,0,0,0,2,"es"],["salt del equip",41.5624,1.8962,0,0,0,0,1,2,2,0,"es"],["Orduña",42.9615,-3.0246,2,2,1,0,0,0,0,2,"es"],["Playa de Langre",43.4746,-3.6919,2,2,1,0,0,0,0,0,"es"],["Matalascanas",37.0166,-6.5843,0,0,0,0,0,2,0,0,"es"],["Santa Marina de Orozko",43.1062,-2.9405,2,2,0,0,0,0,0,2,"es"],["Islares - Castro Urdiales",43.3974,-3.3014,2,1,0,0,0,0,0,0,"es"],["Chinchilla",38.9335,-1.6818,0,0,1,2,1,0,0,0,"es"],["Higueruela",38.9922,-1.3764,1,0,0,0,0,0,1,2,"es"],["Mirador 'La Cueva de los Franceses'",42.771,-4.0943,2,1,0,0,0,0,0,1,"es"],["Sierra del Escudo (Cabuérniga)",43.208,-4.3296,2,2,0,0,0,0,0,0,"es"],["Valoria la Buena",41.8221,-4.5105,0,0,0,0,0,1,2,1,"es"],["Santibanez de Valcorba",41.5715,-4.4324,1,2,0,0,0,0,0,0,"es"],["Cabezon (Norte)",41.7513,-4.6122,1,0,0,0,0,0,0,2,"es"],["villar del arzobispo",39.7262,-0.851065,0,0,2,2,1,0,0,0,"es"],["Camporrobles",39.6674,-1.3963,0,0,2,2,1,0,0,0,"es"],["Alicun",36.9533,-2.61382,0,2,2,2,0,0,0,0,"es"],["Oia",41.9947,-8.86663,0,0,0,0,0,0,2,0,"es"],["Lanzarote - Tenezar (Tenesar)",29.0786,-13.712,2,0,0,0,0,0,0,0,"es"],["Algodalgo",38.3591,-1.27587,0,0,0,0,0,0,0,0,"es"],["Castillo de Mora",39.6838,-3.73188,0,0,1,0,0,0,2,0,"es"],["Cal Roger",42.3962,1.4121,0,0,0,0,1,2,1,0,"es"],["Monte Faro Oeste",42.6393,-7.8929,0,0,0,0,0,1,2,1,"es"],["Cala Mesquida",39.7388,3.45003,1,1,1,2,2,1,1,2,"es"],["aérodrome la cervera",39.3301,-6.3507,0,0,0,0,0,0,0,0,"es"],["Orotavá",38.3785,-0.65755,0,0,0,0,0,0,0,0,"es"],["Castillo",42.0624,0.58905,0,0,0,0,0,0,0,0,"es"],["Graus",42.1071,0.607433,0,0,0,0,0,0,0,0,"es"],["Sierra de Mongay",42.0867,0.728083,0,0,0,0,0,0,0,0,"es"],["Alpera",39.0081,-1.23985,0,0,1,2,1,0,0,0,"es"],["Jumilla",38.5081,-1.25703,0,0,0,0,0,0,0,0,"es"],["Moclin",37.3271,-3.80853,0,0,2,2,2,0,0,0,"es"],["Abelenda",42.3979,-8.2946,0,0,0,0,0,0,0,0,"es"],["Acantilados de Chanteiro y Ares",43.423,-8.25842,0,0,0,0,0,0,0,0,"es"],["Relleno",42.4128,-8.86532,0,0,0,0,0,0,0,0,"es"],["Sant Just - West",40.7704,-0.81635,0,0,0,0,0,0,0,0,"es"],["Alburqueque",39.2654,-6.9794,0,0,0,0,0,0,0,0,"es"],["Alhama de Murcia",37.8643,-1.43245,0,0,0,0,2,1,0,0,"es"],["La Paca",37.8868,-1.82605,0,0,0,0,0,2,0,0,"es"],["A Cañiza - NE",42.2489,-8.24497,0,0,0,0,0,0,0,0,"es"],["Tablones",42.7657,-3.47832,0,2,0,0,0,2,0,0,"es"],["Blancas",42.706,-0.580133,0,0,0,2,2,2,0,0,"es"],["Sierra de Nambroca",39.765,-3.94615,2,0,0,0,0,0,0,1,"es"],["San Pablo de los Montes",39.5254,-4.32687,0,0,0,0,0,0,0,0,"es"],["Marbella - Andalusia",36.514,-5.05625,0,0,0,0,0,0,0,0,"es"],["Arroyo de la Miel",36.6127,-4.55518,0,0,0,0,0,0,0,0,"es"],["Guainos",36.7697,-3.08208,0,0,0,0,0,0,0,0,"es"],["Aguadulce",36.8216,-2.56682,0,0,0,0,0,2,0,0,"es"],["Sierra Alhamilla",36.9572,-2.40352,0,0,0,2,2,0,0,0,"es"],["Dalias",36.8303,-2.83863,0,0,0,0,0,0,0,0,"es"],["Port del Comte",42.1578,1.55738,0,0,1,1,2,1,0,0,"es"],["Caudete",38.7424,-1.0191,0,0,0,2,1,0,0,0,"es"],["Inca",39.721,2.956,0,0,0,0,0,0,0,0,"es"],["Carrie",36.6739,-6.11287,0,0,0,0,0,0,0,0,"es"],["Murcia - Carrascoy",37.8502,-1.28973,2,0,0,0,0,0,0,2,"es"],["Arangoiti",42.645,-1.1881,0,0,0,0,0,0,0,0,"es"],["Carrasqueta",38.58,-0.508629,0,0,1,2,1,0,0,0,"es"],["Tenerife - Izana (Izaña) - North-West",28.3289,-16.4914,0,0,0,0,0,0,0,2,"es"],["Oimbra",41.8704,-7.48243,0,0,0,0,0,0,0,0,"es"],["Caneta la Real",36.9445,-5.02285,0,0,1,2,1,0,0,0,"es"],["Cariño, O Limo",43.7477,-7.89107,0,2,1,0,0,0,0,0,"es"],["El Corque",38.234,-1.14608,0,0,0,0,0,0,0,0,"es"],["Lobadiz-Islas Gabeiras",43.5157,-8.32478,0,0,0,0,0,0,0,0,"es"],["Cáceres La Mina",39.4388,-6.37013,0,0,0,0,0,0,0,0,"es"],["Los Castillejos",41.2443,0.984783,0,0,0,1,1,1,0,0,"es"],["Cerejes",42.4753,1.97557,0,0,0,0,0,0,0,0,"es"],["Los Pollos",37.4091,-4.2836,0,0,0,0,0,0,0,0,"es"],["Rodicio, Galicia (Spain)",42.3133,-7.61302,0,0,0,0,0,0,0,0,"es"],["Lanzarote - Macher Tinasoria",28.9506,-13.7103,0,0,0,0,0,0,0,0,"es"],["Tenerife - Jama",28.1156,-16.6575,0,0,0,0,2,2,0,0,"es"],["Sierra Arana (Granada)",37.3275,-3.48485,0,0,0,0,0,0,0,0,"es"],["Pielago",40.1543,-4.74225,2,1,0,0,0,0,0,0,"es"],["Tenerife - Fasnia",28.2305,-16.4326,0,0,0,2,2,0,0,0,"es"],["Tenerife - los Realejos-Antenna / la Corona",28.3785,-16.6005,2,2,0,0,0,0,0,0,"es"],["Castala",36.8968,-2.91715,0,0,0,0,2,2,0,0,"es"],["El Cid",38.4469,-0.726783,0,0,0,0,0,0,0,0,"es"],["Conil - La Fontanilla",36.2847,-6.10232,0,0,0,0,0,0,0,0,"es"],["San Andrés de Teixido",43.7226,-7.94772,0,0,0,0,0,0,1,2,"es"],["Tiacuto",42.27,-0.4144,0,0,0,0,0,0,0,0,"es"],["Cerdedo",42.5222,-8.37423,1,0,0,0,0,0,1,2,"es"],["Padul North",37.0483,-3.62576,2,0,0,0,0,0,0,0,"es"],["Lanzarote - Tinajo (el Cuchillo)",29.0872,-13.6585,2,2,0,0,0,0,0,0,"es"],["Tenerife - Tierra del Trigo",28.3599,-16.7858,1,2,1,0,0,0,0,1,"es"],["Hellin Cerro Morron",38.5381,-1.6708,0,0,0,0,0,0,1,2,"es"],["palma del rio",37.7066,-5.2825,0,0,2,2,2,2,2,2,"es"],["Coll de Lilla",41.3567,1.2254,2,0,0,0,0,0,0,2,"es"],["Collbaix",41.7429,1.7657,0,0,0,1,2,1,0,0,"es"],["Oroel",42.5198,-0.5436,0,0,1,1,2,1,0,0,"es"],["SEVILLAPARAMOTOR",37.2605,-5.92993,1,1,2,2,2,2,2,2,"es"],["Tenerife - Arafo",28.3769,-16.4295,0,0,2,2,0,0,0,0,"es"],["El Pino",37.0271,-4.28062,0,0,0,0,0,0,0,0,"es"],["Cruz de Linares",43.2727,-6.0267,1,1,2,1,1,0,0,0,"es"],["Txindoki",43.0221,-2.0867,2,2,1,0,2,2,2,0,"es"],["Pena de Francia",40.5144,-6.1667,0,0,0,0,0,0,0,0,"es"],["Puigsou (Rocacorba) del Bassegoda",42.07,2.68888,0,0,0,0,0,0,0,0,"es"],["Sopelana",43.3812,-3.00938,0,0,0,0,0,0,0,0,"es"],["The Nave Cape",42.9208,-9.28667,0,0,0,0,0,0,0,0,"es"],["Sierra de Lujar",36.8216,-3.40143,0,0,1,0,2,0,0,0,"es"],["herrera del duque",39.2333,-4.89015,0,0,0,0,0,0,0,0,"es"],["ontur",38.6135,-1.5151,0,0,0,0,0,0,0,0,"es"],["Abantos",40.6097,-4.15505,0,0,1,2,1,0,0,0,"es"],["El Bolon",38.4736,-0.8172,0,0,0,2,2,0,0,0,"es"],["Montcabrer",38.7563,-0.481533,0,2,0,0,0,0,0,0,"es"],["Reconco",38.6301,-0.717044,0,0,0,2,0,0,0,0,"es"],["Toix",38.631,0.0232762,0,0,0,0,2,2,0,0,"es"],["C. de Rates",38.7235,-0.0791,2,1,0,0,1,1,0,2,"es"],["Alto del Peñón",42.2046,-6.5522,0,0,0,0,2,2,0,0,"es"],["MAJALCORON",37.4268,-3.98172,0,0,0,0,0,0,0,0,"es"],["Ferreirua",43.0527,-6.01263,0,0,0,0,0,0,0,0,"es"],["Belagua",42.9418,-0.846813,0,0,0,0,0,0,0,0,"es"],["Trobaniello",43.0807,-6.00425,0,0,0,0,0,0,0,0,"es"],["Agroba",42.0726,-8.82855,0,0,0,0,0,0,0,0,"es"],["Razo",43.2887,-8.7175,2,2,0,0,0,0,0,2,"es"],["Playa Monsul cabo de gata",36.7308,-2.14467,0,0,0,0,2,2,0,0,"es"],["Consuegra",39.4531,-3.60816,0,0,0,0,2,2,0,0,"es"],["Tenerife - Izana (Izaña) - South-East",28.3224,-16.4916,0,0,2,0,0,0,0,0,"es"],["Tenerife - Barranco Honda",28.3987,-16.3687,0,0,0,0,2,0,0,0,"es"],["Tenerife - Los Gigantes / Tamaima",28.249,-16.8179,0,0,0,0,0,2,2,0,"es"],["San José del Valle",36.5932,-5.79847,0,0,0,0,0,0,0,2,"es"],["LA TEJERA",41.9776,-6.84615,0,0,0,0,0,0,0,0,"es"],["Las Carrascosas",36.9299,-6.07607,0,0,0,0,0,0,0,0,"es"],["Sariego",43.4212,-5.57537,0,0,0,1,2,1,0,0,"es"],["ALCALA LA REAL",37.4431,-3.88577,0,0,0,0,0,0,0,0,"es"],["Espineres",43.421,-5.2768,0,0,0,0,0,0,0,0,"es"],["Canaldá",42.1248,1.4879,0,0,0,1,2,1,1,0,"es"],["Alcocebre",40.2643,0.2701,0,0,1,2,2,1,1,0,"es"],["San Román",43.7204,-7.6292,1,2,0,0,0,0,0,0,"es"],["Acantilados de Loiba",43.7364,-7.7644,2,0,0,0,0,0,0,2,"es"],["Cariño Monte Mazanteo",43.7306,-7.8719,1,2,0,0,0,0,0,0,"es"],["Eulate",42.7827,-2.21209,0,0,0,2,2,0,0,0,"es"],["Kuartango",42.8704,-2.8707,0,0,0,0,0,0,0,0,"es"],["Untzueta",43.1372,-2.90739,0,0,0,2,2,2,0,0,"es"],["Monte Toro sur",39.9841,4.1133,0,0,1,1,2,0,0,0,"es"],["Son Bou",39.8953,4.0813,0,0,0,0,0,0,2,0,"es"],["Cavalleria",40.0583,4.0746,2,0,0,0,0,0,0,0,"es"],["Sa Mesquida",39.906,4.2934,0,0,2,0,0,0,0,0,"es"],["Monte Toro norte",39.9852,4.1132,2,0,0,0,0,0,0,1,"es"],["Binimel.la",40.049,4.0585,0,0,0,0,0,0,2,0,"es"],["Binidonaire",40.0478,4.0915,0,0,0,0,0,0,2,0,"es"],["Cala Tirant",40.0463,4.1008,0,0,2,0,0,0,0,0,"es"],["Terra Rotja",39.997,4.0378,0,0,0,0,2,2,0,0,"es"],["Binigauss",39.9203,4.0265,0,0,0,0,0,2,0,0,"es"],["MIRADOR DE SEGUENCO",43.323,-5.11202,0,0,0,0,0,0,0,0,"es"],["MIRADOR DEL FITO",43.4429,-5.19923,0,0,0,0,0,0,0,0,"es"],["Lebrija-aeródromo",36.8968,-6.03833,0,0,0,0,0,0,0,0,"es"],["Las Nieves-Pontevedra-Galicia",42.1347,-8.41452,0,0,0,0,0,0,0,0,"es"],["Tenerife - Taganana",28.5588,-16.2308,2,0,0,0,0,0,0,2,"es"],["Campo coy",37.9482,-1.91685,0,0,1,2,1,0,0,0,"es"],["Barranda",38.0297,-1.99358,2,1,0,0,0,0,0,1,"es"],["El Carche",38.4244,-1.16152,0,0,0,0,0,0,0,0,"es"],["sierra de mojantes",38.0082,-2.08338,0,0,0,2,1,0,0,0,"es"],["Cervin",42.4415,0.406517,0,0,0,0,0,0,0,0,"es"],["Castejon de Sos",42.5593,0.432917,0,0,0,0,0,0,0,0,"es"],["Cerro del Aguila",39.9937,-3.90077,0,1,2,0,0,1,2,0,"es"],["La Grana Martos",37.7222,-3.9263,2,0,0,0,0,0,2,2,"es"],["Alcaudete-Caracolera",37.6209,-4.013,2,2,0,0,0,0,0,1,"es"],["Alcaudete-Ahillos-W",37.5988,-4.0448,0,0,0,0,0,2,2,1,"es"],["THE RESQUILONES",43.3979,-4.83103,0,0,0,0,0,0,0,0,"es"],["Coll de la Creueta",42.2962,1.9891,0,0,0,0,0,0,0,0,"es"],["The Cayu",43.3226,-5.3365,0,0,0,0,0,0,0,0,"es"],["A Marufa",43.78,-7.66955,1,2,0,0,0,0,0,0,"es"],["LA PANDERA",37.6306,-3.7775,0,0,0,0,0,0,0,0,"es"],["casas de Millan",39.8218,-6.34628,0,0,0,0,0,0,0,0,"es"],["ORTIGUERA LIGHTHOUSE",43.5619,-6.73375,0,0,0,0,0,0,0,0,"es"],["CASIELLES (NAVA)",43.3306,-5.4627,0,0,0,0,0,0,0,0,"es"],["Buenos Aires",38.3095,-0.642867,0,0,0,0,0,0,0,0,"es"],["Mazarrón",37.5647,-1.1683,0,0,0,0,1,2,0,0,"es"],["Tenerife - Las Teresitas",28.5105,-16.1879,0,0,1,2,1,0,0,0,"es"],["Enclusa",39.9974,4.0045,0,0,0,0,0,2,0,0,"es"],["LA VIORNA",43.1412,-4.64725,0,0,0,0,0,0,0,0,"es"],["SAN GLORIO",43.0765,-4.74177,0,0,0,0,0,0,0,0,"es"],["Collado Garcia",37.2088,-2.27878,0,0,0,2,2,2,0,0,"es"],["Albaricoques",36.8577,-2.0922,0,0,0,0,0,2,0,0,"es"],["Las Negras",36.8751,-2.00515,0,2,2,2,0,0,0,0,"es"],["Garrobillo",37.5084,-1.47473,0,0,0,0,0,0,0,0,"es"],["RIA DE VILLAVICIOSA",43.5117,-5.43142,0,0,0,0,0,0,0,0,"es"],["Sanxian",41.9427,-8.87818,0,0,0,0,0,0,0,0,"es"],["Tenerife - Mesa del Mar",28.4981,-16.4223,0,0,0,0,0,0,2,0,"es"],["Vilela ENE",43.7513,-7.70282,0,0,0,0,0,0,0,0,"es"],["Barreiros, Monte Comado",43.5273,-7.1703,1,2,0,0,0,0,0,0,"es"],["Monte San Pedro, A Coruña",43.3789,-8.43822,2,2,0,0,0,0,0,1,"es"],["O Xistral",43.4621,-7.59462,0,0,0,0,0,0,0,0,"es"],["Serra do Xistral",43.4919,-7.64848,0,0,0,0,0,0,0,0,"es"],["Mazagon",37.1109,-6.76972,0,0,0,0,0,0,0,0,"es"],["Montellano",37.0054,-5.54693,0,2,0,0,0,0,0,0,"es"],["Genevilla",42.6358,-2.38931,0,0,0,0,0,0,1,2,"es"],["Las Mazorras",42.8195,-3.58717,0,2,0,0,0,0,0,0,"es"],["Sancho Abarca",42.0203,-1.32117,0,0,0,0,0,0,0,0,"es"],["Laredo Valverde",43.411,-3.3684,0,0,0,0,0,0,0,0,"es"],["Monte Candiano",43.3566,-3.44377,0,0,0,0,0,0,0,0,"es"],["Belltall",41.4911,1.1989,0,0,0,1,2,1,0,0,"es"],["BOAL",43.424,-6.83913,0,0,0,0,0,0,0,0,"es"],["Puntallana",28.7458,-17.7439,0,2,1,0,0,0,0,0,"es"],["Puerto Naos",28.5869,-17.9023,0,0,0,0,1,2,2,1,"es"],["Casarabuonela (Sierra Prieta)",36.7875,-4.85805,0,0,0,2,2,0,0,0,"es"],["Almagarinos",42.6729,-6.24289,0,0,0,0,0,0,1,1,"es"],["El Barranco",42.3831,-2.4553,0,0,0,0,0,0,2,2,"es"],["Canamero",39.3669,-5.37009,0,0,0,0,1,2,1,0,"es"],["Pajariel",42.535,-6.6161,2,0,0,0,0,0,0,2,"es"],["San Pedro de Troones",42.3755,-6.7836,2,0,0,0,0,0,0,2,"es"],["Busot",38.4837,-0.413983,0,0,1,2,1,0,0,0,"es"],["Mondalindo",40.8751,-3.69525,0,0,0,0,1,2,0,0,"es"],["Sa Plana Bisquerra",39.7972,2.94717,0,0,0,0,0,0,0,0,"es"],["Ambás",43.5373,-5.79515,0,0,0,0,0,0,0,0,"es"],["Faro Gorliz",43.4321,-2.93617,0,0,0,0,0,0,0,0,"es"],["Cruz de Hierro - Aldeavieja",40.7215,-4.4809,2,2,0,0,0,0,0,2,"es"],["Zarzalejo",40.5449,-4.1968,0,0,1,2,1,0,0,0,"es"],["Logrosan",39.3733,-5.46074,0,0,0,1,2,1,0,0,"es"],["Orhi",42.9856,-1.00613,0,0,0,0,0,0,0,0,"es"],["Puigmal",42.3758,2.0975,0,0,0,0,0,0,0,0,"es"],["Sierra de Pejines",39.7109,-4.1613,2,2,2,0,0,2,2,2,"es"],["Cerro de la Nava",39.6441,-4.9866,0,0,0,0,0,2,2,2,"es"],["Xuxarrido",43.7781,-7.6846,0,0,0,0,0,0,2,2,"es"],["la ermita de aldea san miguel",41.4356,-4.6253,1,1,0,0,0,0,0,1,"es"],["Geria",41.5552,-4.903,0,0,2,0,0,0,0,0,"es"],["Los Arcos",42.5402,-2.1073,0,2,2,0,0,0,0,0,"es"],["Giles2",28.1244,-15.4638,2,0,0,0,0,0,0,2,"es"],["Oncala",41.9628,-2.3467,0,2,0,0,0,0,0,0,"es"],["El Cerro (Soria)",41.8875,-2.4332,2,0,0,0,0,2,2,2,"es"],["Santa Maria",41.7719,-3.1296,0,0,0,0,0,0,2,0,"es"],["Lancia (leon)",42.5399,-5.4254,0,0,0,0,0,0,2,2,"es"],["Pardal top",38.0292,-2.90907,0,0,2,0,1,2,2,0,"es"],["Villaciervos (Soria)",41.7724,-2.6091,0,0,0,1,2,0,0,0,"es"],["Bunyola Do Not Land",39.6913,2.70152,0,0,0,0,0,0,0,0,"es"],["Gomera - La Mérica",28.1044,-17.3381,0,0,0,2,2,2,0,0,"es"],["Garaio",42.9114,-2.54331,0,0,0,0,2,2,2,0,"es"],["Tiedra",41.65,-5.2779,0,0,0,0,0,0,2,0,"es"],["Valoria Sur",41.8192,-4.482,0,0,0,0,2,0,0,0,"es"],["Roc de Frausa, Les Salines",42.4225,2.7302,0,0,0,2,2,2,0,0,"es"],["Urueña",41.7271,-5.20353,0,0,0,0,0,0,2,1,"es"],["Vallelado",41.3964,-4.4284,2,2,0,2,2,0,0,2,"es"],["San Cristobal de Cuellar",41.406,-4.40402,0,0,0,2,2,1,0,0,"es"],["Palenzuela",42.0953,-4.12925,1,0,0,0,0,0,0,2,"es"],["Aerodromo de Sonseca",39.694,-3.9338,2,2,2,1,1,2,2,2,"es"],["La Parva de Avedillo",41.3407,-5.6549,0,2,0,0,2,0,2,0,"es"],["Macenas",37.0741,-1.8518,0,0,2,0,0,0,0,0,"es"],["Aguilon",37.3818,-1.7058,0,1,2,2,0,0,0,0,"es"],["Puig de Sant Salvador",39.4544,3.18864,0,0,2,0,0,0,0,0,"es"],["Mansilla",42.5437,-5.3461,0,0,1,2,1,0,0,0,"es"],["Son Park",40.0249,4.1711,0,2,0,0,0,0,0,0,"es"],["Almargen",36.9563,-5.0697,0,0,0,0,0,0,0,0,"es"],["el Hierro -Sabinosa",27.7487,-18.1,2,0,0,0,0,0,0,1,"es"],["Peña Rubia",42.7752,-6.88658,0,0,0,0,0,0,0,0,"es"],["Sella",38.6219,-0.273517,0,0,0,0,0,0,0,0,"es"],["KK-Beach",37.0597,-6.66612,0,0,0,0,0,0,0,0,"es"],["Caminha",41.8439,-8.87093,0,0,0,0,0,0,0,0,"es"],["LASTRES NE",43.5023,-5.26445,0,0,0,0,0,0,0,0,"es"],["Monte Xalo",43.228,-8.42622,0,0,0,0,0,0,0,0,"es"],["SIERRA d'ABODI",42.9575,-1.1292,0,0,0,0,0,0,0,0,"es"],["el Hierro -Saida 800",27.74,-18.0308,2,0,0,0,0,0,0,2,"es"],["Serra Alfabia",39.7332,2.7115,0,0,0,0,0,0,0,0,"es"],["Castell montgri",42.0517,3.1316,2,0,2,2,2,2,2,2,"es"],["VILAÑAN",42.4723,-7.23052,0,0,0,0,0,0,0,0,"es"],["La conchada",42.4846,-7.28284,0,0,0,0,0,0,0,0,"es"],["esmelle",43.5367,-8.29557,0,0,0,0,0,0,2,0,"es"],["Cabo Prior",43.5482,-8.31239,0,0,0,0,0,0,0,0,"es"],["Darro - Sierra Arana -el Puntal",37.398,-3.2885,2,0,2,0,0,0,0,0,"es"],["Sierra  de Almaden",37.7364,-3.52893,0,0,0,0,0,0,0,0,"es"],["Orgiva / Orjiva",36.9394,-3.39359,0,0,0,0,1,2,0,0,"es"],["Castell de Ferro",36.7217,-3.37587,0,2,0,0,0,0,0,0,"es"],["Pico de Mulhacén",37.0527,-3.31139,0,0,0,0,0,0,0,0,"es"],["Alto Rey",41.1656,-3.06278,0,0,0,0,2,0,0,0,"es"],["Pena Escrita 1",36.8176,-3.7703,0,0,0,2,2,0,0,0,"es"],["Escuzar",37.0413,-3.75556,2,0,0,0,0,0,0,0,"es"],["Rodiezmo",42.9253,-5.68948,2,0,0,0,0,0,1,2,"es"],["Baratxueta - Egozkue",42.9581,-1.56497,0,0,0,0,0,0,0,0,"es"],["Loma del Gato",36.7658,-3.65802,0,0,0,0,2,2,0,0,"es"],["El Caracol",43.2039,-3.72923,0,0,0,0,2,2,2,0,"es"],["Mazcuerras-Ladreo",43.2861,-4.18502,2,1,0,0,0,0,0,2,"es"],["Castrejón de la Peña",42.8226,-4.57295,0,0,0,1,2,2,0,0,"es"],["Monegro-Ermita Sra de las Nieves",43.0231,-4.02783,0,0,1,2,1,0,0,0,"es"],["Villacantid",42.9886,-4.21678,2,1,0,0,0,0,0,0,"es"],["Los Tornos",43.1563,-3.45657,1,2,1,0,0,0,0,0,"es"],["La Cañada",42.7514,-4.12627,0,0,0,0,0,2,1,0,"es"],["La Palma - el Time",28.669,-17.9409,0,0,0,0,0,0,2,0,"es"],["'Roque de los Muchachos'",28.7438,-17.9085,0,0,0,0,0,0,2,2,"es"],["Caracenilla W",40.1374,-2.58001,0,0,0,0,0,0,2,1,"es"],["Caracenilla N",40.1405,-2.57847,2,1,0,0,0,0,0,1,"es"],["Caracenilla NE",40.1403,-2.57645,0,2,1,0,0,0,0,0,"es"],["Turís",39.3795,-0.722386,0,1,1,0,0,0,0,0,"es"],["Titaguas",39.8723,-1.05928,0,0,1,2,2,1,0,0,"es"],["Higueruelas/Peñas de Dios",39.8046,-0.880416,0,0,1,2,0,0,0,0,"es"],["Utiel/Remedio",39.6507,-1.15837,0,0,0,0,1,1,0,0,"es"],["Figueroles",40.138,-0.225402,0,0,0,1,2,1,0,0,"es"],["Tossal d'Orenga/Catí",40.3941,-0.0700352,0,0,2,1,0,0,0,0,"es"],["Mondúver",39.0088,-0.266354,0,0,0,0,1,1,1,0,"es"],["Petrès",39.6875,-0.302178,0,0,1,1,2,1,0,0,"es"],["Calles",39.7493,-0.937899,0,0,0,0,1,1,0,0,"es"],["Chelva/Remedio",39.7714,-0.991575,0,0,0,1,2,2,1,0,"es"],["Aras de los Olmos",39.9512,-1.11065,0,0,0,0,0,1,2,2,"es"],["Ollería",38.9409,-0.555861,1,0,0,0,0,0,1,1,"es"],["Xàtiva",38.9712,-0.547206,1,0,0,0,0,0,0,1,"es"],["Pina de Montalgrao",39.9914,-0.619043,0,0,1,2,1,0,0,0,"es"],["Cerro Negro",39.93,-1.0387,0,0,1,2,1,0,0,0,"es"],["Muela del Buitre",39.9594,-1.0665,0,0,0,0,0,0,1,2,"es"],["Javalambre",40.0404,-1.01554,0,0,1,2,1,0,0,0,"es"],["Rope",39.6211,-0.979918,0,0,0,0,0,0,0,0,"es"],["Chulilla",39.6648,-0.877072,0,1,1,0,0,0,0,0,"es"],["Cullera",39.1711,-0.254767,0,0,0,0,0,1,2,1,"es"],["Almudaina",38.7447,-0.36367,1,0,0,0,0,0,0,2,"es"],["Agres",38.768,-0.507106,2,0,0,0,0,0,0,1,"es"],["Vall d'Uxò",39.8484,-0.243115,0,0,1,2,1,0,0,0,"es"],["Petit Vall d'Uxò",39.8107,-0.196381,0,0,1,2,0,0,0,0,"es"],["Almonacid de Zorita",40.3265,-2.83576,0,0,0,0,0,0,1,0,"es"],["Iriepal",40.629,-3.12599,0,0,0,0,0,0,0,1,"es"],["Olarizu",42.8174,-2.66264,2,2,0,0,0,0,0,1,"es"],["Ogassa - Sant Joan de les Abadesses",42.2807,2.292,0,0,0,1,2,1,0,0,"es"],["Bedon Cuestahedo",43.0432,-3.52986,1,2,1,0,0,0,0,0,"es"],["Barcina de los montes",42.6995,-3.32763,1,2,0,0,0,2,0,0,"es"],["Aviados Hike&Fly",42.8725,-5.43471,0,0,0,0,0,0,0,0,"es"],["Puigsagordi",41.8029,2.20289,0,0,0,0,0,0,0,0,"es"],["Tenerife - Benijo",28.5724,-16.1823,2,0,0,0,0,0,0,0,"es"],["Ubierna",42.4957,-3.68641,0,0,0,0,0,2,1,0,"es"],["Mazariegos",42.1065,-3.52706,1,2,0,0,0,0,0,0,"es"],["Pineda de la Sierra",42.1862,-3.31118,0,2,0,0,0,2,0,0,"es"],["Carazo",41.9916,-3.37761,0,2,0,0,0,2,0,0,"es"],["Puerto de la Magdalena",43.0723,-3.3642,0,2,0,0,0,0,0,0,"es"],["Sargentes de la Lora",42.7716,-3.93714,0,0,0,0,0,0,0,2,"es"],["Quintanilla",42.1259,-3.46134,0,2,0,0,0,2,0,0,"es"],["Masa",42.632,-3.75102,0,0,0,1,1,2,1,0,"es"],["La Yecla",41.9415,-3.46434,0,1,2,1,0,0,0,0,"es"],["Miraveche",42.6866,-3.16481,0,0,0,0,1,2,1,0,"es"],["Ibio",43.2905,-4.14477,2,2,0,0,0,0,0,1,"es"],["Endino",42.955,-4.21332,2,2,0,0,2,2,0,0,"es"],["El Caballar",43.2898,-3.884,2,1,0,0,0,0,0,1,"es"],["La vaca",43.2582,-3.653,1,0,0,0,0,0,1,2,"es"],["La Sia",43.1493,-3.55648,0,0,0,0,0,0,0,0,"es"],["Imunia",43.1542,-3.60415,0,0,0,0,0,0,0,0,"es"],["Lanzarote -Orzola -Playa la Canteria",29.2233,-13.4635,1,2,2,0,0,0,0,0,"es"],["Lanzarote - Mala",29.113,-13.4794,0,2,2,2,0,0,0,0,"es"],["Puerto de la Cruz",28.4161,-16.5317,2,0,0,0,0,0,0,0,"es"],["Gilet",39.682,-0.342958,0,0,0,0,0,0,0,0,"es"],["Collada Cármenes",42.9689,-5.63815,0,0,0,0,0,0,0,0,"es"],["Ubiña Pequeña",43.0064,-5.95716,0,0,0,0,0,0,0,0,"es"],["Villanueva de Algaidas",37.1554,-4.46635,2,2,0,0,0,0,0,1,"es"],["La Rampa",42.1058,1.82446,0,0,0,1,2,1,0,0,"es"],["el Hierro -dos Hermanas",27.7331,-18.0069,0,0,0,0,0,0,0,2,"es"],["el Hierro -las Playas",27.7411,-17.965,0,0,0,0,1,0,0,0,"es"],["el Hierro -Malpaso (Gnd Handling only)",27.7283,-18.041,0,0,0,0,2,2,0,0,"es"],["el Hierro - Jable de Mequena",27.7263,-18.0128,0,0,0,2,2,0,0,0,"es"],["el Hierro -el Golfo (600)",27.7452,-18.0123,2,0,0,0,0,0,0,1,"es"],["Cumbre San Andres y Sauces",28.7525,-17.8314,2,2,0,0,0,0,0,0,"es"],["Cofrades",42.4766,-2.79387,1,0,0,0,0,0,1,2,"es"],["Cofrades W",42.4702,-2.81084,2,0,0,0,0,0,1,2,"es"],["Cerro Mirabel",42.4595,-3.01785,1,0,0,0,0,0,2,1,"es"],["Grañón",42.4417,-3.00785,0,0,0,0,0,0,0,2,"es"],["Sesma",42.4668,-2.05155,1,2,0,0,0,0,0,0,"es"],["El Pobo",40.5371,-0.913629,0,0,0,0,0,2,2,2,"es"],["Villarroya de los Pinares (Alas)",40.5161,-0.6293,0,0,0,0,0,1,2,1,"es"],["Villarroya de los Pinares (Parapente)",40.5183,-0.630121,0,0,0,0,0,1,2,1,"es"],["Laturce",42.3536,-2.40767,1,2,0,0,0,0,0,0,"es"],["Hormilleja",42.4645,-2.73385,0,2,2,0,0,0,0,0,"es"],["Prats",42.2132,1.37339,0,0,0,1,2,2,0,0,"es"],["Siones",43.3246,-5.95984,2,2,0,0,0,0,0,1,"es"],["St Llorenc",41.8659,0.818445,0,0,2,2,2,0,0,0,"es"],["Castejón",42.5564,-2.98781,1,2,1,0,0,0,0,0,"es"],["Berja",36.897,-2.88491,0,0,0,0,1,2,1,0,"es"],["Santa Marina",42.8711,-2.11471,0,0,0,0,0,0,0,0,"es"],["San Miguel de Aralar",42.9465,-1.96414,0,0,0,0,0,0,0,0,"es"],["Zenzano",42.3231,-2.37363,0,0,0,0,0,0,0,0,"es"],["Pico del Aguila",42.4236,-2.48675,0,0,0,0,0,0,0,0,"es"],["Puerto Herrera",42.5934,-2.67492,0,0,0,0,0,0,0,0,"es"],["Kurutzebarri",43.0037,-2.48943,0,0,0,0,0,0,0,0,"es"],["El Tablado",41.691,-1.82695,0,0,0,0,0,0,0,0,"es"],["Ágreda, parque eólico San blas",41.8577,-1.96988,0,0,0,0,0,0,0,0,"es"],["Perico Ruiz",37.8396,-2.55258,0,0,0,0,0,0,0,0,"es"],["Rollamienta",41.9469,-2.52829,0,0,0,1,2,2,0,0,"es"],["Pedraiza",41.9815,-2.40957,0,0,0,2,2,2,0,0,"es"],["el Hierro -Saida 1200",27.7311,-18.0157,2,0,0,0,0,0,0,0,"es"],["Peña Escrita 2",36.8205,-3.76849,0,0,0,0,0,0,0,0,"es"],["La Coma",40.0426,-0.0308418,0,0,1,2,2,0,0,0,"es"],["Cabezo E",39.8644,-0.986052,0,0,2,1,0,0,0,0,"es"],["Cabezo S",39.8684,-0.994449,0,0,0,1,2,1,0,0,"es"],["Quartell",39.7661,-0.251899,0,0,0,1,2,0,0,0,"es"],["Picayo Redó",39.7545,-0.374637,0,1,2,2,1,0,0,0,"es"],["Castellnovo",39.8659,-0.455775,0,0,0,0,0,0,0,0,"es"],["Milagrosa",39.6415,-0.318233,0,1,1,1,0,0,0,0,"es"],["Alto del Toril",37.1712,-3.43656,0,0,0,0,0,1,1,0,"es"],["Cavall Bernat",39.1337,-0.352721,0,2,0,0,0,0,0,0,"es"],["La Serella",38.7023,-0.312846,1,0,0,0,0,0,0,1,"es"],["Romeu",39.7147,-0.279776,0,0,0,0,0,0,0,0,"es"],["Recta de Arguedas",42.1101,-1.57634,0,0,0,0,0,0,0,0,"es"],["Algodonales - Poniente ",36.895,-5.41579,0,0,0,0,0,2,2,1,"es"],["Montellano - Lower",37.0072,-5.54273,0,2,0,0,0,0,0,0,"es"],["Algodonales - North",36.9033,-5.40781,0,0,0,0,0,0,0,2,"es"],["Santa Fe",42.208,1.30002,0,0,0,1,2,1,0,0,"es"],["Meranges",42.4509,1.81282,0,0,0,0,0,0,0,0,"es"],["Sant Alis Àger",42.0399,0.766854,0,0,0,0,0,0,0,0,"es"],["Narieda",42.192,1.34461,2,0,0,0,0,0,0,1,"es"],["Serro Ventoso",39.5374,-8.84428,0,0,0,2,0,0,0,0,"pt"],["Mertola",37.691,-7.74462,0,0,0,0,0,0,0,0,"pt"],["Seia",40.4215,-7.6369,0,0,0,0,0,0,0,0,"pt"],["Bornes",41.4637,-6.96567,1,0,0,0,0,0,2,2,"pt"],["Penedo Durao",41.0427,-6.86047,0,1,1,2,2,2,1,0,"pt"],["Polvoeira N",39.72,-9.049,0,0,0,0,0,2,1,0,"pt"],["Torre de Moncorvo - Serra do Reboredo",41.1653,-7.03728,1,0,0,0,1,1,2,2,"pt"],["Porto da Espada",39.3471,-7.32867,0,0,0,0,0,1,2,1,"pt"],["Mirandela - E",41.4505,-7.31102,0,1,2,0,0,0,0,0,"pt"],["Vale Amoreira (Manteigas)",40.4035,-7.45425,0,0,2,2,2,0,0,0,"pt"],["Sesimbra",38.4455,-9.09171,0,0,0,0,1,2,1,0,"pt"],["Chaves",41.6979,-7.43773,0,0,0,0,0,0,0,0,"pt"],["Lousa",40.1049,-8.20912,2,0,0,0,0,1,2,2,"pt"],["Redinha - Sico",39.9754,-8.55388,0,0,0,0,0,0,0,0,"pt"],["Serra do Louro - Palmela",38.564,-8.91813,1,0,0,0,0,0,0,2,"pt"],["Vale de Azares - Linhares",40.5939,-7.38973,0,0,0,0,0,0,0,0,"pt"],["Bicas",38.4623,-9.1928,1,0,0,0,0,0,1,2,"pt"],["Meco",38.4866,-9.1835,0,0,0,0,0,0,2,2,"pt"],["Fonte da Telha",38.5611,-9.1889,0,0,0,0,0,1,2,1,"pt"],["Aguda",38.8501,-9.45488,0,0,0,0,0,0,2,2,"pt"],["Alcobertas",39.4313,-8.91763,1,1,2,2,1,1,1,1,"pt"],["Almargem do Bispo",38.8452,-9.28321,0,0,0,0,0,0,0,0,"pt"],["AlqueidaÂ£o",39.6441,-8.49708,0,0,0,0,0,0,0,0,"pt"],["Alvados",39.5435,-8.78724,0,2,2,0,0,0,0,0,"pt"],["Alvaiazere",39.8221,-8.41407,0,0,0,0,0,0,0,0,"pt"],["Areão",40.5236,-8.77194,0,0,0,0,0,0,0,0,"pt"],["Arrabida",38.4897,-8.9759,0,0,0,2,2,2,0,0,"pt"],["Arrimal",39.4781,-8.87778,0,0,0,0,0,0,0,0,"pt"],["Arruda Leste",38.9911,-9.09657,0,1,2,0,0,0,0,0,"pt"],["Arruda Moinho",38.9796,-9.10059,0,0,0,0,0,0,0,0,"pt"],["Arruda Nordeste",38.9923,-9.09803,1,2,1,0,0,0,0,0,"pt"],["Azinha",40.4307,-7.4554,0,0,0,1,2,2,1,0,"pt"],["Caldelas",41.6586,-8.35923,0,0,0,0,1,2,2,2,"pt"],["Cardos",38.8153,-9.30938,0,0,0,0,0,0,0,0,"pt"],["Castelo de Vide",39.4008,-7.45904,0,0,0,0,1,2,1,0,"pt"],["Cerdal PPD",41.9729,-8.57821,1,0,0,0,0,1,2,2,"pt"],["Covilhã PPD",40.2886,-7.53891,0,0,0,0,0,0,0,0,"pt"],["Fonte Coberta",40.0781,-8.46325,2,1,0,0,0,0,1,2,"pt"],["Foz do Lizandro",38.9455,-9.41453,0,0,0,0,0,0,0,0,"pt"],["Góis",40.1811,-8.00155,0,0,1,2,2,1,0,0,"pt"],["Gralha",39.5226,-9.13163,0,0,0,0,0,0,2,1,"pt"],["Larouco Sul",41.8798,-7.72098,0,0,2,2,2,0,0,0,"pt"],["Larouco Norte",41.9163,-7.71461,2,1,0,0,0,0,0,1,"pt"],["Linhares 1",40.5327,-7.44556,1,0,0,0,0,1,2,2,"pt"],["Linhares 2",40.5365,-7.44352,0,0,0,0,0,0,0,0,"pt"],["Linhares 3",40.5398,-7.44378,0,0,0,0,0,0,0,0,"pt"],["Lousã - Pico da Ortiga",40.1045,-8.20921,0,0,0,0,0,0,0,0,"pt"],["Mangualde",40.4716,-7.54139,0,0,0,0,0,0,0,0,"pt"],["Minde",39.5079,-8.69513,1,2,1,0,0,0,0,0,"pt"],["Mirandela - S/SW",41.4584,-7.29803,0,0,0,1,2,2,0,0,"pt"],["Mirandela W",41.4653,-7.33358,0,0,0,0,0,1,2,2,"pt"],["Montejunto NE",39.179,-9.04153,0,0,0,0,0,0,0,0,"pt"],["Obidos",39.4251,-9.23837,2,1,0,0,0,0,1,2,"pt"],["Pedrulha",40.2387,-8.4462,0,0,0,0,0,0,0,0,"pt"],["Pinheiro da Cruz",38.2352,-8.77174,0,0,0,0,0,1,2,1,"pt"],["Polvoeira",39.7065,-9.04945,0,0,0,0,0,2,1,0,"pt"],["Pombinho",37.7307,-8.70506,0,0,0,0,0,0,0,0,"pt"],["Pombinho - alunos",37.7303,-8.71029,0,0,0,0,0,0,0,0,"pt"],["Pombinho 2",37.7312,-8.70851,0,0,0,0,0,0,0,0,"pt"],["Porto da Espada",39.3483,-7.33509,0,0,0,0,0,0,0,0,"pt"],["Redinha",39.9741,-8.55267,1,0,0,0,0,1,2,2,"pt"],["Salgado",39.5436,-9.1076,2,1,0,0,0,0,1,2,"pt"],["Santa Cruz-Santa Rita",39.1643,-9.36247,0,0,0,0,0,0,2,0,"pt"],["Serra Boa Viagem",40.2088,-8.88254,2,1,0,0,0,0,1,2,"pt"],["Serro Ventoso",39.5496,-8.86762,0,0,0,0,0,0,0,0,"pt"],["Serro Ventoso - Moinhos",39.5285,-8.85695,0,0,0,0,0,0,0,0,"pt"],["Sra da Graça",41.4164,-7.9168,2,0,0,0,1,2,2,2,"pt"],["Lapinha",41.1516,-7.0506,0,0,1,2,2,2,1,1,"pt"],["Macores",41.1411,-7.0153,0,0,0,1,2,2,1,0,"pt"],["Carvalhal",41.171,-6.9864,2,1,0,0,0,0,1,2,"pt"],["Freixo de Espada-a-Cinta",41.1383,-6.8019,1,2,2,1,0,0,0,0,"pt"],["Rio Sabor - Estevais",41.2239,-7.0807,0,0,0,2,2,2,1,1,"pt"],["Quinta Branca - Serra do Reboredo",41.1723,-7.0011,1,1,0,0,0,0,2,2,"pt"],["Castanheira, Mogadouro",41.391,-6.6073,1,2,2,2,1,2,2,2,"pt"],["Cabeco da Neve - Caramulo",40.5527,-8.1798,0,0,1,2,2,1,0,0,"pt"],["Chao da Lagoa",32.7064,-16.9141,0,0,0,2,2,2,0,0,"pt"],["Barrosa, Lagoa - Sao Miguel",37.753,-25.4923,0,0,0,1,2,1,0,0,"pt"],["Falesia Stª. Barbara, Ribeira Grande, Sao Miguel",37.8177,-25.5439,2,1,0,0,0,0,0,1,"pt"],["Monte Verde, Falesia da Ribeira Grande - Sao Miguel",37.8215,-25.5283,2,1,0,0,0,0,0,1,"pt"],["Pico das Freiras, Ribeira Grande - Sao Miguel",37.801,-25.6505,1,2,0,0,1,2,2,1,"pt"],["Monte Escuro, Ribeira Grande - Sao Miguel",37.7913,-25.4275,2,2,1,0,0,0,0,1,"pt"],["Miradouro, Vila Franca do Campo - Sao Miguel",37.7427,-25.4384,0,1,2,2,1,0,0,0,"pt"],["Sra da Paz, Vila Franca do Campo - Sao Miguel",37.7282,-25.431,0,0,1,1,2,2,0,0,"pt"],["Faial da Terra, Sao Miguel",37.7426,-25.2024,0,0,1,2,2,1,0,0,"pt"],["Salto do Cavalo, Furnas- Sao Miguel",37.7921,-25.3055,0,0,1,2,2,2,1,0,"pt"],["Planalto dos Graminais, Povoacao - Sao Miguel",37.7979,-25.2754,0,0,1,2,2,1,0,0,"pt"],["Bica da Cana",32.7652,-17.0654,2,2,1,1,0,0,1,2,"pt"],["Pico da Cruz",32.6421,-16.9396,0,0,0,2,2,2,0,0,"pt"],["Rabacal (Madeira)",32.7521,-17.1315,0,1,1,2,2,2,1,0,"pt"],["Fanal",32.8108,-17.1402,2,2,0,0,0,0,0,2,"pt"],["Canhas",32.7029,-17.1261,0,0,0,2,2,2,0,0,"pt"],["Arco da Calheta",32.7082,-17.1415,2,2,1,1,2,2,2,1,"pt"],["Prazeres",32.7494,-17.2122,2,2,1,0,1,2,2,0,"pt"],["Faja da Ovelha",32.7708,-17.2342,0,1,2,2,2,2,1,0,"pt"],["Raposeira",32.7667,-17.2254,0,1,1,1,2,2,2,0,"pt"],["Paul da Serra Cristo Rei",32.7349,-17.0983,1,1,1,2,2,2,1,1,"pt"],["Paul da Serra Juncal",32.7424,-17.1004,1,1,2,2,2,2,1,0,"pt"],["Pico Gordo",32.7654,-17.1493,0,1,1,1,2,2,2,0,"pt"],["Ponta do Pargo Casa de Cha",32.8082,-17.2558,0,1,1,1,1,2,2,0,"pt"],["Ponta do Pargo Capela",32.8251,-17.2455,1,0,0,0,0,0,1,2,"pt"],["Paul da Serra",32.7531,-17.0989,2,2,2,2,2,2,2,2,"pt"],["Porto da Cruz - Lamaceiros (Madeira)",32.7455,-16.8363,2,1,0,0,0,0,0,1,"pt"],["Ponta da Cruz (Funchal)",32.6354,-16.9473,2,1,1,1,1,1,1,1,"pt"],["Loule - Cerro de Cabeco de Camara",37.1131,-8.0618,0,0,0,1,2,1,0,0,"pt"],["Praia da Cordoama",37.1058,-8.93851,0,0,0,0,0,0,2,2,"pt"],["Foia",37.3159,-8.5971,1,1,0,0,0,0,1,2,"pt"],["Benafatima",37.3696,-8.43583,2,2,0,0,0,0,0,1,"pt"],["Alcaria Ruiva",37.7005,-7.7623,2,1,0,1,2,1,0,1,"pt"],["poco da cruz",40.4875,-8.7934,0,0,0,0,0,1,2,1,"pt"],["Arco da Calheta - Rochao",32.7263,-17.1348,0,0,1,1,2,2,2,1,"pt"],["salvador NE",40.092,-7.0838,2,2,0,0,0,0,0,1,"pt"],["Gomide",41.7248,-8.3794,0,0,0,1,2,2,0,0,"pt"],["foios",40.2586,-6.8858,0,0,1,1,2,1,0,0,"pt"],["Baião Teste",41.17,-8.046,0,0,0,1,2,1,0,0,"pt"],["baião teste",41.1711,-8.0454,0,2,2,2,2,0,0,0,"pt"],["Nazare",39.6046,-9.0787,0,0,0,1,2,1,0,0,"pt"],["venda da cruz",39.96,-8.63345,0,0,0,0,0,0,0,0,"pt"],["GALA FIG FOZ",40.1162,-8.8664,0,0,0,0,0,0,0,0,"pt"],["Sizandro",39.081,-9.41685,0,0,0,0,0,0,0,0,"pt"],["Falésia das Feteiras",37.7859,-25.7683,0,0,0,0,1,2,0,0,"pt"],["Freita",40.8849,-8.2611,1,0,0,0,0,1,2,2,"pt"],["Cerro Cabeço Camara - Loulé",37.1001,-7.83302,0,0,0,0,0,0,0,0,"pt"],["alcaria1",37.7031,-7.80428,0,0,0,0,0,0,0,0,"pt"],["salir",37.2605,-8.04913,0,0,0,0,0,0,0,0,"pt"],["Serra do Cume",38.7072,-27.1112,0,0,0,0,0,0,0,0,"pt"],["4 Ribeiras",38.7654,-27.2205,0,0,0,0,0,0,0,0,"pt"],["Fónzelar",39.2063,-8.05767,0,0,0,0,0,0,0,0,"pt"],["Serra Gorda",37.7859,-25.682,2,2,2,2,2,2,2,2,"pt"],["Aeródromo de Castelo Branco",39.8526,-7.45207,0,0,0,0,0,0,0,0,"pt"],["Porto de Abrigo",33.065,-16.3173,0,0,0,1,2,2,0,0,"pt"],["Costa de Arnes",40.1507,-8.67005,0,0,0,0,0,0,0,0,"pt"],["Cabanas de Tavira",37.1453,-7.57675,0,0,0,0,0,0,0,0,"pt"],["Santa Barbara",38.7301,-27.3177,0,0,0,0,0,0,0,0,"pt"],["Serra sicó junto eolicas",39.9347,-8.55507,0,0,0,0,0,0,0,0,"pt"],["Praia da vieira",39.8816,-8.96925,0,0,0,0,0,0,0,0,"pt"],["golegã",39.4365,-8.46282,0,0,0,0,0,0,0,0,"pt"],["Pico da Ana Ferreira",33.0483,-16.3651,0,0,0,2,2,2,0,0,"pt"],["Lajes do Pico",38.4152,-28.2445,0,0,0,0,0,0,0,0,"pt"],["Salvador - N/NE",39.7551,-6.94177,0,0,0,0,0,0,0,0,"pt"],["ChÃƒ Vermoil Pbl",39.8617,-8.6616,0,0,0,0,0,0,0,0,"pt"],["Ofir",41.5122,-8.78595,0,0,0,0,0,0,2,0,"pt"],["Vale Barosa leiria",39.7635,-8.83398,0,0,0,0,0,0,0,0,"pt"],["Pico Vulcano",38.4692,-28.3966,2,2,1,2,2,2,1,2,"pt"],["Lagoa de Capitao",38.4975,-28.3337,2,2,0,0,0,0,0,0,"pt"],["Porto de",39.6109,-8.84417,0,0,0,0,0,0,0,0,"pt"],["Soito",40.3444,-6.97988,0,0,0,0,0,0,0,0,"pt"],["Achadas da Cruz Cable Car",32.8529,-17.2105,0,0,0,0,0,0,0,0,"pt"],["Porto de Mós- Algarve",37.0858,-8.69205,0,0,0,2,2,0,0,0,"pt"],["Sete Cidades - Desc. W",37.8639,-25.8178,0,0,0,0,0,0,0,0,"pt"],["Pombal Portugal",40.165,-8.8812,0,0,0,0,0,0,0,0,"pt"],["Faró",38.1802,-8.7799,0,0,0,0,0,0,0,0,"pt"],["Outeiro",39.9639,-8.47128,0,0,0,0,0,0,0,0,"pt"],["Poço do Inferno",40.3606,-7.514,0,0,0,0,0,0,0,0,"pt"],["Cabeco Sailvado - Cascalheira, Pico (E)",38.4158,-28.1016,0,0,0,0,0,0,0,0,"pt"],["calheta",38.6505,-9.1079,0,0,0,0,0,0,0,0,"pt"],["Peniche/ Ponte sor",39.9182,-8.61912,0,0,0,0,0,0,0,0,"pt"],["Cabo Girao",32.6563,-17.0082,0,0,0,0,0,0,0,0,"pt"],["evora",38.541,-7.8888,0,0,0,0,0,0,0,0,"pt"],["Melides",38.1525,-8.78698,0,0,0,0,0,0,0,0,"pt"],["Arganil",40.2254,-7.9744,0,0,0,0,0,0,0,0,"pt"],["Monte do Pisco - Tourém",41.8801,-7.91577,2,1,0,0,0,0,0,0,"pt"],["Mação",39.612,-7.9702,0,0,0,0,0,0,0,0,"pt"],["Subserra - S. Jo",38.9383,-9.04233,2,2,1,0,0,0,0,1,"pt"],["Sarzedo",40.372,-7.41688,0,0,0,0,0,0,0,0,"pt"],["Leiranco Mountain",41.7308,-7.64042,0,0,2,1,0,0,0,0,"pt"],["Bucelas",38.896,-9.09172,0,0,0,0,0,0,0,0,"pt"],["Serra da Olga _Chaves",41.7783,-7.52922,0,0,1,2,2,0,0,0,"pt"],["Areias Brancas",38.0551,-8.8209,0,0,0,0,0,0,0,0,"pt"],["Peninha",38.7671,-9.46153,0,0,0,0,0,0,0,0,"pt"],["Caldas das Taipas",41.4784,-8.3823,0,1,2,1,0,0,0,0,"pt"],["Poiares",40.2225,-8.22035,0,0,0,0,0,0,0,0,"pt"],["Monte Vez",40.0017,-8.40602,0,0,0,0,0,0,0,0,"pt"],["Lagoa Sete Cidades",37.8542,-25.7603,0,0,0,2,2,2,1,0,"pt"],["Moncorvo",42.2455,-7.17518,0,0,0,0,0,0,0,0,"pt"],["Lousa",40.0203,-8.34733,0,0,0,0,0,0,0,0,"pt"],["Goncalo",40.4248,-7.35858,0,0,0,0,0,0,0,0,"pt"],["Castanheira de Pêra",40.0066,-8.23207,0,0,0,0,0,0,0,0,"pt"],["Magoito Aerodromo",38.8769,-9.4245,0,0,0,0,0,0,0,0,"pt"],["Senhora do Minho",41.7989,-8.68828,0,1,2,2,1,0,0,0,"pt"],["Castanheira",41.7948,-7.8185,0,0,0,0,0,0,0,0,"pt"],["Soida, Aldeia Viçosa",40.5765,-7.33262,0,0,0,0,0,0,0,0,"pt"],["Pia",41.1477,-8.47167,0,0,0,0,1,1,2,2,"pt"],["LPCV",40.2665,-7.47743,0,0,0,0,0,0,0,0,"pt"],["Manta Rota",37.9215,-8.80578,0,0,0,0,0,0,0,0,"pt"],["Manta Rota",37.1622,-7.52055,0,0,0,0,0,0,0,0,"pt"],["Trafaria - Silos",38.6723,-9.24105,0,0,0,0,0,0,0,0,"pt"],["Montemor",38.7138,-8.27507,0,0,0,0,0,0,0,0,"pt"],["Campinho",38.3597,-7.4657,0,0,0,0,0,0,0,0,"pt"],["V.N.Milfontes - Furnas",37.715,-8.78705,0,0,0,0,0,0,0,0,"pt"],["Praia da Leirosa",40.0499,-8.89273,0,0,0,0,0,0,0,0,"pt"],["Osso da Baleia",39.9995,-8.91515,0,0,0,0,0,0,0,0,"pt"],["Ponta Delgada",32.8242,-16.9847,0,0,0,0,0,0,0,0,"pt"],["Ribeira da Janela-Madeira island",32.848,-17.1519,0,0,0,0,0,0,0,0,"pt"],["Sao Jorge Madeira island",32.8285,-16.9257,0,0,0,0,0,0,0,0,"pt"],["serra do socorro",39.018,-9.22672,0,0,0,0,0,0,0,0,"pt"],["Praia de Mira-Sul",40.4301,-8.8123,0,0,0,0,0,0,0,0,"pt"],["Aerodromo das Moitas",39.7342,-7.8749,0,0,0,0,0,0,0,0,"pt"],["Pico do Areeiro",32.7348,-16.9308,0,0,0,0,0,0,0,0,"pt"],["Lagoa de Melides",38.2749,-8.77647,0,0,0,0,0,0,0,0,"pt"],["Serra de S. Mamede",39.316,-7.36435,0,0,0,0,0,0,0,0,"pt"],["Miranda do corvo",40.0502,-8.28035,0,0,0,0,0,0,0,0,"pt"],["pocariça",39.698,-8.89252,0,0,0,0,0,0,0,0,"pt"],["Maia - S.Miguel - Açores",37.8268,-25.3903,0,0,0,0,0,0,0,0,"pt"],["Varanda dos Pastores",40.2992,-7.58245,0,0,0,0,0,0,0,0,"pt"],["barracão",39.8309,-8.7216,0,0,0,0,0,0,0,0,"pt"],["Casa velha  (Cercal)",37.8459,-8.70153,0,0,0,0,0,0,0,0,"pt"],["casalinho pombal",39.887,-8.647,0,0,0,0,0,0,0,0,"pt"],["Sta. Cruz - Max",39.1362,-9.38168,0,0,0,0,0,0,0,0,"pt"],["Cabeça Alta - Valhelhas",40.4308,-7.41692,0,0,0,0,0,0,0,0,"pt"],["CVLC-ALVÃ”CO",40.2831,-7.8197,0,0,0,0,0,0,0,0,"pt"],["Almograve - PT",37.6491,-8.80365,0,0,0,0,0,0,0,0,"pt"],["Capela de Santo Antao",41.8488,-8.83531,0,0,0,0,0,1,2,1,"pt"],["Pico das Flores",33.0326,-16.3843,0,0,0,2,2,1,0,0,"pt"],["Chãs de tavares",40.6343,-7.60452,0,0,0,0,0,0,0,0,"pt"],["São Pedro Moel Norte",39.7801,-9.02202,0,0,0,0,0,0,0,0,"pt"],["Praia Areão",40.3378,-8.84193,0,0,0,0,0,0,0,0,"pt"],["Praia Quiaios",40.2416,-8.88195,0,0,0,0,0,0,0,0,"pt"],["fronteira",39.054,-7.63985,0,0,0,0,0,0,0,0,"pt"],["Santo Amaro Lagoas",38.4396,-28.1811,0,0,0,0,0,0,0,0,"pt"],["Ribeiras",38.4029,-28.2129,0,0,0,0,0,0,0,0,"pt"],["Espalamanca",38.5497,-28.6068,0,0,0,0,0,0,0,0,"pt"],["Melgaço-Côto do Pomedelo- Roussas",42.0819,-8.21225,0,0,0,0,0,0,0,0,"pt"],["Melgaço-Saínde-Paderne",42.07,-8.29157,0,0,0,0,0,0,0,0,"pt"],["Columbeira",39.3007,-9.19722,0,0,0,0,0,0,0,0,"pt"],["pista da comporta",38.395,-8.79678,0,0,0,0,0,0,0,0,"pt"],["ALV�?CO - Colcurinho Oeste 1000m",40.2487,-7.83458,0,0,0,0,0,0,0,0,"pt"],["Traz de Figueiró",39.9787,-8.44047,0,0,0,0,0,0,0,0,"pt"],["pegões",38.7445,-8.65058,0,0,0,0,0,0,0,0,"pt"],["centro geodésico de portugal",39.6934,-8.13173,0,0,0,0,0,0,0,0,"pt"],["praia pequena",38.6916,-9.3652,0,0,0,0,0,0,0,0,"pt"],["S. António Valpoldres",42.0205,-8.28863,0,0,0,0,0,0,0,0,"pt"],["Polvoeira",39.7177,-8.0493,0,0,0,0,0,0,0,0,"pt"],["Nerra da Nogueira",41.7168,-6.84017,0,0,0,0,0,0,0,0,"pt"],["Figo",39.0503,-9.2349,0,0,0,0,0,0,0,0,"pt"],["Atenor",41.4133,-6.46578,0,0,0,0,0,0,0,0,"pt"],["Tarouca",41.0111,-7.80755,0,2,1,0,0,0,0,0,"pt"],["Santarém Aerodrome",39.2119,-8.68478,0,0,0,0,0,0,0,0,"pt"],["Guincho",38.7235,-9.47767,0,0,0,0,0,0,0,0,"pt"],["MONTE FARINHA",38.8951,-9.2393,0,0,0,0,0,0,0,0,"pt"],["Montemor-o-Velho",40.1764,-8.6533,0,0,0,0,0,0,0,0,"pt"],["Mirandela - S/SE",41.4623,-7.29061,0,0,1,2,2,0,0,0,"pt"],["Gardunha - Norte",40.1059,-7.5015,2,2,1,0,0,0,1,2,"pt"],["Monte Perdigão",39.7062,-7.74642,0,0,0,0,0,0,0,0,"pt"],["cabeço montachique",38.8972,-9.17423,0,0,0,0,0,0,0,0,"pt"],["Pico da Torre",32.6516,-16.9749,0,0,0,0,0,0,0,0,"pt"],["Fundão - Sul",40.1214,-7.41562,0,0,0,0,0,0,0,0,"pt"],["Salgado II",39.5463,-9.102,1,0,0,0,0,0,1,2,"pt"],["Gonça (Aterro)",41.5118,-8.27174,1,1,0,0,0,1,2,1,"pt"],["Baleal",39.3602,-9.35533,0,0,0,0,0,0,0,0,"pt"],["Toledo San Jorge",38.6942,-28.1579,0,0,0,0,0,0,0,0,"pt"],["Cernache CBR",40.1585,-8.4704,0,0,0,0,0,0,0,0,"pt"],["Marialva NE",40.9197,-7.22968,0,0,0,0,0,0,0,0,"pt"],["Ribeira de Nisa e Carreiras",39.3884,-7.43367,0,0,0,0,1,1,2,1,"pt"],["Praïa Azul Nord",39.1016,-9.40138,2,0,0,0,0,0,0,1,"pt"],["Pena Furada",37.1112,-8.90339,2,0,1,1,1,0,2,2,"pt"],["WinchSpot",37.6574,-7.54194,2,1,0,1,2,1,0,1,"pt"],["Porto da Cruz Maiata ",32.767,-16.8223,0,0,0,0,0,0,0,0,"pt"],["Marvão",39.3928,-7.37661,0,0,0,0,1,2,1,0,"pt"],["Arrabida HG ramp",38.4814,-8.98921,0,0,0,1,2,0,0,0,"pt"],["Vila do Carvalho",40.3242,-7.49489,0,0,0,0,0,0,0,0,"pt"]];

function buildEmbeddedSiteGroups(rows) {
    rows.forEach(function(row) {
        const props = { name: row[0], N: row[3], NE: row[4], E: row[5], SE: row[6], S: row[7], SW: row[8], W: row[9], NW: row[10] };
        const site = { name: props.name || 'Sin nombre', lat: row[1], lon: row[2], dirFilter: preferredDirection(props) };
        const name = String(site.name).toLowerCase();
        const isCore = name === 'el bosque'
            || name.indexOf('algodonales - levante') === 0
            || name.indexOf('matalascanas') === 0
            || name.indexOf('porto de mós') === 0
            || name.indexOf('praia da cordoama') === 0;
        if (!isCore) {
            EXTERNAL_SITES.push(site);
            const group = regionFromCoordinates(row[1], row[2], row[11]);
            if (!EXTERNAL_GROUPS[group]) EXTERNAL_GROUPS[group] = [];
            EXTERNAL_GROUPS[group].push(site);
        }
    });
}

function renderSiteTabs() {
    const tabs = document.getElementById('siteTabs');
    tabs.innerHTML = ''
        + '<button class="site-tab ' + (activeSiteGroup === 'andalusia' ? 'active' : '') + '" type="button" onclick="switchSiteGroup(\'andalusia\')">Andalucía</button>'
        + '<button class="site-tab ' + (activeSiteGroup === 'algarve' ? 'active' : '') + '" type="button" onclick="switchSiteGroup(\'algarve\')">Algarve</button>'
        + '<button class="site-tab ' + (activeSiteGroup === 'external' ? 'active' : '') + '" type="button" onclick="switchSiteGroup(\'external\')">External</button>'
        + '<label class="external-picker' + (activeSiteGroup === 'external' ? ' visible' : '') + '"><select class="external-select" onchange="selectExternalGroup(this.value)">' + buildExternalOptions() + '</select></label>';
}

function buildExternalOptions() {
    return EXTERNAL_REGION_ORDER.filter(function(group) { return EXTERNAL_GROUPS[group] && EXTERNAL_GROUPS[group].length; }).map(function(group) {
        return '<option value="' + group + '"' + (group === activeExternalGroup ? ' selected' : '') + '>' + escHtml(REGION_LABELS[group]) + '</option>';
    }).join('');
}

function selectExternalGroup(group) {
    if (!EXTERNAL_GROUPS[group]) return;
    activeExternalGroup = group;
    activeSiteGroup = 'external';
    locations = EXTERNAL_GROUPS[group].map(cloneLocation);
    renderSiteTabs();
    renderAll();
}

async function loadParaglidingSites() {
    buildEmbeddedSiteGroups(EMBEDDED_SITES);
    locations = SITE_GROUPS.andalusia.map(cloneLocation);
    renderSiteTabs();
    renderAll();
}
let currentModel = '';

const wxCache      = new Map();
const weatherStore = new Map();

let geoTimer     = null;
let infoOpen     = false;
let settingsOpen = false;

/* ===========================================
   Flyability scoring
=========================================== */
function dirShear(a, b) {
    const d = Math.abs(a - b) % 360;
    return d > 180 ? 360 - d : d;
}

function flyScore(ws10, gusts, dir10, dir120) {
    const sSpeed = ws10 < CFG.speedOpt ? 0 : ws10 < CFG.speedMod ? 1 : ws10 < CFG.speedStr ? 2 : 3;
    const sGust  = gusts < CFG.gustOk ? 0 : gusts < CFG.gustMod ? 1 : 2;
    const shear  = dirShear(dir10, dir120);
    const sShear = shear < CFG.shearOk ? 0 : shear < CFG.shearMod ? 1 : 2;
    return Math.max(sSpeed, sGust, sShear);
}

function arrowRotationDeg(deg) {
    const base = Number(deg) || 0;
    return (base + 180) % 360;
}

const FLY_LABELS  = ['Optimo', 'Moderado', 'Fuerte', 'Peligroso'];
const FLY_COLORS  = ['#22c55e', '#eab308', '#f97316', '#ef4444'];

/* ===========================================
   Helpers
=========================================== */
function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function formatCoordinateLabel(lat, lon) {
    const latLabel = lat >= 0 ? 'N' : 'S';
    const lonLabel = lon >= 0 ? 'E' : 'W';
    return Math.abs(lat).toFixed(4) + '°' + latLabel + ' · ' + Math.abs(lon).toFixed(4) + '°' + lonLabel;
}

const COMPASS_DIRS = [
    { label: 'N', deg: 0 }, { label: 'NNE', deg: 23 }, { label: 'NE', deg: 45 },
    { label: 'ENE', deg: 68 }, { label: 'E', deg: 90 }, { label: 'ESE', deg: 113 },
    { label: 'SE', deg: 135 }, { label: 'SSE', deg: 158 }, { label: 'S', deg: 180 },
    { label: 'SSO', deg: 203 }, { label: 'SO', deg: 225 }, { label: 'OSO', deg: 248 },
    { label: 'O', deg: 270 }, { label: 'ONO', deg: 293 }, { label: 'NO', deg: 315 },
    { label: 'NNO', deg: 338 },
];

function compassDir(deg) {
    const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSO','SO','OSO','O','ONO','NO','NNO'];
    return dirs[Math.round(deg / 22.5) % 16];
}

function buildDirOptions(selectedDeg) {
    const closest = COMPASS_DIRS.reduce((a, b) => {
        const da = Math.abs(((a.deg - selectedDeg) + 180) % 360 - 180);
        const db = Math.abs(((b.deg - selectedDeg) + 180) % 360 - 180);
        return da <= db ? a : b;
    });
    return COMPASS_DIRS.map(d =>
        '<option value="' + d.deg + '"' + (d.deg === closest.deg ? ' selected' : '') + '>' + d.label + '</option>'
    ).join('');
}

function dayLabelShort(isoDate) {
    const parts = isoDate.split('-').map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2]).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric' });
}

function getDays(times) {
    const days = [];
    times.forEach(function(t) { const d = t.split('T')[0]; if (!days.includes(d)) days.push(d); });
    return days;
}

function dirMatchesFilter(windDeg, filterDeg, tol) {
    return Math.abs(((windDeg - filterDeg) + 180) % 360 - 180) <= tol;
}

function bestWindows(idx, scores, times, dirs, speeds) {
    const df = locations[idx] && locations[idx].dirFilter;
    const days = {};
    times.forEach(function(t, i) {
        const day = t.split('T')[0];
        if (!days[day]) days[day] = [];
        const dirOk = !df || !df.enabled || dirMatchesFilter(dirs[i], df.deg, df.tol);
        days[day].push({ t: t, s: scores[i], dirOk: dirOk, speedOk: !speeds || speeds[i] >= CFG.speedMin });
    });
    return Object.entries(days).map(function(entry) {
        const date = entry[0]; const hrs = entry[1];
        let bestStart = null, bestEnd = null, bestLen = 0;
        let curStart = null, curEnd = null, curLen = 0;
        hrs.forEach(function(h) {
            const hour = parseInt(h.t.split('T')[1].slice(0, 2), 10);
            const favorable = h.s <= 2 && h.dirOk && h.speedOk && hour >= WINDOW_START_HOUR;
            if (favorable) {
                if (!curStart) curStart = h.t;
                curEnd = h.t;
                curLen++;
                if (curLen > bestLen) {
                    bestStart = curStart;
                    bestEnd = curEnd;
                    bestLen = curLen;
                }
            } else {
                curStart = null;
                curEnd = null;
                curLen = 0;
            }
        });
        return bestLen > 0
            ? {
                date: date,
                startIso: bestStart,
                label: dayLabelShort(date),
                start: bestStart.split('T')[1].slice(0, 5),
                end: bestEnd.split('T')[1].slice(0, 5),
                hours: bestLen
            }
            : null;
    }).filter(Boolean);
}

/* ===========================================
   CBL / Thermal colour helpers
=========================================== */
function cblColor(blh) {
    if (blh == null || blh < 50) return '#374151';
    if (blh < 300)  return '#4b5563';
    if (blh < 700)  return '#0ea5e9';
    if (blh < 1500) return '#22c55e';
    if (blh < 2500) return '#f59e0b';
    return '#ef4444';
}

function cblStrength(blh) {
    if (blh == null || blh < 50) return '-';
    if (blh < 300)  return 'Muy debil';
    if (blh < 700)  return 'Debil';
    if (blh < 1500) return 'Activas';
    if (blh < 2500) return 'Fuertes';
    return 'Muy fuertes';
}

function cblShortLabel(blh) {
    if (blh == null) return '-';
    if (blh < 1000) return Math.round(blh) + 'm';
    return (blh / 1000).toFixed(1) + 'k';
}

/* ===========================================
   API
=========================================== */
async function fetchWeather(loc) {
    const key = loc.lat + ',' + loc.lon + ',' + currentModel;
    if (wxCache.has(key)) return wxCache.get(key);
    const modelParam = currentModel ? '&models=' + encodeURIComponent(currentModel) : '';
    const url = API_WX + '?latitude=' + loc.lat + '&longitude=' + loc.lon + '&hourly=' + PARAMS + '&timezone=auto&forecast_days=3' + modelParam;
    const r = await fetch(url);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const data = await r.json();
    wxCache.set(key, data);
    return data;
}

function onModelChange() {
    currentModel = document.getElementById('modelSelect').value;
    wxCache.clear();
    weatherStore.clear();
    renderAll();
}

/* ===========================================
   Summary bar
=========================================== */
function buildSummary(idx, scores, times, dirs, speeds) {
    const wins = bestWindows(idx, scores, times, dirs, speeds);
    if (!wins.length) return '<span class="chip"><span class="chip-dot" style="background:var(--f3)"></span>Sin ventanas favorables</span>';
    return wins.slice(0, 3).map(function(w) {
        return '<span class="chip"><span class="chip-dot" style="background:var(--f0)"></span>' + escHtml(w.label) + ' · ' + escHtml(w.start) + '–' + escHtml(w.end) + ' (' + w.hours + 'h)</span>';
    }).join('');
}

/* ===========================================
   Day tabs
=========================================== */
function buildDayTabs(idx, days, scores, times, selDay) {
    return days.map(function(d, i) {
        const dayHourIndices = [];
        times.forEach(function(t, hi) { if (t.startsWith(d)) dayHourIndices.push(hi); });
        const step = Math.max(1, Math.floor(dayHourIndices.length / 6));
        const sample = dayHourIndices.filter(function(_, j) { return j % step === 0; }).slice(0, 6);
        const dots = sample.map(function(hi) {
            return '<span class="day-tab-dot" style="background:' + FLY_COLORS[scores[hi]] + '"></span>';
        }).join('');
        return '<button class="day-tab ' + (i === selDay ? 'active' : '') + '" onclick="selectDay(' + idx + ', ' + i + ')">'
            + '<span>' + dayLabelShort(d) + '</span>'
            + '<div class="day-tab-dots">' + dots + '</div>'
            + '</button>';
    }).join('');
}

/* ===========================================
   Hourly cards
=========================================== */
function buildHourCards(idx, h, scores, selDay) {
    const df = locations[idx] && locations[idx].dirFilter;
    const days = getDays(h.time);
    const dayDate = days[selDay];
    const maxBLH = 3000;

    return h.time.map(function(t, i) {
        if (!t.startsWith(dayDate)) return '';

        const s      = scores[i];
        const dir10  = h.wind_direction_10m[i];
        const dir120 = h.wind_direction_120m[i];
        const ws10   = h.wind_speed_10m[i];
        const gust   = h.wind_gusts_10m[i];
        const blh    = (h.boundary_layer_height && h.boundary_layer_height[i] != null) ? h.boundary_layer_height[i] : null;
        const shear  = dirShear(dir10, dir120);

        const dirOk = !df || !df.enabled || dirMatchesFilter(dir10, df.deg, df.tol);
        const cls   = !dirOk ? 'dir-filtered' : ws10 < CFG.speedMin ? 'score-' + s + ' too-light' : 'score-' + s;

        const timeStr   = t.split('T')[1].slice(0, 5).replace(':00', 'h');
        const barH      = blh !== null ? Math.max(2, Math.round((Math.min(blh, maxBLH) / maxBLH) * 22)) : 2;
        const barClr    = cblColor(blh);
        const gustHigh  = gust > CFG.gustOk;
        const shearWarn = shear > CFG.shearOk;

        return '<div class="hour-card ' + cls + '" id="hc-' + idx + '-' + i + '" onclick="showDetail(' + idx + ', ' + i + ')">'
            + '<div class="hc-time">' + timeStr + '</div>'
            + '<div class="hc-badge" style="background:' + FLY_COLORS[s] + ';color:' + (s === 1 ? '#000' : '#fff') + '">' + FLY_LABELS[s].slice(0, 3) + '</div>'
            + '<div class="hc-arrows">'
            +   '<span class="hc-arr10"  style="display:inline-block;transform:rotate(' + arrowRotationDeg(dir10) + 'deg)">↑</span>'
            +   '<span class="hc-arr120" style="display:inline-block;transform:rotate(' + arrowRotationDeg(dir120) + 'deg)">↑</span>'
            + '</div>'
            + '<div class="hc-spd">' + ws10.toFixed(0) + '<small>km/h</small></div>'
            + '<div class="hc-gust' + (gustHigh ? ' warn' : '') + '">↗' + gust.toFixed(0) + '</div>'
            + (shearWarn ? '<div class="hc-shear">⚡' + shear.toFixed(0) + '°</div>' : '')
            + '<div class="hc-cbl">'
            +   '<div class="hc-cbl-bg"><div class="hc-cbl-fill" style="height:' + barH + 'px;background:' + barClr + '"></div></div>'
            +   '<div class="hc-cbl-txt">' + cblShortLabel(blh) + '</div>'
            + '</div>'
            + '</div>';
    }).join('');
}

/* ===========================================
   Detail panel
=========================================== */
function showDetail(idx, hourIdx) {
    const card = document.getElementById('card-' + idx);
    if (!card) return;

    const wasActive = document.getElementById('hc-' + idx + '-' + hourIdx) &&
                      document.getElementById('hc-' + idx + '-' + hourIdx).classList.contains('active-detail');
    card.querySelectorAll('.hour-card.active-detail').forEach(function(c) { c.classList.remove('active-detail'); });
    const dp = card.querySelector('.detail-panel');
    if (wasActive) { dp.classList.remove('visible'); return; }

    const hcEl = document.getElementById('hc-' + idx + '-' + hourIdx);
    if (hcEl) hcEl.classList.add('active-detail');

    const data = weatherStore.get(idx);
    if (!data) return;
    const h = data.hourly;

    const ws10  = h.wind_speed_10m[hourIdx];
    const gust  = h.wind_gusts_10m[hourIdx];
    const ws80  = h.wind_speed_80m[hourIdx];
    const ws120 = h.wind_speed_120m[hourIdx];
    const ws180 = h.wind_speed_180m[hourIdx];
    const d10   = h.wind_direction_10m[hourIdx];
    const d80   = (h.wind_direction_80m  && h.wind_direction_80m[hourIdx]  != null) ? h.wind_direction_80m[hourIdx]  : d10;
    const d120  = h.wind_direction_120m[hourIdx];
    const d180  = (h.wind_direction_180m && h.wind_direction_180m[hourIdx] != null) ? h.wind_direction_180m[hourIdx] : d120;
    const blh   = (h.boundary_layer_height && h.boundary_layer_height[hourIdx] != null) ? h.boundary_layer_height[hourIdx] : null;
    const shear = dirShear(d10, d120);

    const sSpeed = ws10 < CFG.speedOpt ? 0 : ws10 < CFG.speedMod ? 1 : ws10 < CFG.speedStr ? 2 : 3;
    const sGust  = gust < CFG.gustOk ? 0 : gust < CFG.gustMod ? 1 : 2;
    const sShear = shear < CFG.shearOk ? 0 : shear < CFG.shearMod ? 1 : 2;
    const s = Math.max(sSpeed, sGust, sShear);

    const timeStr = h.time[hourIdx].replace('T', ' ').slice(0, 16);
    const df = locations[idx] && locations[idx].dirFilter;
    const reasons = [];
    if (df && df.enabled && !dirMatchesFilter(d10, df.deg, df.tol))
        reasons.push('Dir ' + compassDir(d10) + ' (' + d10 + '°) fuera del filtro');
    if (ws10 < CFG.speedMin) reasons.push('Viento ' + ws10.toFixed(1) + ' km/h < minimo ' + CFG.speedMin + ' km/h');
    if (sSpeed > 0) reasons.push('Viento ' + ws10.toFixed(1) + ' km/h > limite ' + CFG.speedOpt + ' km/h');
    if (sGust  > 0) reasons.push('Rachas ' + gust.toFixed(1) + ' km/h > limite ' + CFG.gustOk + ' km/h');
    if (sShear > 0) reasons.push('Cizalladura ' + shear.toFixed(0) + '° > limite ' + CFG.shearOk + '°');

    const cblTxt = blh !== null ? Math.round(blh) + ' m' : '-';

    dp.innerHTML = ''
        + '<div class="dp-header">'
        +   '<div class="dp-time">' + escHtml(timeStr) + '</div>'
        +   '<span class="dp-badge" style="background:' + FLY_COLORS[s] + ';color:' + (s === 1 ? '#000' : '#fff') + '">' + FLY_LABELS[s] + '</span>'
        + '</div>'
        + '<div class="dp-grid">'
        +   '<div class="dp-row"><span class="dp-key">Viento 10m</span><span class="dp-val ' + (sSpeed >= 3 ? 'danger' : sSpeed >= 1 ? 'warn' : '') + '">' + ws10.toFixed(1) + ' km/h</span></div>'
        +   '<div class="dp-row"><span class="dp-key">Rachas</span><span class="dp-val ' + (sGust >= 1 ? 'warn' : '') + '">' + gust.toFixed(1) + ' km/h</span></div>'
        +   '<div class="dp-row"><span class="dp-key">Viento 80m</span><span class="dp-val">' + ws80.toFixed(1) + ' km/h</span></div>'
        +   '<div class="dp-row"><span class="dp-key">Viento 120m</span><span class="dp-val">' + ws120.toFixed(1) + ' km/h</span></div>'
        +   '<div class="dp-row"><span class="dp-key">Viento 180m</span><span class="dp-val">' + ws180.toFixed(1) + ' km/h</span></div>'
        +   '<div class="dp-row"><span class="dp-key">Cizalladura</span><span class="dp-val ' + (sShear >= 1 ? 'warn' : '') + '">' + shear.toFixed(0) + '°</span></div>'
        +   '<div class="dp-row"><span class="dp-key">Techo CBL</span><span class="dp-val" style="color:' + cblColor(blh) + '">' + cblTxt + '</span></div>'
        +   '<div class="dp-row"><span class="dp-key">Termicas</span><span class="dp-val" style="color:' + cblColor(blh) + '">' + cblStrength(blh) + '</span></div>'
        + '</div>'
        + '<div class="dp-dirs">'
        +   '<div class="dp-dir-item"><span class="dp-dir-arr" style="color:#7dd3fc;display:inline-block;transform:rotate(' + arrowRotationDeg(d10) + 'deg)">↑</span><div class="dp-dir-name">' + compassDir(d10) + '</div><div class="dp-dir-alt">10m · ' + d10 + '°</div></div>'
        +   '<div class="dp-dir-item"><span class="dp-dir-arr" style="color:#4ade80;display:inline-block;transform:rotate(' + arrowRotationDeg(d80) + 'deg)">↑</span><div class="dp-dir-name">' + compassDir(d80) + '</div><div class="dp-dir-alt">80m · ' + d80 + '°</div></div>'
        +   '<div class="dp-dir-item"><span class="dp-dir-arr" style="color:#c084fc;display:inline-block;transform:rotate(' + arrowRotationDeg(d120) + 'deg)">↑</span><div class="dp-dir-name">' + compassDir(d120) + '</div><div class="dp-dir-alt">120m · ' + d120 + '°</div></div>'
        +   '<div class="dp-dir-item"><span class="dp-dir-arr" style="color:#e879f9;display:inline-block;transform:rotate(' + arrowRotationDeg(d180) + 'deg)">↑</span><div class="dp-dir-name">' + compassDir(d180) + '</div><div class="dp-dir-alt">180m · ' + d180 + '°</div></div>'
        + '</div>'
        + '<div class="dp-reasons">'
        + (reasons.length === 0
            ? '<span style="color:var(--f0)">✓ Condiciones optimas</span>'
            : reasons.map(function(r) { return '<span>⚠ ' + escHtml(r) + '</span>'; }).join(''))
        + '</div>';

    dp.classList.add('visible');
    if (hcEl) hcEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
}

/* ===========================================
   Day selection
=========================================== */
function selectDay(idx, dayIdx) {
    locations[idx].selectedDay = dayIdx;
    const data = weatherStore.get(idx);
    if (data) rebuildHourly(idx, data);
}

function rebuildHourly(idx, data) {
    const card = document.getElementById('card-' + idx);
    if (!card) return;

    const body = card.querySelector('.loc-body');
    if (!body) return;

    const h = data.hourly;
    const scores = h.time.map(function(_, i) {
        return flyScore(h.wind_speed_10m[i], h.wind_gusts_10m[i], h.wind_direction_10m[i], h.wind_direction_120m[i]);
    });
    const days = getDays(h.time);
    const selDay = locations[idx].selectedDay != null ? locations[idx].selectedDay : 0;

    body.innerHTML = ''
        + '<div class="summary-bar">' + buildSummary(idx, scores, h.time, h.wind_direction_10m, h.wind_speed_10m) + '</div>'
        + '<div class="day-tabs">' + buildDayTabs(idx, days, scores, h.time, selDay) + '</div>'
        + '<div class="hourly-section">'
        +   '<div class="hourly-hint">← desliza · toca para detalles</div>'
        +   '<div class="hourly-scroll">' + buildHourCards(idx, h, scores, selDay) + '</div>'
        +   '<div class="detail-panel"></div>'
        + '</div>'
        + '<div class="loc-legend">'
        +   '<span class="lgi"><span class="lgdot" style="background:var(--f0)"></span>Optimo ' + CFG.speedMin + '–' + CFG.speedOpt + ' km/h</span>'
        +   '<span class="lgi"><span class="lgdot" style="background:var(--f1)"></span>Moderado</span>'
        +   '<span class="lgi"><span class="lgdot" style="background:var(--f2)"></span>Fuerte</span>'
        +   '<span class="lgi"><span class="lgdot" style="background:var(--f3)"></span>Peligroso</span>'
        +   '<span class="lgi"><span class="lgdot" style="background:#0ea5e9"></span>Term. leves</span>'
        +   '<span class="lgi"><span class="lgdot" style="background:#22c55e"></span>Term. activas</span>'
        +   '<span class="lgi"><span class="lgdot" style="background:#f59e0b"></span>Term. fuertes</span>'
        + '</div>';

    scrollToDefaultCard(idx, h, scores, days, selDay);
}

function scrollToDefaultCard(idx, h, scores, days, selDay) {
    const card = document.getElementById('card-' + idx);
    const scroller = card && card.querySelector('.hourly-scroll');
    if (!scroller) return;
    const dayDate = days[selDay];
    const win = bestWindows(idx, scores, h.time, h.wind_direction_10m, h.wind_speed_10m)
        .find(function(w) { return w.date === dayDate; });
    const targetTime = win ? win.startIso : dayDate + 'T' + String(DEFAULT_CARD_HOUR).padStart(2, '0') + ':00';
    const i = h.time.indexOf(targetTime);
    const el = i >= 0 && document.getElementById('hc-' + idx + '-' + i);
    if (!el) return;
    scroller.scrollLeft = el.getBoundingClientRect().left - scroller.getBoundingClientRect().left + scroller.scrollLeft - 12;
}

/* ===========================================
   Render
=========================================== */
function createCard(idx) {
    const loc = locations[idx];
    if (!loc.dirFilter)            loc.dirFilter   = { enabled: false, deg: 270, tol: 45 };
    if (loc.selectedDay == null)   loc.selectedDay = 0;
    const df = loc.dirFilter;
    const el = document.createElement('div');
    el.className = 'loc-card';
    el.id = 'card-' + idx;
    el.innerHTML = ''
        + '<div class="loc-header">'
        +   '<div><h2>' + escHtml(loc.name) + '</h2><div class="coord">' + formatCoordinateLabel(loc.lat, loc.lon) + '</div></div>'
        +   '<div class="loc-actions">'
        +     '<button class="btn btn-ghost btn-sm" onclick="refreshCard(' + idx + ')">↻</button>'
        +     '<button class="btn btn-danger btn-sm" onclick="removeLocation(' + idx + ')">✕</button>'
        +   '</div>'
        + '</div>'
        + '<div class="dir-filter-bar">'
        +   '<label class="df-toggle"><input type="checkbox" id="df-on-' + idx + '" ' + (df.enabled ? 'checked' : '') + ' onchange="applyDirFilter(' + idx + ')"><span>Filtro direccion</span></label>'
        +   '<div class="df-controls">'
        +     '<span class="df-label">Desde</span>'
        +     '<select id="df-deg-' + idx + '" class="df-select" onchange="updateDirFilter(' + idx + ')">' + buildDirOptions(df.deg) + '</select>'
        +     '<span class="df-label">±</span>'
        +     '<input type="number" id="df-tol-' + idx + '" min="5" max="180" value="' + df.tol + '" class="df-input" oninput="updateDirFilter(' + idx + ')">'
        +     '<span class="df-label">°</span>'
        +   '</div>'
        + '</div>'
        + '<div class="loc-body"></div>';
    return el;
}

async function renderLocation(idx) {
    const card = document.getElementById('card-' + idx);
    if (!card) return;
    const body = card.querySelector('.loc-body');
    body.innerHTML = '<div class="loc-loading">Cargando datos…</div>';
    try {
        const data = await fetchWeather(locations[idx]);
        weatherStore.set(idx, data);
        const h      = data.hourly;
        const scores = h.time.map(function(_, i) {
            return flyScore(h.wind_speed_10m[i], h.wind_gusts_10m[i], h.wind_direction_10m[i], h.wind_direction_120m[i]);
        });
        const days   = getDays(h.time);
        const selDay = locations[idx].selectedDay != null ? locations[idx].selectedDay : 0;

        rebuildHourly(idx, data);
    } catch (e) {
        body.innerHTML = '<div class="loc-error">Error al obtener datos: ' + escHtml(e.message) + '</div>';
    }
}

function switchSiteGroup(groupKey) {
    const key = groupKey || 'andalusia';
    if (key === 'external') {
        if (!EXTERNAL_GROUPS[activeExternalGroup]) {
            activeExternalGroup = EXTERNAL_REGION_ORDER.find(function(group) { return EXTERNAL_GROUPS[group] && EXTERNAL_GROUPS[group].length; });
        }
        if (!activeExternalGroup) return;
        activeSiteGroup = key;
        locations = EXTERNAL_GROUPS[activeExternalGroup].map(cloneLocation);
        renderSiteTabs();
        renderAll();
        return;
    }
    if (!SITE_GROUPS[key]) return;

    activeSiteGroup = key;
    locations = SITE_GROUPS[key].map(cloneLocation);
    renderSiteTabs();
    renderAll();
}

function renderAll() {
    weatherStore.clear();
    const main = document.getElementById('main');
    main.innerHTML = '';
    if (!locations.length) {
        main.innerHTML = '<div class="empty-state">Sin ubicaciones. Anade una con el buscador.</div>';
        return;
    }
    const manualFetchRequired = locations.length > 3;
    if (manualFetchRequired) {
        main.innerHTML = '<div class="manual-fetch"><span>Hay ' + locations.length + ' lugares seleccionados. Pulsa para solicitar sus previsiones.</span><button class="btn btn-accent btn-sm" onclick="fetchSelectedLocations()">Solicitar previsiones</button></div>';
    }
    locations.forEach(function(_, i) {
        main.appendChild(createCard(i));
        if (!manualFetchRequired) renderLocation(i);
    });
}

function fetchSelectedLocations() {
    const button = document.querySelector('.manual-fetch button');
    if (button) {
        button.disabled = true;
        button.textContent = 'Solicitando…';
    }
    locations.forEach(function(_, i) { renderLocation(i); });
}

function removeLocation(idx) {
    const key = locations[idx].lat + ',' + locations[idx].lon + ',' + currentModel;
    wxCache.delete(key);
    weatherStore.delete(idx);
    locations.splice(idx, 1);
    renderAll();
}

async function refreshCard(idx) {
    const key = locations[idx].lat + ',' + locations[idx].lon + ',' + currentModel;
    wxCache.delete(key);
    weatherStore.delete(idx);
    await renderLocation(idx);
}

function appendLocation(loc) {
    locations.push(loc);
    renderAll();
    const card = document.getElementById('card-' + (locations.length - 1));
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ===========================================
   Direction filter
=========================================== */
function applyDirFilter(idx) {
    locations[idx].dirFilter.enabled = document.getElementById('df-on-' + idx).checked;
    const data = weatherStore.get(idx);
    if (data) rebuildHourly(idx, data);
}

function updateDirFilter(idx) {
    const df     = locations[idx].dirFilter;
    const degRaw = parseFloat(document.getElementById('df-deg-' + idx).value);
    const tolRaw = parseFloat(document.getElementById('df-tol-' + idx).value);
    df.deg = Number.isFinite(degRaw) ? degRaw : 270;
    df.tol = Number.isFinite(tolRaw) ? Math.max(0, Math.min(180, tolRaw)) : 45;
    const data = weatherStore.get(idx);
    if (data) rebuildHourly(idx, data);
}

/* ===========================================
   Geocoding search
=========================================== */
const searchInput = document.getElementById('searchInput');
const dropdown    = document.getElementById('dropdown');

searchInput.addEventListener('input', function() {
    clearTimeout(geoTimer);
    const q = searchInput.value.trim();
    if (q.length < 2) { dropdown.style.display = 'none'; return; }
    geoTimer = setTimeout(function() { doGeoSearch(q); }, 380);
});

searchInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter')  handleSearch();
    if (e.key === 'Escape') dropdown.style.display = 'none';
});

document.addEventListener('click', function(e) {
    if (!e.target.closest('.search-wrap')) dropdown.style.display = 'none';
});

async function doGeoSearch(q) {
    try {
        const r = await fetch(API_GEO + '?name=' + encodeURIComponent(q) + '&count=6&language=es&format=json');
        const d = await r.json();
        if (!d.results || !d.results.length) {
            dropdown.innerHTML = '<div style="color:var(--sub);cursor:default">Sin resultados</div>';
            dropdown.style.display = 'block';
            return;
        }
        dropdown.innerHTML = '';
        d.results.forEach(function(res) {
            const row = document.createElement('div');
            row.textContent = [res.name, res.admin1, res.country].filter(Boolean).join(', ');
            row.onclick = function() {
                dropdown.style.display = 'none';
                searchInput.value = '';
                appendLocation({ name: res.name, lat: res.latitude, lon: res.longitude });
            };
            dropdown.appendChild(row);
        });
        dropdown.style.display = 'block';
    } catch (e) { console.error('Geo:', e); }
}

async function handleSearch() {
    const q = searchInput.value.trim();
    if (q) await doGeoSearch(q);
}

/* ===========================================
   Info / Settings panels
=========================================== */
function toggleInfo() {
    infoOpen = !infoOpen;
    document.getElementById('infoPanel').classList.toggle('open', infoOpen);
}

function toggleSettings() {
    settingsOpen = !settingsOpen;
    if (settingsOpen) populateSettingsInputs();
    document.getElementById('settingsPanel').classList.toggle('open', settingsOpen);
}

function populateSettingsInputs() {
    document.getElementById('cfg-smin').value = CFG.speedMin;
    document.getElementById('cfg-s1').value  = CFG.speedOpt;
    document.getElementById('cfg-s2').value  = CFG.speedMod;
    document.getElementById('cfg-s3').value  = CFG.speedStr;
    document.getElementById('cfg-gf1').value = CFG.gustOk;
    document.getElementById('cfg-gf2').value = CFG.gustMod;
    document.getElementById('cfg-sh1').value = CFG.shearOk;
    document.getElementById('cfg-sh2').value = CFG.shearMod;
}

function readSettingsInputs() {
    const n = function(id) { return parseFloat(document.getElementById(id).value); };
    return {
        speedMin: n('cfg-smin'), speedOpt: n('cfg-s1'), speedMod: n('cfg-s2'), speedStr: n('cfg-s3'),
        gustOk: n('cfg-gf1'), gustMod: n('cfg-gf2'),
        shearOk: n('cfg-sh1'), shearMod: n('cfg-sh2'),
    };
}

function applySettings() {
    const v = readSettingsInputs();
    if (v.speedMin >= v.speedOpt || v.speedOpt >= v.speedMod || v.speedMod >= v.speedStr) {
        alert('Los limites de velocidad deben ser ascendentes (Minimo < Optimo < Moderado < Fuerte).');
        return;
    }
    if (v.gustOk >= v.gustMod) { alert('Los limites de rachas deben ser ascendentes.'); return; }
    if (v.shearOk >= v.shearMod) { alert('Los limites de cizalladura deben ser ascendentes.'); return; }
    CFG = v;
    renderAll();
}

function resetSettings() {
    CFG = { ...CFG_DEFAULTS };
    populateSettingsInputs();
    renderAll();
}

/* ===========================================
   Init
=========================================== */
loadParaglidingSites().catch(function(error) {
    document.getElementById('main').innerHTML = '<div class="empty-state">No se pudieron cargar las zonas de vuelo: ' + escHtml(error.message) + '</div>';
});
