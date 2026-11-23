"""Parseur PBF pur Python (aucune dépendance externe).
Format OSM PBF : blocs « OSMHeader » / « OSMData » (PrimitiveBlock, zlib).
Pièges corrigés (vérifiés contre l'API OSM) :
  - Way.refs = champ 8, deltas zigzag
  - Relation : memids champ 9 zigzag, roles_sid champ 8, types champ 10
  - DenseNodes : id champ 1, lat champ 8, lon champ 9, deltas sint64 TOUS en ZIGZAG
"""
import struct
import zlib


def _varint(buf, i):
    r = 0; s = 0
    while True:
        b = buf[i]; i += 1
        r |= (b & 0x7f) << s
        if not (b & 0x80):
            return r, i
        s += 7


def _packed(buf, i, end):
    out = []
    while i < end:
        v, i = _varint(buf, i)
        out.append(v)
    return out


def _zigzag(v):
    return (v >> 1) ^ -(v & 1)


def _fields(buf):
    """itérateur (numéro, wiretype, contenu) sur un message protobuf"""
    i = 0; n = len(buf)
    while i < n:
        key, i = _varint(buf, i)
        f = key >> 3; wt = key & 7
        if wt == 0:
            c, i = _varint(buf, i)
        elif wt == 2:
            ln, i = _varint(buf, i)
            c = buf[i:i+ln]; i += ln
        elif wt == 5:
            c = buf[i:i+4]; i += 4
        elif wt == 1:
            c = buf[i:i+8]; i += 8
        else:
            raise ValueError('wiretype %d' % wt)
        yield f, wt, c


def blocs(path):
    """génère (type, data_décompressé) pour chaque bloc du fichier PBF"""
    f = open(path, 'rb')
    while True:
        head = f.read(4)
        if len(head) < 4: return
        (ln,) = struct.unpack('>i', head)
        bh = f.read(ln)
        typ = None; dsz = None
        for f_, wt, c in _fields(bh):
            if f_ == 1 and wt == 2: typ = c.decode('latin1')
            elif f_ == 3 and wt == 0: dsz = c
        blob = f.read(dsz)
        raw = None; zdata = None
        for f_, wt, c in _fields(blob):
            if f_ == 1 and wt == 2: raw = c
            elif f_ == 3 and wt == 2: zdata = c
        data = raw if raw is not None else zlib.decompress(zdata)
        yield typ, data


