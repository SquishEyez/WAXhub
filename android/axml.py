"""Minimal Android binary XML (AXML) reader/patcher.
usage: axml.py dump <AndroidManifest.xml>
       axml.py patch <in> <out> versionCode=3 versionName=2.1 [debuggable=false] ...
Patches attribute values in place (int/bool), and string values by rewriting
the string pool entry (UTF-16 or UTF-8, same chunk layout rebuilt)."""
import struct, sys

def u16(b,o): return struct.unpack_from('<H',b,o)[0]
def u32(b,o): return struct.unpack_from('<I',b,o)[0]

def read_pool(b, off):
    typ, hsz, size = struct.unpack_from('<HHI', b, off)
    count, styles, flags, sstart, stystart = struct.unpack_from('<IIIII', b, off+8)
    utf8 = bool(flags & 0x100)
    offs = [u32(b, off+hsz+4*i) for i in range(count)]
    base = off + sstart
    strs=[]
    for so in offs:
        p = base+so
        if utf8:
            n = b[p]; p+=1
            if n & 0x80: p+=1
            n = b[p]; p+=1
            if n & 0x80: n = ((n&0x7f)<<8)|b[p]; p+=1
            strs.append(b[p:p+n].decode('utf-8','replace'))
        else:
            n = u16(b,p); p+=2
            if n & 0x8000: n = ((n&0x7fff)<<16)|u16(b,p); p+=2
            strs.append(b[p:p+2*n].decode('utf-16le','replace'))
    return dict(off=off,size=size,count=count,styles=styles,flags=flags,sstart=sstart,stystart=stystart,hsz=hsz,utf8=utf8,strs=strs,offs=offs)

def build_pool(pool, strs):
    utf8 = pool['utf8']
    data = bytearray(); offs=[]
    for s in strs:
        offs.append(len(data))
        if utf8:
            e = s.encode('utf-8'); n=len(s)
            def ln(v): return bytes([v]) if v<0x80 else bytes([0x80|(v>>8), v&0xff])
            data += ln(n)+ln(len(e))+e+b'\0'
        else:
            e = s.encode('utf-16le'); n=len(s)
            data += (struct.pack('<H',n) if n<0x8000 else struct.pack('<HH',0x8000|(n>>16),n&0xffff)) + e + b'\0\0'
    while len(data)%4: data+=b'\0'
    assert pool['styles']==0, "style spans not supported"
    hsz=pool['hsz']
    sstart = hsz + 4*len(strs)
    size = sstart + len(data)
    hdr = struct.pack('<HHI', 0x0001, hsz, size) + struct.pack('<IIIII', len(strs), 0, pool['flags'], sstart, 0)
    hdr += b'\0'*(hsz-len(hdr))
    return hdr + b''.join(struct.pack('<I',o) for o in offs) + bytes(data)

def walk(b):
    """yield (tagname, attrs[(name, ofs_of_typed_value, dtype, data, rawidx)])"""
    pool = read_pool(b, 8)
    S = pool['strs']
    o = 8 + pool['size']
    out=[]
    while o < len(b):
        typ, hsz, size = struct.unpack_from('<HHI', b, o)
        if typ == 0x0102:  # START_ELEMENT
            name = S[u32(b,o+20)]
            astart, asize, acount = u16(b,o+24), u16(b,o+26), u16(b,o+28)
            attrs=[]
            for i in range(acount):
                a = o+16+astart+i*asize
                ns, nm, raw = struct.unpack_from('<iIi', b, a)
                dtype = b[a+15]; data = u32(b,a+16)
                attrs.append((S[nm], a, dtype, data, raw))
            out.append((name, attrs))
        o += size
    return pool, out

def fmt(pool, dtype, data, raw):
    S=pool['strs']
    if dtype==0x03: return repr(S[data])
    if dtype==0x12: return 'true' if data else 'false'
    if dtype in (0x10,0x11): return str(data)
    if dtype==0x01: return '@0x%08x'%data
    return 'type%d:%d'%(dtype,data)

if __name__=='__main__':
    cmd=sys.argv[1]; b=bytearray(open(sys.argv[2],'rb').read())
    pool, els = walk(b)
    if cmd=='dump':
        for name, attrs in els:
            if name in ('manifest','application','uses-sdk','activity','provider','service','receiver','uses-permission','intent-filter','data','meta-data'):
                print(name, ' '.join(f'{n}={fmt(pool,d,v,r)}' for n,_,d,v,r in attrs))
    elif cmd=='patch':
        want=dict(kv.split('=',1) for kv in sys.argv[4:])
        newstrs=list(pool['strs'])
        for name, attrs in els:
            for n,a,d,v,r in attrs:
                if n in want and name in ('manifest','application'):
                    val=want[n]
                    if d==0x03:
                        idx=v
                        newstrs[idx]=val  # string value: raw and data both point to idx
                    elif d==0x12:
                        struct.pack_into('<I',b,a+16, 0xffffffff if val=='true' else 0)
                    elif d in (0x10,0x11):
                        struct.pack_into('<I',b,a+16,int(val))
                    else: raise SystemExit(f'unsupported type for {n}')
                    print('patched', name, n, '->', val)
        newpool = build_pool(pool, newstrs)
        rest = b[8+pool['size']:]
        total = 8+len(newpool)+len(rest)
        outb = struct.pack('<HHI', 0x0003, 8, total) + newpool + bytes(rest)
        open(sys.argv[3],'wb').write(outb)
