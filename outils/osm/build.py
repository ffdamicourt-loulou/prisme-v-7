"""Pipeline OSM 3 niveaux -> packages JS (format Prisme).
Étapes résilientes (relances sans perte, tranches pour gros PBF) :
  python3 build.py telecharger XX     # télécharge le PBF Geofabrik
  python3 build.py rels XX [i n]      # relations admin (tranche de n blocs depuis l'index i)
  python3 build.py ways XX [i n]      # ways référencées (tranches)
  python3 build.py nodes XX [i n]     # coords des nodes (tranches)
  python3 build.py villes XX [i n]    # nodes place=city/town
  python3 build.py final XX           # assemblage -> packages-osm/XX-n{1,2,3}.js + XX-villes.js
État dans etat/XX/, sortie dans packages-osm/.
IMPORTANT : pousser packages-osm/ vers GitHub après chaque pays (l'env se réinitialise).
"""
import json, os, sys, time, struct, zlib, subprocess

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import osmpbf

RACINE = os.path.dirname(os.path.abspath(__file__))
CONF = json.load(open(os.path.join(RACINE, 'config_pays.json')))
PBFS = os.path.join(RACINE, 'pbfs')
ETAT = os.path.join(RACINE, 'etat')
OUT = os.path.join(RACINE, 'packages-osm')
BUDGET = 200  # secondes max de travail par appel avant sauvegarde et sortie
for d in (PBFS, ETAT, OUT):
    os.makedirs(d, exist_ok=True)


def conf(XX):
    c = dict(CONF['_defaut'])
    c.update(CONF['pays'].get(XX, {}))
    return c


def pbf(XX):
    return os.path.join(PBFS, XX + '.osm.pbf')


def jload(XX, nom, defv):
    p = os.path.join(ETAT, XX, nom)
    if os.path.exists(p):
        return json.load(open(p))
    return defv


def jdump(XX, nom, v):
    os.makedirs(os.path.join(ETAT, XX), exist_ok=True)
    json.dump(v, open(os.path.join(ETAT, XX, nom), 'w'), separators=(',', ':'))


# ---------------------------------------------------------------- lecteur à tranches
def lecteur(path, i0, i1):
    """itérateur (idx, typ, data) sur les blocs d'index [i0, i1). Les blocs
    hors tranche sont skippés SANS décompression (lecture rapide)."""
    f = open(path, 'rb')
    idx = 0
    while True:
        head = f.read(4)
        if len(head) < 4:
            return
        (ln,) = struct.unpack('>i', head)
        bh = f.read(ln)
        typ = None; dsz = None
        for f_, wt, c in osmpbf._fields(bh):
            if f_ == 1 and wt == 2: typ = c.decode('latin1')
            elif f_ == 3 and wt == 0: dsz = c
        pos = f.tell()
        f.seek(dsz, 1)
        if i0 <= idx < i1:
            f.seek(pos)
            blob = f.read(dsz)
            raw = zdata = None
            for f_, wt, c in osmpbf._fields(blob):
                if f_ == 1 and wt == 2: raw = c
                elif f_ == 3 and wt == 2: zdata = c
            data = raw if raw is not None else zlib.decompress(zdata)
            yield idx, typ, data
        idx += 1
        if idx >= i1:
            return


def nb_blocs_estime(path):
    """compte les blocs sans décompression (rapide)"""
    f = open(path, 'rb'); idx = 0
    while True:
        head = f.read(4)
        if len(head) < 4: return idx
        (ln,) = struct.unpack('>i', head)
        bh = f.read(ln); dsz = None
        for f_, wt, c in osmpbf._fields(bh):
            if f_ == 3 and wt == 0: dsz = c
        f.seek(dsz, 1); idx += 1