class Bloc:
    __slots__ = ('strings', 'gran', 'lat0', 'lon0', '_groups')

    def __init__(self, data):
        self.strings = []; self.gran = 100; self.lat0 = 0; self.lon0 = 0
        self._groups = []
        for f, wt, c in _fields(data):
            if f == 1 and wt == 2:
                st = []
                for f2, wt2, s in _fields(c):
                    if f2 == 1: st.append(s)
                self.strings = st
            elif f == 2 and wt == 2: self._groups.append(c)
            elif f == 17: self.gran = c
            elif f == 19: self.lat0 = c
            elif f == 20: self.lon0 = c

    def groupes_types(self):
        """itérateur (groupe, has_dense, has_ways, has_rels)"""
        for g in self._groups:
            has = []
            for f, wt, c in _fields(g):
                if f in (1, 2, 3, 4): has.append(f)
            yield g, 2 in has, 3 in has, 4 in has

    def dense_brut(self, g):
        """(ids[], lats[], lons[]) listes zigzag DÉJÀ décodées (deltas)."""
        for f, wt, c in _fields(g):
            if f != 2 or wt != 2: continue
            raw = {}
            for f2, wt2, c2 in _fields(c):
                raw[f2] = c2
            if 1 not in raw: return None
            ids = [_zigzag(x) for x in _packed(raw[1], 0, len(raw[1]))]
            lats = [_zigzag(x) for x in _packed(raw[8], 0, len(raw[8]))] if 8 in raw else []
            lons = [_zigzag(x) for x in _packed(raw[9], 0, len(raw[9]))] if 9 in raw else []
            return (ids, lats, lons)
        return None

    def ways(self, g, filtre=None):
        """itérateur (id, refs[])"""
        for f, wt, c in _fields(g):
            if f != 3 or wt != 2: continue
            wid = 0; refs = None
            for f2, wt2, c2 in _fields(c):
                if f2 == 1 and wt2 == 0:
                    wid = c2
                elif f2 == 8 and wt2 == 2:
                    r = 0; rr = []
                    for d in _packed(c2, 0, len(c2)):
                        r += _zigzag(d); rr.append(r)
                    refs = rr
            if refs is None: continue
            if filtre is not None and not filtre(wid): continue
            yield wid, refs

    def relations(self, g, filtre=None):
        """itérateur {id, tags, members:[(type, ref, role)]}"""
        st = self.strings
        for f, wt, c in _fields(g):
            if f != 4 or wt != 2: continue
            rid = 0; keys = []; vals = []; roles = []; memids = []; types = []
            skip = False
            for f2, wt2, c2 in _fields(c):
                if f2 == 1 and wt2 == 0:
                    rid = c2
                    if filtre is not None and not filtre(rid): skip = True
                elif f2 == 2 and wt2 == 2: keys = _packed(c2, 0, len(c2))
                elif f2 == 3 and wt2 == 2: vals = _packed(c2, 0, len(c2))
                elif f2 == 8 and wt2 == 2: roles = _packed(c2, 0, len(c2))
                elif f2 == 9 and wt2 == 2:
                    r = 0
                    for d in _packed(c2, 0, len(c2)):
                        r += _zigzag(d); memids.append(r)
                elif f2 == 10 and wt2 == 2: types = _packed(c2, 0, len(c2))
            if skip: continue
            tags = {}
            for kk in range(len(keys)):
                tags[st[keys[kk]].decode('utf-8', 'replace')] = st[vals[kk]].decode('utf-8', 'replace')
            members = []
            for m in range(len(memids)):
                t = ('node', 'way', 'rel')[types[m]] if types[m] < 3 else '?'
                role = st[roles[m]].decode('utf-8', 'replace') if roles[m] < len(st) else ''
                members.append((t, memids[m], role))
            yield {'id': rid, 'tags': tags, 'members': members}

    def VilleNodes(self):
        """nodes « place=city/town » du bloc : (name, place, lon, lat)"""
        villes = []
        st = self.strings
        for g, hd, hw, hr in self.groupes_types():
            if not hd: continue
            for f, wt, c in _fields(g):
                if f != 2 or wt != 2: continue
                raw = {}
                for f2, wt2, c2 in _fields(c):
                    raw[f2] = c2
                if 1 not in raw or 10 not in raw: continue
                kv = _packed(raw[10], 0, len(raw[10]))
                lats = [_zigzag(x) for x in _packed(raw[8], 0, len(raw[8]))] if 8 in raw else []
                lons = [_zigzag(x) for x in _packed(raw[9], 0, len(raw[9]))] if 9 in raw else []
                if not lats or not lons: continue
                nb = max(len(lats), len(lons))
                abs_lat = []; abs_lon = []
                la = 0; lo2 = 0
                for k in range(nb):
                    la += lats[k] if k < len(lats) else 0
                    lo2 += lons[k] if k < len(lons) else 0
                    abs_lat.append(la); abs_lon.append(lo2)
                cur = {}; nid = 0; k = 0
                while k < len(kv):
                    kk = kv[k]
                    if kk == 0:
                        if cur.get('place') in ('city', 'town') and cur.get('name') and nid < nb:
                            villes.append((cur['name'], cur['place'],
                                           1e-9 * (self.lon0 + self.gran * abs_lon[nid]),
                                           1e-9 * (self.lat0 + self.gran * abs_lat[nid])))
                        nid += 1; cur = {}
                    else:
                        if k + 1 >= len(kv): break
                        cur[st[kk].decode('utf-8', 'replace')] = st[kv[k+1]].decode('utf-8', 'replace')
                        k += 1
                    k += 1
        return villes
