import math, random, time
random.seed(7)
W=402.0
def merc(lat): return math.log(math.tan(math.pi/4+lat*math.pi/360))*180/math.pi
hubs=[(25.04,121.54,0.05,0.45),(24.80,120.97,0.04,0.1),(24.15,120.67,0.05,0.15),(22.63,120.30,0.05,0.15),(23.0,120.2,0.04,0.08),(24.0,121.6,0.05,0.07)]
def gen(n):
    pts=[]
    for i in range(n):
        r=random.random();acc=0
        for la,lo,s,w in hubs:
            acc+=w
            if r<=acc: break
        pts.append((i,la+random.gauss(0,s),lo+random.gauss(0,s*1.2)))
    return pts
def bw(n): return max(46, 9+19+2+10.5*len(str(n))+9+2)
def scr(p,c,span):
    s=W/span
    return ((p[2]-c[1])*s+W/2, -(merc(p[1])-merc(c[0]))*s+437)
def pinr(x,y): return (x-22,y-51,x+22,y)
def bubr(x,y,n): w=bw(n); return (x-w/2,y-23,x+w/2,y+23)
def inter(a,b,g=0): return a[0]-g<b[2] and b[0]-g<a[2] and a[1]-g<b[3] and b[1]-g<a[3]
def cells(pts,span):
    cell=2**math.ceil(math.log2(span/W*44)); d={}
    for p in pts: d.setdefault((math.floor(p[2]/cell),math.floor(merc(p[1])/cell)),[]).append(p)
    return d
def old(pts,c,span):
    d=cells(pts,span); groups=[g for g in d.values() if len(g)>=2]; random.shuffle(groups)
    singles=[g[0] for g in d.values() if len(g)==1]
    P={p[0]:scr(p,c,span) for p in pts}
    ctr=lambda g:(sum(P[p[0]][0] for p in g)/len(g),sum(P[p[0]][1] for p in g)/len(g))
    i=0
    while i<len(groups):
        hit=False;j=i+1
        while j<len(groups):
            a=ctr(groups[i]);b=ctr(groups[j])
            if math.hypot(a[0]-b[0],a[1]-b[1])<46: groups[i]+=groups[j];groups.pop(j);hit=True
            else:j+=1
        if not hit:i+=1
    boxes=[bubr(*ctr(g),len(g)) for g in groups]+[pinr(*P[p[0]]) for p in singles]
    return boxes,len(groups)
def new(pts,c,span,g=4):
    d=cells(pts,span);P={p[0]:scr(p,c,span) for p in pts}
    def shape(n):
        k=len(n['ps']);x=n['sx']/k;y=n['sy']/k
        n['c']=(x,y);n['box']=pinr(x,y) if k==1 else bubr(x,y,k)
    nodes=[]
    for key,gr in d.items():
        n={'ps':gr,'sx':sum(P[p[0]][0] for p in gr),'sy':sum(P[p[0]][1] for p in gr),'key':key};shape(n);nodes.append(n)
    nodes.sort(key=lambda n:(-len(n['ps']),n['key']))
    work=list(range(len(nodes)))[::-1];checks=0
    while work:
        i=work.pop();a=nodes[i]
        if a is None: continue
        best=-1;bd=1e18
        for j,b in enumerate(nodes):
            if j==i or b is None: continue
            checks+=1
            if inter(a['box'],b['box'],g):
                dd=math.hypot(a['c'][0]-b['c'][0],a['c'][1]-b['c'][1])
                if dd<bd:bd=dd;best=j
        if best<0: continue
        b=nodes[best];a['ps']+=b['ps'];a['sx']+=b['sx'];a['sy']+=b['sy'];shape(a);nodes[best]=None;work.append(i)
    alive=[n for n in nodes if n]
    return [n['box'] for n in alive],sum(1 for n in alive if len(n['ps'])>1),checks
def overlaps(boxes,g=0):
    vis=[b for b in boxes if b[2]>0 and b[0]<W and b[3]>0 and b[1]<874]
    return sum(1 for i in range(len(vis)) for j in range(i+1,len(vis)) if inter(vis[i],vis[j],g))
for N in (100,300):
    pts=gen(N)
    for name,c,span in [("全台",(23.7,120.9),3.6),("北部",(24.95,121.3),1.0),("台北市",(25.04,121.54),0.16)]:
        ob,ng=old(pts,c,span); t=time.perf_counter(); nb,nn,ch=new(pts,c,span); dt=(time.perf_counter()-t)*1000
        print(N,name,"old overlaps",overlaps(ob),"bubbles",ng,"| new overlaps",overlaps(nb),"bubbles",nn,"items",len(nb),"checks",ch,"py ms %.1f"%dt)
print("--- old breakdown (bb=泡泡對泡泡, bp=泡泡對單根, pp=單根對單根; 只算畫面內)")
def kind(b): return 'b' if (b[3]-b[1])==46 else 'p'
for N in (100,300):
    random.seed(7); pts=gen(N)
    for name,c,span in [("全台",(23.7,120.9),3.6),("北部",(24.95,121.3),1.0),("台北市",(25.04,121.54),0.16)]:
        cnt={}
        for trial in range(20):
            ob,_=old(pts,c,span)
            vis=[b for b in ob if b[2]>0 and b[0]<W and b[3]>0 and b[1]<874]
            for i in range(len(vis)):
                for j in range(i+1,len(vis)):
                    if inter(vis[i],vis[j]):
                        k=''.join(sorted(kind(vis[i])+kind(vis[j]))); cnt[k]=cnt.get(k,0)+1
        print(N,name,{k:v/20 for k,v in cnt.items()})