# ---------------------------------------------------------------- étapes
def cmd_telecharger(XX):
    url = conf(XX)['geofabrik']
    assert url, 'pas d URL geofabrik pour ' + XX
    dst = pbf(XX)
    candidats = [url]
    # variante nouveau schéma géofabrik : europe/xx/eu-xx-latest.osm.pbf
    if '/europe/' in url and '.osm.pbf' in url:
        seg = url.split('/europe/')[1].split('/')[0].split('-')[0]
        candidats.append(url.replace('/europe/', '/europe/%s/' % seg))
    for k in range(1, 8):
        t = time.gmtime(time.time() - 86400 * k)
        for u in (url,):
            candidats.append(u.replace('-latest', '-%02d%02d%02d' % (t[0] % 100, t[1], t[2])))
    for essai in candidats:
        subprocess.call(['curl', '-sm', '600', '-L', '-o', dst, essai])
        ok = os.path.exists(dst) and os.path.getsize(dst) > 1000 and open(dst, 'rb').read(1) != b'<'
        if ok:
            print('telecharge:', essai, os.path.getsize(dst))
            return
        if os.path.exists(dst): os.remove(dst)
    raise SystemExit('echec telechargement ' + XX)


def niveaux(XX):
    return [2] + conf(XX)['lv']


def cmd_rels(XX, n=1 << 30):
    """scan des relations admin (reprise sur rels_idx.json, tranches de n blocs)."""
    lvls = set(str(x) for x in niveaux(XX))
    t0 = time.time()
    if jload(XX, 'rels_ok.json', 0):
        print('rels déjà complet:', len(jload(XX, 'rels.json', []))); return
    rels = jload(XX, 'rels.json', [])
    idx = jload(XX, 'rels_idx.json', 0)
    for i2, typ, data in lecteur(pbf(XX), idx, idx + n):
        if typ != 'OSMData': continue
        b = osmpbf.Bloc(data)
        for g, hd, hw, hr in b.groupes_types():
            if not hr: continue
            for r in b.relations(g):
                tg = r['tags']
                lv = tg.get('admin_level')
                if tg.get('boundary') == 'administrative' and lv in lvls and tg.get('type') in ('boundary', 'multipolygon'):
                    nom = tg.get('name:fr') or tg.get('name') or ''
                    mems = [[m[1], m[2]] for m in r['members'] if m[0] == 'way']
                    rels.append({'id': r['id'], 'lvl': int(lv), 'nom': nom, 'mem': mems})
        if time.time() - t0 > BUDGET:
            jdump(XX, 'rels.json', rels); jdump(XX, 'rels_idx.json', i2 + 1)
            print('rels pause a bloc', i2 + 1, 'total', len(rels))
            return
    jdump(XX, 'rels.json', rels); jdump(XX, 'rels_idx.json', 0); jdump(XX, 'rels_ok.json', 1)
    print('rels OK:', len(rels))


def need_ways(XX):
    rels = jload(XX, 'rels.json', [])
    s = set()
    for r in rels:
        for m in r['mem']:
            s.add(m[0])
    return s


def cmd_ways(XX, n=1 << 30):
    t0 = time.time()
    if jload(XX, 'ways_ok.json', 0):
        print('ways déjà complet'); return
    need = need_ways(XX)
    ways = jload(XX, 'ways.json', {})
    idx = jload(XX, 'ways_idx.json', 0)
    for i2, typ, data in lecteur(pbf(XX), idx, idx + n):
        if typ != 'OSMData': continue
        b = osmpbf.Bloc(data)
        for g, hd, hw, hr in b.groupes_types():
            if not hw: continue
            for wid, refs in b.ways(g, filtre=lambda w: w in need):
                ways[str(wid)] = refs
        if time.time() - t0 > BUDGET:
            jdump(XX, 'ways.json', ways); jdump(XX, 'ways_idx.json', i2 + 1)
            print('ways pause a bloc', i2 + 1, 'trouves', len(ways), '/', len(need))
            return
    jdump(XX, 'ways.json', ways); jdump(XX, 'ways_idx.json', 0); jdump(XX, 'ways_ok.json', 1)
    print('ways OK:', len(ways), '/', len(need))


def need_nodes(XX):
    ways = jload(XX, 'ways.json', {})
    s = set()
    for refs in ways.values():
        s.update(refs)
    return s


