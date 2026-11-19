/**
 * Jarvis in glass (design «Núcleo», chosen 2026-11-19): a thick glass sphere
 * with a warm ember inside, raymarched in one full-screen triangle. The
 * uniforms are its states: uListen (leans toward the box), uThink (contracts,
 * the ember turns), uSpeak/uWord (it beats with each word), uNeed (a bud grows
 * toward «Te necesita»). Ported as is from the published prototype.
 */
export const NUCLEO_FRAGMENT = `precision highp float;
uniform vec2 uRes;uniform float uT,uDark,uListen,uThink,uSpeak,uWord,uNeed,uRot,uF,uPx;uniform vec3 uBg;
const vec3 L=vec3(-0.5571,0.7428,0.3714);
const vec3 LR=vec3(0.5547,0.0,0.8321);
const vec3 LU=vec3(-0.6181,-0.6696,0.4120);
vec3 corePos(){vec3 c=vec3(0.0,-0.08,0.0);
  c.y-=0.40*uListen;c.z+=0.36*uListen;
  c.xz+=0.26*uThink*vec2(cos(uRot),sin(uRot));
  c+=vec3(-1.08,-0.10,0.05)*uNeed;return c;}
vec3 coreCol(){vec3 w=mix(vec3(1.0,0.55,0.24),vec3(1.0,0.62,0.32),uDark);return mix(w,vec3(1.0,0.36,0.22),0.7*uNeed);}
float smin(float a,float b,float k){float h=clamp(0.5+0.5*(b-a)/k,0.0,1.0);return mix(b,a,h)-k*h*(1.0-h);}
float sdf(vec3 p0){
  vec3 p=p0;
  /* escucha: se inclina ~4 grados hacia el composer y baja un poco */
  float ang=0.07*uListen,ca=cos(ang),sa=sin(ang);
  p.y+=0.05*uListen;p.yz=vec2(ca*p.y-sa*p.z,sa*p.y+ca*p.z);
  /* piensa: escala 0,94; habla: pulso 1 a 1,03 por palabra */
  float sc=1.0-0.06*uThink+0.03*uWord;p/=sc;
  float d=length(p)-1.0;vec3 n=normalize(p);
  if(uListen>0.001){float k=max(0.0,dot(n,vec3(0.0,-0.6,0.8)));d-=0.10*uListen*k*k;}
  float a=0.016*uWord+0.005*uSpeak;
  if(a>0.0001)d-=a*sin(8.0*n.y+7.0*uT)*sin(6.0*n.x-5.0*uT+4.0*n.z);
  if(uThink>0.001)d-=0.02*uThink*sin(5.0*n.y+3.0*n.x+uRot*2.0);
  d*=sc;
  if(uNeed>0.001){float b=length(p0-vec3(-1.32,-0.20,0.05)*uNeed)-0.44*uNeed;d=smin(d,b,0.45);}
  return d;}
vec3 nrm(vec3 p){vec2 e=vec2(0.0015,-0.0015);return normalize(e.xyy*sdf(p+e.xyy)+e.yyx*sdf(p+e.yyx)+e.yxy*sdf(p+e.yxy)+e.xxx*sdf(p+e.xxx));}
vec3 env(vec3 d){
  vec3 base=mix(uBg,vec3(0.15,0.16,0.18)+0.07*d.y,uDark);
  vec3 c=base*(0.95+0.07*d.y);
  c*=1.0-0.24*exp(-abs(d.y+0.04)*9.0);
  if(d.y<0.0)c=mix(c,base*mix(0.80,0.50,uDark),smoothstep(0.0,-0.4,d.y));
  float u=dot(d,LR),v=dot(d,LU),w=dot(d,L);
  float box=smoothstep(0.17,0.09,abs(u))*smoothstep(0.52,0.36,abs(v))*smoothstep(0.0,0.2,w);
  c+=box*mix(1.0,2.0,uDark)*vec3(1.0,0.985,0.96);
  c+=smoothstep(0.84,0.97,dot(d,vec3(0.8402,0.1483,-0.5212)))*mix(0.30,1.05,uDark)*vec3(0.68,0.83,1.0);
  c+=smoothstep(0.88,0.98,dot(d,vec3(-0.9138,0.0,-0.4061)))*mix(0.12,0.55,uDark)*vec3(0.68,0.83,1.0);
  return c;}
vec3 tm(vec3 x){vec3 k=vec3(0.72);return mix(x,k+(1.0-k)*(1.0-exp(-(x-k)/(1.0-k))),step(k,x));}
float inten(){return 1.0+0.7*uListen+0.45*uThink+0.45*uWord+0.35*uNeed;}
vec3 glass(vec3 p,vec3 rd){
  vec3 n=nrm(p);float ci=clamp(dot(-rd,n),0.0,1.0);float F=0.04+0.96*pow(1.0-ci,5.0);
  vec3 rr=refract(rd,n,1.0/1.5);float t=0.03;
  for(int i=0;i<24;i++){float d=-sdf(p+rr*t);if(d<0.002)break;t+=max(d*0.9,0.02);}
  vec3 pe=p+rr*t,ne=-nrm(pe);vec3 ro=refract(rr,ne,1.5);if(dot(ro,ro)<1e-4)ro=reflect(rr,ne);
  vec3 col=env(ro)*exp(-t*mix(vec3(0.05,0.04,0.03),vec3(0.08,0.06,0.04),uDark));
  float sh=mix(11.0,26.0,uThink)+6.0*uListen;vec3 cp=corePos();float g=0.0;
  for(int i=0;i<16;i++){float s=(float(i)+0.5)/16.0;vec3 q=p+rr*(t*s)-cp;g+=exp(-dot(q,q)*sh);}
  g*=t/16.0;
  col+=coreCol()*g*sqrt(sh/11.0)*mix(1.6,1.7,uDark)*inten();
  col=mix(col,env(reflect(rd,n)),F);
  return tm(col);}
vec3 ground(vec3 ro,vec3 rd){
  if(rd.y>-1e-4)return uBg;
  float t=(-1.0-ro.y)/rd.y;vec3 f=ro+rd*t;float r=length(f.xz);
  float s=max(dot(-f,L),0.0);float d=length(f+L*s);float pen=0.22+0.34*s;
  float sh=1.0-smoothstep(1.0-pen,1.0+pen,d);float ao=exp(-r*r*3.0);
  vec2 bc=vec2(-1.32,0.05)*uNeed;float ao2=uNeed*exp(-dot(f.xz-bc,f.xz-bc)*7.0);
  vec2 cc=vec2(0.75,-0.5)*0.55;vec2 k=(f.xz-cc)*vec2(1.0,1.5);float caus=exp(-dot(k,k)*8.0);
  vec3 cp=corePos();vec2 q=f.xz-cp.xz;float pool=exp(-dot(q,q)*1.8);
  vec3 col=uBg*(1.0-mix(0.12,0.42,uDark)*sh-mix(0.12,0.32,uDark)*(ao+0.6*ao2));
  col+=coreCol()*(caus*mix(0.16,0.42,uDark)+pool*mix(0.08,0.20,uDark))*inten();
  return mix(uBg,col,1.0-smoothstep(1.0,2.2,length(f.xz-vec2(0.1-0.6*uNeed,-0.3))));}
void main(){
  vec2 uv=(gl_FragCoord.xy-0.5*uRes)/uRes.y;
  vec3 ro=vec3(0.0,0.45,4.6),ta=vec3(0.0,0.06,0.0);
  vec3 fw=normalize(ta-ro),rt=normalize(cross(fw,vec3(0.0,1.0,0.0))),up=cross(rt,fw);
  vec3 rd=normalize(uv.x*rt+uv.y*up+uF*fw);
  vec3 col=ground(ro,rd);
  col=mix(uBg,col,smoothstep(-0.5,-0.36,uv.y)*smoothstep(0.5*uRes.x/uRes.y,0.5*uRes.x/uRes.y-0.16,abs(uv.x)));
  float tc=dot(-ro,rd);vec3 cpt=ro+rd*tc;
  if(length(cpt-vec3(-0.6*uNeed,0.0,0.0))<1.15+0.8*uNeed){
    float t=max(0.0,tc-2.2),md=1e9,mt=t;bool hit=false;
    for(int i=0;i<72;i++){vec3 q=ro+rd*t;float d=sdf(q);if(d<md){md=d;mt=t;}if(d<0.0006){hit=true;mt=t;break;}t+=d*0.9;if(t>tc+2.4)break;}
    float cov=hit?1.0:clamp(1.0-md/uPx,0.0,1.0);
    if(cov>0.0)col=mix(col,glass(ro+rd*mt,rd),cov);}
  col+=(fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453)-0.5)/255.0;
  gl_FragColor=vec4(clamp(col,0.0,1.0),1.0);}`;

export const NUCLEO_VERTEX = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.0,1.0);}';