def cmd_nodes(XX, n=1 << 30):
    t0 = time.time()
    if jload(XX, 'nodes_ok.json', 0):
        print('nodes déjà complet'); return
    need = need_nodes(XX)
    nds = jload(XX, 'nodes.json', {})
    idx = jload(XX, 'nodes_idx.json', 0)
    for i2, typ, data in lecteur(pbf(XX), idx, idx + n):
        if typ != 'OSMData': continue
        b = osmpbf.Bloc(data)
        for g, hd, hw, hr in b.groupes_types():
            if not hd: continue
            x = b.dense_brut(g)
            if not x: continue
            ids, lats, lons = x
            la = 0; lo = 0; nid = 0
            for k in range(len(ids)):
                nid += ids[k]
                la += lats[k] if k < len(lats) else 0
                lo += lons[k] if k < len(lons) else 0
                if nid in need:
                    # quantification 1e-4 degrés : (nanodegrés)/1e5
                    nds[str(nid)] = [round((b.lon0 + b.gran * lo) / 1e5),
                                     round((b.lat0 + b.gran * la) / 1e5)]
        if time.time() - t0 > BUDGET:
            jdump(XX, 'nodes.json', nds); jdump(XX, 'nodes_idx.json', i2 + 1)
            print('nodes pause a bloc', i2 + 1, len(nds), '/', len(need))
            return
    jdump(XX, 'nodes.json', nds); jdump(XX, 'nodes_idx.json', 0); jdump(XX, 'nodes_ok.json', 1)
    print('nodes OK:', len(nds), '/', len(need))


def cmd_villes(XX, n=1 << 30):
    t0 = time.time()
    vs = jload(XX, 'villes.json', [])
    idx = jload(XX, 'villes_idx.json', 0)
    for i2, typ, data in lecteur(pbf(XX), idx, idx + n):
        if typ != 'OSMData': continue
        vs.extend(osmpbf.Bloc(data).VilleNodes())
        if time.time() - t0 > BUDGET:
            jdump(XX, 'villes.json', vs); jdump(XX, 'villes_idx.json', i2 + 1)
            print('villes pause a bloc', i2 + 1, len(vs)); return
    jdump(XX, 'villes.json', vs); jdump(XX, 'villes_idx.json', 0)
    print('villes brutes:', len(vs))


# ---------------------------------------------------------------- final
def b36(v):
    s = '0123456789abcdefghijklmnopqrstuvwxyz'
    if v < 0: return '-' + b36(-v)
    if v < 36: return s[v]
    out = ''
    while v:
        out = s[v % 36] + out; v //= 36
    return out


def enc_anneau(pts):
    """pts = [(x,y) quantifiés 1e-4] -> "x0,y0 dx,dy ..." (deltas base-36)"""
    out = []
    px, py = 0, 0
    for k, (x, y) in enumerate(pts):
        if k == 0:
            out.append(b36(x) + ',' + b36(y)); px, py = x, y
        else:
            out.append(b36(x - px) + ',' + b36(y - py)); px, py = x, y
    return ' '.join(out)


def aire(ring):
    """ring = [(x,y)] ints ; aire signée (x2) en unités 1e-4 degrés"""
    a = 0
    for k in range(len(ring) - 1):
        x1, y1 = ring[k]; x2, y2 = ring[k + 1]
        a += x1 * y2 - x2 * y1
    return a


def point_dans(pt, ring):
    """ray casting sur ring [(x,y)] ints fermé implicite"""
    x, y = pt; c = False; n = len(ring)
    j = n - 1
    for i2 in range(n):
        xi, yi = ring[i2]; xj, yj = ring[j]
        if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / (yj - yi + 1e-12) + xi):
            c = not c
        j = i2
    return c


def chain(mems, ways, nds, log):
    """membres [(wid, role)] -> anneaux fermés [(x,y)...] ; trous logués"""
    segs = []
    for wid, role in mems:
        refs = ways.get(str(wid))
        if refs is None:
            log['ways_manquantes'] = log.get('ways_manquantes', 0) + 1
            continue
        pts = [tuple(nds[str(r)]) for r in refs if str(r) in nds]
        if len(pts) < 2:
            log['nodes_manquants'] = log.get('nodes_manquants', 0) + 1
            continue
        segs.append((pts, role))
    # chainage par extrémités
    libres = {}   # node -> liste d'indices de segments
    for k2, (pts, role) in enumerate(segs):
        libres.setdefault(pts[0], []).append((k2, 0))
        libres.setdefault(pts[-1], []).append((k2, 1))
    roles = [s[1] for s in segs]
    pris = [False] * len(segs)
    anneaux = []
    for k2 in range(len(segs)):
        if pris[k2]: continue
        pris[k2] = True
        pts, role = segs[k2]
        ring = list(pts); rrole = [role]
        while True:
            if ring[0] == ring[-1] and len(ring) > 3:
                break
            b = ring[-1]
            cand = None
            for (k3, e) in libres.get(b, []):
                if not pris[k3]:
                    cand = (k3, e); break
            if cand is None:
                if ring[0] == ring[-1]: break
                log['ouverts'] = log.get('ouverts', 0) + 1
                ring = None; break
            k3, e = cand; pris[k3] = True
            p3, r3 = segs[k3]
            if e == 0:
                ring = ring + p3[1:]
            else:
                ring = ring + [p3[q] for q in range(len(p3) - 2, -1, -1)]
            rrole.append(r3)
        if ring and len(ring) > 3 and ring[0] == ring[-1]:
            anneaux.append((ring[:-1], rrole))
    return anneaux


MAXSHARD = 2500000


def dedans(ring, ref_rings, seuil=2):
    """vrai si l'anneau semble a l'interieur des anneaux de reference"""
    hits = 0
    step = max(1, len(ring) // 7)
    for k in range(0, len(ring), step):
        p = ring[k]
        if any(point_dans(p, rg) for rg in ref_rings):
            hits += 1
    return hits >= seuil


def cmd_final(XX):
    rels = jload(XX, 'rels.json', [])
    ways = jload(XX, 'ways.json', {})
    nds = jload(XX, 'nodes.json', {})
    lvls = niveaux(XX)
    cconf = conf(XX)
    log = {'incompletes': 0, 'hors_pays': 0}
    zones = {lv: [] for lv in lvls}
    candidats = {lv: [] for lv in lvls}
    for r in rels:
        lv = r['lvl']
        if lv not in zones:
            continue
        av = log.get('ways_manquantes', 0)
        av2 = log.get('nodes_manquants', 0)
        ao = log.get('ouverts', 0)
        anneaux = chain(r['mem'], ways, nds, log)
        complet = (log.get('ways_manquantes', 0) == av and
                   log.get('nodes_manquants', 0) == av2 and
                   log.get('ouverts', 0) == ao and bool(anneaux))
        if not complet:
            log['incompletes'] += 1
            continue
        byrole = {}
        for ring, rrole in anneaux:
            outer = any(rr in ('outer', '') for rr in rrole)
            if not any(rr in ('outer', 'inner', '') for rr in rrole):
                outer = True
            byrole.setdefault('outer' if outer else 'inner', []).append(ring)
        outs = sorted(byrole.get('outer', []), key=lambda rg: -abs(aire(rg)))
        inns = byrole.get('inner', [])
        if not outs:
            tt = sorted([rg for rg, _ in anneaux], key=lambda rg: -abs(aire(rg)))
            outs = tt[:1]
            inns = tt[1:]
        polys = []
        for out in outs:
            holes = [h for h in inns if point_dans(h[0], out)]
            polys.append([out] + holes)
        for h in inns:
            if not any(point_dans(h[0], o) for o in outs):
                polys.append([h])
        if not polys:
            continue
        candidats[lv].append({'id': r['id'], 'nom': r['nom'], 'g': polys})
    # pays lui-meme : zone n1 complete la plus grande (ou nom = conf)
    if not candidats.get(2):
        raise SystemExit('aucun contour pays pour ' + XX)
    nomc = cconf.get('nom')
    self_zone = None
    for z in candidats[2]:
        if nomc and z['nom'] == nomc:
            self_zone = z
    if self_zone is None:
        self_zone = max(candidats[2], key=lambda z: sum(abs(aire(poly[0])) for poly in z['g']))
    zones[2] = [self_zone]
    ref_rings = [poly[0] for poly in self_zone['g']]
    for lv in lvls:
        if lv == 2:
            continue
        for z in candidats[lv]:
            out0 = max(z['g'], key=lambda poly: abs(aire(poly[0])))[0]
            if dedans(out0, ref_rings):
                zones[lv].append(z)
            else:
                log['hors_pays'] += 1
    # ecriture packages (shards <= MAXSHARD, une zone par ligne)
    os.makedirs(OUT, exist_ok=True)
    for gr, lv in enumerate(lvls):
        nn = 'n%d' % (gr + 1)
        zs = zones[lv]
        shard = 0
        buf = []
        taille = 0
        entete0 = ("window.__OSMREG=window.__OSMREG||{};window.__OSMREG['" + XX +
                   "']=window.__OSMREG['" + XX + "']||{};window.__OSMREG['" + XX + "']." + nn + "=")
        while shard * 1 or True:
            lignes = []
            for z in zs:
                l = json.dumps({'id': z['id'], 'nom': z['nom'],
                                'g': [[enc_anneau(rg) for rg in poly] for poly in z['g']]},
                               ensure_ascii=False, separators=(',', ':'))
                if taille + len(l) > MAXSHARD and lignes:
                    break
                lignes.append(l)
                taille += len(l)
            corps = entete0 if shard == 0 else (
                "window.__OSMREG=window.__OSMREG||{};window.__OSMREG['" + XX + "']=window.__OSMREG['" + XX +
                "']||{};window.__OSMREG['" + XX + "']." + nn + "=(window.__OSMREG['" + XX + "']." + nn + "||[]).concat(")
            corps += '[\n' + ',\n'.join(lignes) + ('\n];' if shard == 0 else '\n);')
            if lv == 2 and shard == 0:
                corps += "\nwindow.__OSMREG['" + XX + "'].c='" + str(cconf.get('cont', '')) + "';"
            nom = ('%s-%s.js' % (XX, nn)) if shard == 0 else ('%s-%s-%d.js' % (XX, nn, shard + 1))
            p = os.path.join(OUT, nom)
            open(p, 'w').write(corps)
            print(p, len(corps), 'octets,', len(lignes), 'zones')
            shard += 1
            if not lignes or len(lignes) >= len(zs):
                break
            zs = zs[len(lignes):]
            taille = 0
    # villes : points dans le contour pays
    vs = jload(XX, 'villes.json', [])
    garder = []
    for v in vs:
        p = (int(round(v[2] * 1e4)), int(round(v[3] * 1e4)))
        if any(point_dans(p, rg) for rg in ref_rings):
            garder.append({'n': v[0], 'p': v[1], 'x': p[0], 'y': p[1]})
    vc = ("window.__OSMREG=window.__OSMREG||{};window.__OSMREG['" + XX + "']=window.__OSMREG['" + XX +
          "']||{};window.__OSMREG['" + XX + "'].villes=")
    vc += json.dumps(garder, ensure_ascii=False, separators=(',', ':')) + ";"
    open(os.path.join(OUT, XX + '-villes.js'), 'w').write(vc)
    print(XX, 'villes:', len(garder))
    print('log:', log)


COMMANDS = {'telecharger': cmd_telecharger, 'rels': cmd_rels, 'ways': cmd_ways,
            'nodes': cmd_nodes, 'villes': cmd_villes, 'final': cmd_final}

if __name__ == '__main__':
    cmd = sys.argv[1]
    XX = sys.argv[2]
    if cmd == 'telecharger':
        cmd_telecharger(XX)
    elif cmd in ('rels', 'ways', 'nodes', 'villes'):
        n = int(sys.argv[3]) if len(sys.argv) > 3 else (1 << 30)
        COMMANDS[cmd](XX, n)
    elif cmd == 'final':
        cmd_final(XX)
    else:
        raise SystemExit('commande inconnue ' + cmd)
